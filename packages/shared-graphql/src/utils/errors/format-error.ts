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
import type { GraphQLFormattedError } from 'graphql';
import { kebabCase } from 'lodash';
import type { GraphQLBaseContext } from '../../types';
import { denialMessageKey } from './denial';
import { isOryUnavailable, serviceUnavailableError } from './ory-unavailable';
import {
	isOriginalGraphQLError,
	UNEXPECTED_ERROR_MESSAGE,
	unexpectedErrorExtensions,
} from './unexpected';

/**
 * Apollo Server's `formatError`, taught this repo's exceptions — the Apollo
 * counterpart of `createMaskError`. `OryUnavailable` answers
 * `SERVICE_UNAVAILABLE`, never a denial and never an opaque
 * `INTERNAL_SERVER_ERROR`; a `denial()` keeps its code, and its message is
 * translated with `translate`.
 *
 * With `production`, the client reads no internal detail: an unexpected
 * error — anything but a `GraphQLError` thrown on purpose and the errors
 * above — answers `Unexpected error.` with `INTERNAL_SERVER_ERROR`, as
 * `createMaskError` masks it, and no answer carries a `debugMessage` or a
 * stack trace.
 */
export function createFormatError<
	K extends LocaleKey,
	C extends GraphQLBaseContext = GraphQLBaseContext,
>(
	translate: (
		message: K,
		context?: TranslationContext,
	) => string = translateBase,
	production?: boolean,
): NonNullable<ApolloServerOptions<C>['formatError']> {
	return (formattedError, graphQLError) => {
		const known = formatKnownError(
			formattedError,
			graphQLError,
			translate,
			!production,
		);
		if (!production) return known ?? formattedError;
		if (known) return withoutDebugDetails(known);
		if (isOriginalGraphQLError(graphQLError)) {
			return withoutDebugDetails(formattedError);
		}
		return {
			...formattedError,
			message: UNEXPECTED_ERROR_MESSAGE,
			extensions: unexpectedErrorExtensions(graphQLError, false),
		};
	};
}

/** The Apollo codes whose message is replaced by its translated `errors.*` key. */
const APOLLO_REQUEST_ERRORS: readonly string[] = [
	ApolloServerErrorCode.GRAPHQL_VALIDATION_FAILED,
	ApolloServerErrorCode.BAD_REQUEST,
	ApolloServerErrorCode.BAD_USER_INPUT,
	ApolloServerErrorCode.GRAPHQL_PARSE_FAILED,
	ApolloServerErrorCode.OPERATION_RESOLUTION_FAILURE,
	ApolloServerErrorCode.PERSISTED_QUERY_NOT_FOUND,
	ApolloServerErrorCode.PERSISTED_QUERY_NOT_SUPPORTED,
];

/** The error without the extensions that carry internal detail. */
function withoutDebugDetails(
	formattedError: GraphQLFormattedError,
): GraphQLFormattedError {
	if (!formattedError.extensions) return formattedError;
	const { debugMessage, stacktrace, ...extensions } = formattedError.extensions;
	return { ...formattedError, extensions };
}

/**
 * The error as this package answers it, in any environment, or `undefined`
 * for one it does not know — left as Apollo formatted it in development, and
 * masked in production unless it is a `GraphQLError` thrown on purpose.
 */
function formatKnownError<K extends LocaleKey>(
	formattedError: GraphQLFormattedError,
	graphQLError: unknown,
	translate: (message: K, context?: TranslationContext) => string,
	debug: boolean,
): GraphQLFormattedError | undefined {
	const error = unwrapResolverError(graphQLError);
	if (isOryUnavailable(error)) {
		const unavailable = serviceUnavailableError(error, debug);
		return {
			...formattedError,
			message: unavailable.message,
			extensions: { ...formattedError.extensions, ...unavailable.extensions },
		};
	}
	const key = denialMessageKey(error);
	if (key !== undefined) {
		return { ...formattedError, message: translate(key as K) };
	}
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
		APOLLO_REQUEST_ERRORS.includes(
			formattedError.extensions?.['code'] as string,
		)
	) {
		return {
			...formattedError,
			message: translate(
				`errors.${kebabCase(formattedError.extensions?.['code'] as string)}` as K,
				{},
			),
			extensions: {
				...formattedError.extensions,
				debugMessage: formattedError.message,
			},
		};
	}
	return undefined;
}
