import type { ApolloServerOptions } from '@apollo/server';
import {
	ApolloServerErrorCode,
	unwrapResolverError,
} from '@apollo/server/errors';
import {
	type LocaleKey,
	type TranslationContext,
	translate as translateBase,
} from '@nxgt/i18n';
import { CustomException, ErrorCode } from '@nxgt/shared-exceptions';
import { MONGO_UTILS, mongoose } from '@nxgt/shared-mongo';
import { GraphQLError, type GraphQLErrorOptions } from 'graphql';
import type { MaskError } from 'graphql-yoga';
import { kebabCase } from 'lodash';
import { OryUnavailable } from 'stx-sdk/ory';
import type { GraphQLBaseContext } from '../types';

export function createGraphQLError(
	message: string,
	options?: GraphQLErrorOptions,
): GraphQLError {
	return new GraphQLError(message, options);
}

export function createFormatError<
	K extends LocaleKey,
	C extends GraphQLBaseContext = GraphQLBaseContext,
>(
	translate: (
		message: K,
		context?: TranslationContext,
	) => string = translateBase,
	production?: boolean,
): ApolloServerOptions<C>['formatError'] {
	return (formattedError, graphQLError) => {
		if (production && formattedError.extensions?.stacktrace) {
			formattedError.extensions.stacktrace = undefined;
		}
		const error = unwrapResolverError(graphQLError);
		if (
			error instanceof CustomException ||
			error instanceof mongoose.MongooseError
		) {
			const exception =
				error instanceof mongoose.MongooseError
					? MONGO_UTILS.castError(error)
					: (error as CustomException);
			return {
				...formattedError,
				message:
					exception.errorCode === ErrorCode.ValidationError
						? exception.message
						: translate(exception.message as K, exception.options),
				extensions: {
					...formattedError.extensions,
					code: exception.errorCode,
					debugMessage: exception.debugMessage,
				},
			};
		}
		if (
			[
				ApolloServerErrorCode.GRAPHQL_VALIDATION_FAILED,
				ApolloServerErrorCode.BAD_REQUEST,
				ApolloServerErrorCode.BAD_USER_INPUT,
				ApolloServerErrorCode.GRAPHQL_PARSE_FAILED,
				ApolloServerErrorCode.OPERATION_RESOLUTION_FAILURE,
				ApolloServerErrorCode.PERSISTED_QUERY_NOT_FOUND,
				ApolloServerErrorCode.PERSISTED_QUERY_NOT_SUPPORTED,
			].includes(formattedError.extensions?.code as any)
		) {
			return {
				...formattedError,
				message: translate(
					`errors.${kebabCase(formattedError.extensions?.code as string)}` as K,
					{},
				),
				extensions: {
					...formattedError.extensions,
					debugMessage: formattedError.message,
				},
			};
		}
		return formattedError;
	};
}

const HTTP_STATUS_BY_CODE: Record<string, number> = {
	[ErrorCode.BadRequest]: 400,
	[ErrorCode.ValidationError]: 400,
	[ErrorCode.Unauthenticated]: 401,
	[ErrorCode.Forbidden]: 403,
	[ErrorCode.NotFound]: 404,
	[ErrorCode.Conflict]: 409,
	[ErrorCode.ServiceUnavailable]: 503,
};

/**
 * Yoga's `maskedErrors.maskError`, taught this repo's exceptions.
 *
 * Yoga masks anything that is not a `GraphQLError` as "Unexpected error." —
 * and `CustomException` extends `Error`, so out of the box a service's
 * `notFound()` or `forbidden()` reaches the client as an opaque 500. This
 * turns one into a `GraphQLError` with the translated message, the
 * exception's `code` in `extensions`, and a matching HTTP status; a Mongoose
 * error goes through `castError` first, as `createFormatError` does for
 * Apollo. `OryUnavailable` (stx-sdk/ory) becomes a 503 `SERVICE_UNAVAILABLE`,
 * never a denial. Everything else is masked exactly as before.
 *
 *     createYoga({ maskedErrors: { maskError: createMaskError(translate) } })
 */
export function createMaskError<K extends LocaleKey>(
	translate: (
		message: K,
		context?: TranslationContext,
	) => string = translateBase,
): MaskError {
	return (error, message, isDev) => {
		const original =
			error instanceof GraphQLError && error.originalError
				? error.originalError
				: error;

		if (original instanceof OryUnavailable) {
			return new GraphQLError(`ory: ${original.service} is unavailable`, {
				extensions: {
					code: ErrorCode.ServiceUnavailable,
					http: { status: 503 },
					debugMessage: original.message,
				},
			});
		}

		if (
			original instanceof CustomException ||
			original instanceof mongoose.MongooseError
		) {
			const exception =
				original instanceof mongoose.MongooseError
					? MONGO_UTILS.castError(original)
					: (original as CustomException);
			// The exception carries the status itself now.
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

		if (error instanceof GraphQLError) return error;
		return new GraphQLError(message, {
			extensions: isDev
				? { code: ErrorCode.InternalServerError, debugMessage: String(error) }
				: { code: ErrorCode.InternalServerError },
		});
	};
}
