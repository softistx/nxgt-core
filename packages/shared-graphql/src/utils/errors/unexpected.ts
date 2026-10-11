import { ErrorCode } from '@nxgt/shared-exceptions';
import { GraphQLError } from 'graphql';

/**
 * What an unexpected error answers when it is masked — Yoga's own default
 * mask message, which `createFormatError` uses in production too.
 *
 * Internal to the errors folder: `index.ts` does not re-export this module.
 */
export const UNEXPECTED_ERROR_MESSAGE = 'Unexpected error.';

/**
 * Yoga's own test: a `GraphQLError` is "original" when it — or the error it
 * wraps, all the way down — was a `GraphQLError` to begin with. Graphql-js
 * wraps every resolver error in one, so `instanceof GraphQLError` alone lets
 * a plain `Error`'s message through.
 */
export function isOriginalGraphQLError(error: unknown): error is GraphQLError {
	if (!(error instanceof GraphQLError)) return false;
	return error.originalError == null
		? true
		: isOriginalGraphQLError(error.originalError);
}

/**
 * The extensions a masked unexpected error carries: its code, and the
 * original as `debugMessage` in development only.
 */
export function unexpectedErrorExtensions(
	original: unknown,
	isDev: boolean | undefined,
): Record<string, unknown> {
	return isDev
		? { code: ErrorCode.InternalServerError, debugMessage: String(original) }
		: { code: ErrorCode.InternalServerError };
}
