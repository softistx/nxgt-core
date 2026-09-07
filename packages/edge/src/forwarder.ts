import { forwardHeaders, responseHeaders } from './headers';
import type { RoutedRequest } from './router';

export interface ForwardContext {
	clientAddress?: string;
	/** The signed assertion, or absent in `mirror` mode. */
	assertion?: string;
	fetch?: typeof globalThis.fetch;
}

/**
 * Send the request on, and hand the answer back unchanged.
 *
 * The method, the path, the query and the body all travel verbatim. That is
 * worth stating because Oathkeeper does not: its `cookie_session`
 * authenticator has to be pinned to `force_method: GET` so that a `QUERY`
 * request does not reach Kratos as `QUERY /sessions/whoami` and report every
 * caller's credentials as invalid. Here the authenticator makes its own call
 * with its own method, so there is nothing to pin and no trap to fall into.
 */
export async function forward(
	request: Request,
	routed: RoutedRequest,
	context: ForwardContext = {},
): Promise<Response> {
	const incoming = new URL(request.url);
	const upstream = new URL(routed.app.upstream);

	// The upstream's own base path is kept, so an app mounted at
	// `http://host:3008/` and one at `http://host:3008/service` both work.
	upstream.pathname = joinPaths(upstream.pathname, routed.upstreamPath);
	upstream.search = incoming.search;

	const headers = forwardHeaders(request.headers, {
		clientAddress: context.clientAddress,
		host: incoming.host,
		proto: incoming.protocol.replace(':', ''),
		assertion: context.assertion,
	});
	// The upstream is a different origin; letting the caller's Host through
	// makes an app that builds absolute URLs point them back at the edge.
	headers.set('host', upstream.host);

	const send = context.fetch ?? globalThis.fetch;

	let response: Response;
	try {
		response = await send(
			new Request(upstream, {
				method: request.method,
				headers,
				body: request.body,
				// Required by the Fetch standard whenever a body is a stream,
				// and the reason a proxy must not buffer to avoid it.
				...(request.body ? { duplex: 'half' } : {}),
				redirect: 'manual',
			} as RequestInit),
		);
	} catch (cause) {
		// The upstream, not an authority: 502, not 503. The two are different
		// outages and a reader of the logs should not have to guess which.
		return errorResponse(
			502,
			'errors.bad-gateway',
			`upstream ${upstream.origin} could not be reached`,
			cause,
		);
	}

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers: responseHeaders(response.headers),
	});
}

/**
 * The body shape the parc's APIs answer with, minus the translation.
 *
 * The edge deliberately does not translate. It has no locale contract with the
 * caller and no message catalogue, and inventing one would mean an edge
 * refusal and an app refusal reading differently for the same reason. The key
 * is sent as the message so a client can map it; Oathkeeper's own 401 is not
 * translated either, so this is not a regression.
 */
export function errorResponse(
	status: number,
	message: string,
	debugMessage: string,
	cause?: unknown,
): Response {
	return Response.json(
		{
			status,
			message,
			debugMessage:
				cause instanceof Error
					? `${debugMessage}: ${cause.message}`
					: debugMessage,
			timestamp: new Date().toISOString(),
		},
		{ status },
	);
}

function joinPaths(base: string, path: string): string {
	const left = base.endsWith('/') ? base.slice(0, -1) : base;
	return `${left}${path.startsWith('/') ? path : `/${path}`}`;
}
