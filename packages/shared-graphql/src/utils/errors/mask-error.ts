import {
	type LocaleKey,
	type TranslationContext,
	translate as translateBase,
} from '@nxgt/i18n';
import { CustomException, ErrorCode } from '@nxgt/shared-exceptions';
import { MONGO_UTILS, mongoose } from '@nxgt/shared-mongo';
import { GraphQLError } from 'graphql';
import type { MaskError } from 'graphql-yoga';
import { denialMessageKey } from './denial';
import { isOryUnavailable, serviceUnavailableError } from './ory-unavailable';

type Translate<K extends LocaleKey> = (
	message: K,
	context?: TranslationContext,
) => string;

/**
 * Yoga's `maskedErrors.maskError`, taught this repo's exceptions.
 *
 * Yoga masks anything that is not a `GraphQLError` as "Unexpected error." —
 * and `CustomException` extends `Error`, so out of the box a service's
 * `notFound()` or `forbidden()` reaches the client as an opaque 500. This
 * turns one into a `GraphQLError` with the translated message, the
 * exception's `code` in `extensions`, and a matching HTTP status
 * (`UNAUTHENTICATED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404); a Mongoose error
 * goes through `castError` first, as `createFormatError` does for Apollo.
 * `OryUnavailable` (@nxgt/ory-sdk) becomes a 503 `SERVICE_UNAVAILABLE`, never
 * a denial. A `denial()` — what the directives, `requireUser` and `can` throw
 * — keeps its code and status, and its message is translated with `translate`. Everything else is masked as Yoga's default masks it: a
 * `GraphQLError` thrown on purpose — or raised by validation — passes, and one
 * that only wraps a plain `Error` a resolver threw is replaced by `message`,
 * so an internal message never reaches the client.
 *
 *     createYoga({ maskedErrors: { maskError: createMaskError(translate) } })
 */
export function createMaskError<K extends LocaleKey>(
	translate: Translate<K> = translateBase,
): MaskError {
	return (error, message, isDev) => {
		const original =
			error instanceof GraphQLError && error.originalError
				? error.originalError
				: error;

		if (isOryUnavailable(original)) return serviceUnavailableError(original);

		const key = denialMessageKey(original);
		if (key !== undefined) {
			return new GraphQLError(translate(key as K), {
				...locationOf(error),
				extensions: (original as GraphQLError).extensions,
			});
		}

		if (
			original instanceof CustomException ||
			original instanceof mongoose.MongooseError
		) {
			return exceptionError(original, translate);
		}

		if (isOriginalGraphQLError(error)) return error;
		return new GraphQLError(message, {
			...locationOf(error),
			extensions: isDev
				? {
						code: ErrorCode.InternalServerError,
						debugMessage: String(original),
					}
				: { code: ErrorCode.InternalServerError },
		});
	};
}

function exceptionError<K extends LocaleKey>(
	original: CustomException | mongoose.MongooseError,
	translate: Translate<K>,
): GraphQLError {
	const exception =
		original instanceof mongoose.MongooseError
			? MONGO_UTILS.castError(original)
			: original;
	// The exception carries the status itself.
	const status = exception.code;
	return new GraphQLError(
		exception.errorCode === ErrorCode.ValidationError
			? exception.message
			: translate(exception.message as K, exception.options),
		{
			extensions: {
				code: exception.errorCode,
				...(status ? { http: { status } } : {}),
				...(exception.debugMessage
					? { debugMessage: exception.debugMessage }
					: {}),
			},
		},
	);
}

/**
 * Yoga's own test: a `GraphQLError` is "original" when it — or the error it
 * wraps, all the way down — was a `GraphQLError` to begin with. Graphql-js
 * wraps every resolver error in one, so `instanceof GraphQLError` alone lets
 * a plain `Error`'s message through.
 */
function isOriginalGraphQLError(error: unknown): error is GraphQLError {
	if (!(error instanceof GraphQLError)) return false;
	return error.originalError == null
		? true
		: isOriginalGraphQLError(error.originalError);
}

/** Where the masked error happened, kept so the client still sees a `path`. */
function locationOf(error: unknown) {
	if (!(error instanceof GraphQLError)) return {};
	return {
		nodes: error.nodes ?? null,
		source: error.source,
		positions: error.positions,
		path: error.path,
	};
}
