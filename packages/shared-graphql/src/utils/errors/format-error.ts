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
import { kebabCase } from 'lodash';
import type { GraphQLBaseContext } from '../../types';
import { denialMessageKey } from './denial';
import { isOryUnavailable, serviceUnavailableError } from './ory-unavailable';

/**
 * Apollo Server's `formatError`, taught this repo's exceptions — the Apollo
 * counterpart of `createMaskError`. `OryUnavailable` answers
 * `SERVICE_UNAVAILABLE`, never a denial and never an opaque
 * `INTERNAL_SERVER_ERROR`; a `denial()` keeps its code, and its message is
 * translated with `translate`.
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
): ApolloServerOptions<C>['formatError'] {
	return (formattedError, graphQLError) => {
		if (production && formattedError.extensions?.['stacktrace']) {
			formattedError.extensions['stacktrace'] = undefined;
		}
		const error = unwrapResolverError(graphQLError);
		if (isOryUnavailable(error)) {
			const unavailable = serviceUnavailableError(error);
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
			[
				ApolloServerErrorCode.GRAPHQL_VALIDATION_FAILED,
				ApolloServerErrorCode.BAD_REQUEST,
				ApolloServerErrorCode.BAD_USER_INPUT,
				ApolloServerErrorCode.GRAPHQL_PARSE_FAILED,
				ApolloServerErrorCode.OPERATION_RESOLUTION_FAILURE,
				ApolloServerErrorCode.PERSISTED_QUERY_NOT_FOUND,
				ApolloServerErrorCode.PERSISTED_QUERY_NOT_SUPPORTED,
			].includes(formattedError.extensions?.['code'] as any)
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
		return formattedError;
	};
}
