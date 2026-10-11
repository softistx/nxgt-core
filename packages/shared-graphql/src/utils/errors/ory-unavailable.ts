import type { OryUnavailable } from '@nxgt/ory-sdk';
import { ErrorCode } from '@nxgt/shared-exceptions';
import { GraphQLError } from 'graphql';

/**
 * Whether an error is `@nxgt/ory-sdk`'s `OryUnavailable` — Kratos, Hydra or
 * Keto could not answer.
 *
 * By name and shape as well as by class: an install that resolves two copies
 * of `@nxgt/ory-sdk` (one under this package, one under the app) throws an
 * `OryUnavailable` this module's `instanceof` does not recognise, and an
 * outage that slips past here is masked as a 500 instead of answered as a 503.
 */
export function isOryUnavailable(error: unknown): error is OryUnavailable {
	if (!(error instanceof Error)) return false;
	const service = (error as { service?: unknown }).service;
	return error.name === 'OryUnavailable' && typeof service === 'string';
}

/**
 * A 503 the client can read as one — a real `GraphQLError` so Yoga's masking
 * leaves it alone, `extensions.http.status` so the transport says 503 too.
 * Never a denial: an outage must not read as "not signed in" or "not allowed".
 *
 * `extensions.debugMessage` (what the SDK saw) is added only when `debug` is
 * true. `createMaskError` passes Yoga's `isDev`; `useOryAuth` throws this
 * error during context building as a finished `GraphQLError` with no
 * `originalError`, which Yoga's `maskError` (it does run there) passes through
 * unchanged. The decision is therefore made where it is thrown: `useOryAuth`
 * passes `NODE_ENV === 'development'`, and nothing reaches a client in
 * production.
 */
export function serviceUnavailableError(
	error: OryUnavailable,
	debug = false,
): GraphQLError {
	return new GraphQLError(`ory: ${error.service} is unavailable`, {
		extensions: {
			code: ErrorCode.ServiceUnavailable,
			http: { status: 503 },
			...(debug ? { debugMessage: error.message } : {}),
		},
	});
}
