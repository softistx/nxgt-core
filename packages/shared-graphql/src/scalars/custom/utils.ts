import type { LocaleKey } from '@nxgt/i18n';
import { CustomException } from '@nxgt/shared-exceptions';
import { logger } from '@nxgt/shared-logging';
import { GraphQLScalarType } from 'graphql';

export function createScalarFrom<T, R>(
	scalar: GraphQLScalarType<T, R>,
	{
		name,
		description,
		errorMessage,
	}: {
		name?: string;
		description?: string;
		errorMessage?: LocaleKey | string;
	},
) {
	const exception = CustomException.badRequest({
		message: errorMessage as LocaleKey,
	});
	return new GraphQLScalarType<T, R>({
		...scalar,
		name: name ?? scalar.name,
		description: (description ?? scalar.description)?.replaceAll('`', "'"),
		serialize(value) {
			if (!errorMessage) {
				return scalar.serialize(value);
			}
			try {
				return scalar.serialize(value);
			} catch (e) {
				logger.error(e);
				throw exception;
			}
		},
		parseValue(value) {
			if (!errorMessage) {
				return scalar.parseValue(value);
			}
			try {
				return scalar.parseValue(value);
			} catch (e) {
				logger.error(e);
				throw exception;
			}
		},
		// Both arguments forwarded: graphql 17 declares `variables` required.
		parseLiteral(ast, variables) {
			if (!errorMessage) {
				return scalar.parseLiteral(ast, variables);
			}
			try {
				return scalar.parseLiteral(ast, variables);
			} catch (e) {
				logger.error(e);
				throw exception;
			}
		},
	});
}
