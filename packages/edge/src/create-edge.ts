import { type CompiledPolicy, parseRules } from '@nxgt/security/policy';
import { logger } from '@nxgt/shared-logging';
import { assertEdgePolicy } from './assert-policy';
import { decide, unavailableDecision } from './decide';
import { errorResponse, forward } from './forwarder';
import { type RoutedRequest, route } from './router';
import {
	type EdgeRoutes,
	expandVariables,
	RoutesSchema,
} from './routes.schema';
import {
	type Authenticator,
	AuthorityUnavailable,
	type EdgeDecision,
	type EdgeMode,
} from './types';

/**
 * What a mirror-mode request produced: the decision the edge would have made,
 * beside the answer the edge it mirrors actually gave.
 */
export interface MirrorRecord extends EdgeDecision {
	upstreamStatus: number;
	verdict: 'agree' | 'differ' | 'error';
	/** Set when the edge itself failed. In mirror mode that is not fatal. */
	error?: string;
}

export interface EdgeConfig {
	/** `mirror` decides and logs; `enforce` decides and acts. */
	mode: EdgeMode;
	/** The routing table, already parsed from YAML/JSON. */
	routes: unknown;
	/** The rules document, already parsed from YAML/JSON. */
	rules: unknown;
	/**
	 * Tried in order, first non-null winning. One entry today. The list is
	 * what keeps this package free of any particular identity provider — the
	 * Ory one lives behind its own entrypoint and is the only thing that
	 * imports `stx-sdk`.
	 */
	authenticators: readonly Authenticator[];
	/**
	 * Where EVERY request goes in `mirror` mode — the edge being compared
	 * against, which still answers. Required in that mode and refused in
	 * `enforce`, so switching over is one variable and cannot be half done.
	 */
	mirrorUpstream?: string;
	/** For `${VAR}` in the routing table. Defaults to `process.env`. */
	env?: Record<string, string | undefined>;
	/** The upstream transport. Injected in tests; defaults to global fetch. */
	fetch?: typeof globalThis.fetch;
	/** Every decision, for a harness that wants them structured. */
	onDecision?: (record: EdgeDecision | MirrorRecord) => void;
}

export interface Edge {
	/** A `fetch` handler — hand it to `Bun.serve`, or call it in a test. */
	fetch(request: Request, clientAddress?: string): Promise<Response>;
	/** The parsed routing table, for a health endpoint or a startup log. */
	routes: EdgeRoutes;
	policy: CompiledPolicy;
}

/**
 * The edge: authenticate, decide with the parc's own rules engine, and either
 * refuse or forward with a signed assertion.
 *
 * It is a plain `fetch` handler rather than a framework app on purpose. A
 * proxy's job is to touch the request as little as possible, and the one
 * middleware chain that would be tempting here — `policyGuard` — clones and
 * buffers every JSON body to make a decision the edge is not allowed to base
 * on a body anyway.
 */
export function createEdge(config: EdgeConfig): Edge {
	if (config.mode === 'mirror' && !config.mirrorUpstream) {
		throw new Error(
			'`mirror` mode needs a `mirrorUpstream` — the edge it is compared ' +
				'against, which is still the one answering. Without it the edge ' +
				'would be enforcing while claiming not to.',
		);
	}
	if (config.mode === 'enforce' && config.mirrorUpstream) {
		throw new Error(
			'`enforce` mode must not have a `mirrorUpstream`. Leaving it set is ' +
				'how a switchover ends up sending every request through the edge it ' +
				'was supposed to replace.',
		);
	}

	const routes = RoutesSchema.parse(
		JSON.parse(expandVariables(JSON.stringify(config.routes), config.env)),
	);
	const policy = parseRules(config.rules);
	assertEdgePolicy(policy, routes);

	const record = (entry: EdgeDecision | MirrorRecord) => {
		config.onDecision?.(entry);
		log(entry);
	};

	async function handle(
		request: Request,
		clientAddress?: string,
	): Promise<Response> {
		const url = new URL(request.url);
		const routed = route(routes, url.host, url.pathname);

		if (config.mode === 'mirror') {
			return mirror(request, routed, clientAddress);
		}

		let decided: Awaited<ReturnType<typeof decide>>;
		try {
			decided = await decide(policy, config.authenticators, request, routed);
		} catch (error) {
			if (!(error instanceof AuthorityUnavailable)) throw error;
			// The reason this edge exists. Oathkeeper answers 403 here, which
			// a caller cannot tell from a real refusal and a UI reads as "you
			// may not", when the truth is "nobody could ask".
			record(unavailableDecision(error, request, routed));
			return errorResponse(
				503,
				'errors.service-unavailable',
				`${error.authority} could not answer`,
				error.cause,
			);
		}

		record(decided.decision);

		if (decided.decision.status >= 400) {
			return refusal(decided.decision);
		}

		if (!routed) {
			// Allowed by the rules document but routable nowhere. `/health` is
			// the intended case, and the edge answers it itself rather than
			// leaving it a 404 the way Oathkeeper does.
			return edgeHealth(url.pathname);
		}

		return forward(request, routed, {
			clientAddress,
			assertion: await decided.identity?.assert(),
			fetch: config.fetch,
		});
	}

	/**
	 * Decide, remember, and forward unchanged.
	 *
	 * Nothing here can refuse and nothing here can throw: an edge under
	 * evaluation must not be able to break what already works, so its own
	 * failure is a log line and a passed-through request.
	 */
	async function mirror(
		request: Request,
		routed: RoutedRequest | null,
		clientAddress?: string,
	): Promise<Response> {
		const url = new URL(request.url);

		let decision: EdgeDecision | null = null;
		let failure: string | undefined;
		try {
			const decided = await decide(
				policy,
				config.authenticators,
				request,
				routed,
			);
			decision = decided.decision;
		} catch (error) {
			failure = error instanceof Error ? error.message : String(error);
			decision =
				error instanceof AuthorityUnavailable
					? unavailableDecision(error, request, routed)
					: null;
		}

		// Every request goes to the mirrored edge, routed or not, with its
		// own credential intact — that edge has to authenticate it too, and it
		// cannot do that with an assertion of ours.
		const response = await forward(
			request,
			{
				app: {
					name: routed?.app.name ?? 'unrouted',
					match: { prefix: '/' },
					upstream: config.mirrorUpstream as string,
					stripPrefix: false,
				},
				upstreamPath: url.pathname,
			},
			{ clientAddress, fetch: config.fetch },
		);

		record({
			...(decision ?? {
				method: request.method,
				host: url.host,
				path: url.pathname,
				app: routed?.app.name ?? null,
				authenticator: null,
				subject: null,
				decision: 'NOT_APPLICABLE',
				reason: 'the edge failed to decide',
				status: 0,
			}),
			upstreamStatus: response.status,
			verdict: failure ? 'error' : verdictOf(decision, response.status),
			...(failure ? { error: failure } : {}),
		});

		return response;
	}

	return { fetch: handle, routes, policy };
}

function refusal(decision: EdgeDecision): Response {
	const message =
		decision.status === 401
			? 'errors.unauthenticated'
			: decision.status === 404
				? 'errors.not-found'
				: 'errors.forbidden';
	return errorResponse(decision.status, message, decision.reason);
}

function edgeHealth(path: string): Response {
	return Response.json({ status: 'ok', path }, { status: 200 });
}

/**
 * Whether the two edges said the same thing.
 *
 * When the edge would answer a status of its own — a refusal, or `/health` —
 * the comparison is exact, because both numbers are then edge decisions.
 *
 * When the edge would FORWARD it is a judgement, and worth being honest about:
 * from outside, a 403 the mirrored edge produced and a 403 the app produced
 * look identical. The refusals an edge is capable of making are the ones worth
 * flagging, so those read as disagreement and anything else — the app's own
 * 404 for a missing bookmark, its 422, its 500 — reads as agreement, because
 * the edge let it through and something behind it answered.
 *
 * The real comparison is the differential harness, which drives a known corpus
 * against a recorded fixture. This verdict is for watching the network path on
 * live traffic.
 */
function verdictOf(
	decision: EdgeDecision | null,
	upstreamStatus: number,
): 'agree' | 'differ' | 'error' {
	if (!decision) return 'error';

	if (decision.status !== 0) {
		return decision.status === upstreamStatus ? 'agree' : 'differ';
	}

	return [401, 403, 503].includes(upstreamStatus) ? 'differ' : 'agree';
}

function log(entry: EdgeDecision | MirrorRecord): void {
	const where = `${entry.method} ${entry.host}${entry.path}`;
	const who = entry.subject
		? `${entry.subject} (${entry.authenticator})`
		: 'anonymous';
	const app = entry.app ?? 'no app';

	if ('verdict' in entry) {
		const line =
			`edge.mirror ${entry.verdict}: ${where} [${app}] ${who} — ` +
			`would ${entry.status || 'forward'}, upstream ${entry.upstreamStatus}` +
			`, ${entry.reason}`;
		if (entry.verdict === 'agree') logger.info(line);
		else logger.warn(entry.error ? `${line} — ${entry.error}` : line);
		return;
	}

	const line = `edge ${entry.decision}: ${where} [${app}] ${who} — ${entry.reason}`;
	if (entry.status >= 500) logger.error(line);
	else if (entry.status >= 400) logger.warn(line);
	else logger.info(line);
}
