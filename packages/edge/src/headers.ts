import { USER_HEADERS } from '@nxgt/shared/models';

/**
 * Header names a caller must never be able to set through the edge.
 *
 * These are not hypothetical. `currentUser()` in sellix's `apps/services/*`
 * builds a full principal — id, email, **authorities**, **roles** — out of
 * exactly these request headers, gated by nothing at all; and
 * `principalFromMockHeaders` reads them too, gated only by
 * `NODE_ENV === 'test'`. Nothing currently behind this edge reads them, so
 * this is not a live hole; it becomes one the moment the edge fronts one of
 * those services, and that is a bad day to be writing this list.
 *
 * It is derived from `USER_HEADERS` rather than typed out, so a header added
 * to the parc's vocabulary is scrubbed without anyone remembering to come
 * here.
 */
export const SCRUBBED_REQUEST_HEADERS: readonly string[] = [
	...new Set(Object.values(USER_HEADERS).map((name) => name.toLowerCase())),
	// Set by us below. An inbound one is a caller trying to pick their own
	// source address, which is what a rate limiter and every access log read.
	'x-forwarded-for',
	'x-forwarded-host',
	'x-forwarded-proto',
];

export interface ForwardOptions {
	/** The caller's address, as the runtime saw it. */
	clientAddress?: string;
	/** The Host the caller asked for. */
	host: string;
	/** `http` or `https`, as the caller reached us. */
	proto: string;
	/**
	 * The signed assertion to vouch for the caller. Absent in `mirror` mode,
	 * where the request must reach the mirrored edge carrying the credential
	 * IT authenticates with.
	 */
	assertion?: string;
}

/**
 * The headers to send upstream.
 *
 * Everything the caller sent survives except the scrubbed list — `Cookie`
 * included, deliberately. A fronted app stays correct on its own address, and
 * an app that reads the session cookie directly there must keep working
 * behind the edge. Stripping it is a hardening of its own, and it needs
 * checking app by app rather than assuming.
 */
export function forwardHeaders(
	incoming: Headers,
	options: ForwardOptions,
): Headers {
	const headers = new Headers(incoming);

	for (const name of SCRUBBED_REQUEST_HEADERS) headers.delete(name);

	if (options.assertion) {
		// REPLACED, not added. `ory.resolve` takes the Bearer before the
		// cookie, so the upstream reads ours — and the caller's own token must
		// not travel further than it has to.
		headers.set('authorization', `Bearer ${options.assertion}`);
	}

	if (options.clientAddress)
		headers.set('x-forwarded-for', options.clientAddress);
	headers.set('x-forwarded-host', options.host);
	headers.set('x-forwarded-proto', options.proto);

	return headers;
}

/**
 * The headers to send back to the caller.
 *
 * `Set-Cookie` is copied through `getSetCookie()`, never `get('set-cookie')`:
 * the latter folds several cookies into one comma-joined string that no
 * browser will accept, and a login that sets both a session and a CSRF cookie
 * is the ordinary case, not an edge one. `carry()` in `stx-sdk/ory/flows`
 * applies the same discipline for the same reason.
 */
export function responseHeaders(upstream: Headers): Headers {
	const headers = new Headers(upstream);
	headers.delete('set-cookie');
	for (const cookie of upstream.getSetCookie()) {
		headers.append('set-cookie', cookie);
	}
	return headers;
}
