import {
	type CompiledPolicy,
	type EvaluateResult,
	evaluateRest,
	isAuthenticated,
} from '@nxgt/security/policy';
import type { RoutedRequest } from './router';
import type {
	Authenticator,
	AuthorityUnavailable,
	EdgeDecision,
	EdgeIdentity,
} from './types';

export interface Decided {
	decision: EdgeDecision;
	/** Present when a caller was resolved — what vouches for them upstream. */
	identity: EdgeIdentity | null;
}

/**
 * The status a decision answers.
 *
 * `0` means "forward" — the edge has nothing to say and the upstream answers.
 * The 401/403 split is the same one every app in the parc makes, for the same
 * reason: a UI re-authenticates on 401 and shows a refusal on 403.
 */
export function statusOf(result: EvaluateResult): number {
	if (result.decision === 'UNAUTHENTICATED') return 401;
	if (result.decision !== 'DENY') return 0;
	return result.denial === 'NOT_FOUND' ? 404 : 403;
}

/**
 * Authenticate, then evaluate. In that order, and never the reverse: the rules
 * document decides about a caller, so there has to be one first.
 *
 * The caller is resolved even for a request no app matches, because a rules
 * document may still name it — `/health` is `public: true`, and a path under
 * `global.unmatched: deny` is answered 401 for an anonymous caller and 403 for
 * a named one, which needs to know which it is.
 */
export async function decide(
	policy: CompiledPolicy,
	authenticators: readonly Authenticator[],
	request: Request,
	routed: RoutedRequest | null,
): Promise<Decided> {
	const url = new URL(request.url);
	const base = {
		method: request.method,
		host: url.host,
		path: url.pathname,
		app: routed?.app.name ?? null,
	};

	let identity: EdgeIdentity | null = null;
	let authenticator: string | null = null;

	for (const candidate of authenticators) {
		// An `AuthorityUnavailable` is NOT caught here. It must reach the top
		// and become a 503: trying the next authenticator would answer
		// "anonymous" for a caller whose authority merely happened to be down,
		// and the request would then be refused as if they had no credential.
		const resolved = await candidate.resolve(request);
		if (resolved) {
			identity = resolved;
			authenticator = candidate.name;
			break;
		}
	}

	const claims = identity?.claims ?? { sub: '' };

	const result = await evaluateRest(
		policy,
		{
			type: 'rest',
			method: request.method,
			path: url.pathname,
			claims,
			req: {
				// The app id, supplied by the router — the ONLY object an edge
				// rule may name. `evaluateRest` lets caller-supplied params win
				// over path captures, so this cannot be shadowed by a wildcard.
				params: routed ? { app: routed.app.name } : {},
				query: Object.fromEntries(url.searchParams),
				headers: Object.fromEntries(request.headers),
				cookies: parseCookies(request.headers.get('cookie')),
				// No body. `assertEdgePolicy` refuses a document that would
				// read one, so nothing here can want it — and an edge that
				// buffers every request body is an edge that does not hold.
			},
		},
		identity?.permissions,
	);

	return {
		identity,
		decision: {
			...base,
			authenticator,
			subject: isAuthenticated(claims) ? (claims.sub ?? null) : null,
			decision: result.decision,
			reason: result.reason,
			status: statusOf(result),
		},
	};
}

/**
 * A 503 for an authority that could not answer — the whole point of the
 * exercise. Ory Oathkeeper's `cookie_session` answers 403 with Kratos down,
 * which is indistinguishable from a real refusal.
 */
export function unavailableDecision(
	error: AuthorityUnavailable,
	request: Request,
	routed: RoutedRequest | null,
): EdgeDecision {
	const url = new URL(request.url);
	return {
		method: request.method,
		host: url.host,
		path: url.pathname,
		app: routed?.app.name ?? null,
		authenticator: error.authority,
		subject: null,
		decision: 'DENY',
		reason: `${error.authority} could not answer`,
		status: 503,
	};
}

function parseCookies(header: string | null): Record<string, string> {
	if (!header) return {};
	const cookies: Record<string, string> = {};
	for (const part of header.split(';')) {
		const index = part.indexOf('=');
		if (index < 1) continue;
		cookies[part.slice(0, index).trim()] = part.slice(index + 1).trim();
	}
	return cookies;
}
