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
 */
export function serviceUnavailableError(error: OryUnavailable): GraphQLError {
	return new GraphQLError(`ory: ${error.service} is unavailable`, {
		extensions: {
			code: ErrorCode.ServiceUnavailable,
			http: { status: 503 },
			debugMessage: error.message,
		},
	});
}
