import { describe, expect, it } from 'bun:test';
import { ApolloServer } from '@apollo/server';
import { OryUnavailable } from '@nxgt/ory-sdk';
import { CustomException, ErrorCode } from '@nxgt/shared-exceptions';
import { mongoose } from '@nxgt/shared-mongo';
import type { GraphQLFormattedError } from 'graphql';
import { GraphQLError } from 'graphql';
import { denial } from './denial';
import { createFormatError } from './format-error';

const translate = (key: string) => `t(${key})`;
const development = createFormatError(translate as never);
const production = createFormatError(translate as never, true);

/** What graphql-js hands Apollo: the resolver's error wrapped in a GraphQLError. */
const wrapped = (original: unknown) =>
	new GraphQLError(
		original instanceof Error ? original.message : String(original),
		{
			originalError: original instanceof Error ? original : undefined,
			path: ['note'],
		},
	);

/** Apollo's own shape for an error, before `formatError` sees it. */
const formatted = (
	message: string,
	extensions: Record<string, unknown> = {},
): GraphQLFormattedError => ({
	message,
	locations: [{ line: 1, column: 3 }],
	path: ['note'],
	extensions: {
		code: ErrorCode.InternalServerError,
		stacktrace: ['Error: at somewhere'],
		...extensions,
	},
});

const exception = () =>
	CustomException.notFound({
		message: 'errors.not-found',
		debugMessage: 'note 42 is not in the collection',
	});

describe('createFormatError, in development', () => {
	it('translates a CustomException and keeps its code and debugMessage', () => {
		const result = development(formatted('x'), wrapped(exception()));
		expect(result).toMatchObject({
			message: 't(errors.not-found)',
			path: ['note'],
			extensions: {
				code: ErrorCode.NotFound,
				debugMessage: 'note 42 is not in the collection',
			},
		});
	});

	it('keeps a validation exception message as it is', () => {
		const result = development(
			formatted('x'),
			wrapped(
				CustomException.validationError({ message: 'title is required' }),
			),
		);
		expect(result?.message).toBe('title is required');
		expect(result?.extensions?.['code']).toBe(ErrorCode.ValidationError);
	});

	it('casts a Mongoose error first', () => {
		const result = development(
			formatted('x'),
			wrapped(new mongoose.Error.DocumentNotFoundError('{}')),
		);
		expect(result).toMatchObject({
			message: 't(errors.not-found)',
			extensions: { code: ErrorCode.BadRequest },
		});
	});

	it('translates a denial and keeps its code', () => {
		const refused = denial(ErrorCode.Forbidden, 'notes.errors.read-only');
		const result = development(
			formatted(refused.message, { code: 'FORBIDDEN' }),
			wrapped(refused),
		);
		expect(result).toMatchObject({
			message: 't(notes.errors.read-only)',
			extensions: { code: 'FORBIDDEN' },
		});
	});

	it('answers an outage SERVICE_UNAVAILABLE, with its debugMessage', () => {
		const result = development(
			formatted('keto answered 503'),
			wrapped(new OryUnavailable('keto', 503, null)),
		);
		expect(result).toMatchObject({
			message: 'ory: keto is unavailable',
			extensions: {
				code: ErrorCode.ServiceUnavailable,
				http: { status: 503 },
			},
		});
		expect(result?.extensions?.['debugMessage']).toBeString();
	});

	it('translates an Apollo validation error and keeps its text as debugMessage', () => {
		const result = development(
			formatted('Cannot query field "nope" on type "Query".', {
				code: 'GRAPHQL_VALIDATION_FAILED',
			}),
			new GraphQLError('Cannot query field "nope" on type "Query".'),
		);
		expect(result).toMatchObject({
			message: 't(errors.graphql-validation-failed)',
			extensions: {
				code: 'GRAPHQL_VALIDATION_FAILED',
				debugMessage: 'Cannot query field "nope" on type "Query".',
			},
		});
	});

	it('passes a GraphQLError with extensions as Apollo formatted it', () => {
		const deliberate = new GraphQLError('Bad cursor', {
			extensions: { code: 'BAD_CURSOR', debugMessage: 'cursor is empty' },
		});
		const input = formatted('Bad cursor', {
			code: 'BAD_CURSOR',
			debugMessage: 'cursor is empty',
		});
		expect(development(input, deliberate)).toEqual(input);
	});

	it('passes an unexpected Error as Apollo formatted it', () => {
		const input = formatted('an internal detail');
		expect(
			development(input, wrapped(new Error('an internal detail'))),
		).toEqual(input);
	});

	it('passes a non-Error as Apollo formatted it', () => {
		const input = formatted('a thrown string');
		expect(development(input, 'a thrown string')).toEqual(input);
	});

	it('keeps the stack trace', () => {
		const result = development(
			formatted('an internal detail'),
			wrapped(new Error('an internal detail')),
		);
		expect(result?.extensions?.['stacktrace']).toBeDefined();
	});
});

describe('createFormatError, in production', () => {
	it('translates a CustomException and sends no debugMessage', () => {
		const result = production(formatted('x'), wrapped(exception()));
		expect(result).toMatchObject({
			message: 't(errors.not-found)',
			extensions: { code: ErrorCode.NotFound },
		});
		expect(result?.extensions).not.toHaveProperty('debugMessage');
		expect(result?.extensions).not.toHaveProperty('stacktrace');
	});

	it('translates a denial and keeps its code', () => {
		const refused = denial(ErrorCode.NotFound);
		const result = production(
			formatted(refused.message, { code: 'NOT_FOUND' }),
			wrapped(refused),
		);
		expect(result).toMatchObject({
			message: 't(errors.not-found)',
			extensions: { code: 'NOT_FOUND' },
		});
	});

	it('answers an outage SERVICE_UNAVAILABLE, with no debugMessage', () => {
		const result = production(
			formatted('keto answered 503'),
			wrapped(new OryUnavailable('keto', 503, null)),
		);
		expect(result).toMatchObject({
			message: 'ory: keto is unavailable',
			extensions: {
				code: ErrorCode.ServiceUnavailable,
				http: { status: 503 },
			},
		});
		expect(result?.extensions).not.toHaveProperty('debugMessage');
	});

	it('translates an Apollo validation error and sends no debugMessage', () => {
		const result = production(
			formatted('Cannot query field "nope" on type "Query".', {
				code: 'GRAPHQL_VALIDATION_FAILED',
			}),
			new GraphQLError('Cannot query field "nope" on type "Query".'),
		);
		expect(result).toMatchObject({
			message: 't(errors.graphql-validation-failed)',
			extensions: { code: 'GRAPHQL_VALIDATION_FAILED' },
		});
		expect(result?.extensions).not.toHaveProperty('debugMessage');
	});

	it('keeps a GraphQLError with extensions, without its debugMessage', () => {
		const deliberate = new GraphQLError('Bad cursor', {
			extensions: { code: 'BAD_CURSOR', debugMessage: 'cursor is empty' },
		});
		const result = production(
			formatted('Bad cursor', {
				code: 'BAD_CURSOR',
				debugMessage: 'cursor is empty',
			}),
			deliberate,
		);
		expect(result).toEqual({
			message: 'Bad cursor',
			locations: [{ line: 1, column: 3 }],
			path: ['note'],
			extensions: { code: 'BAD_CURSOR' },
		});
	});

	it('answers an unexpected Error with the generic message, keeping its path', () => {
		const result = production(
			formatted('an internal detail', { debugMessage: 'an internal detail' }),
			wrapped(new Error('an internal detail')),
		);
		expect(result).toEqual({
			message: 'Unexpected error.',
			locations: [{ line: 1, column: 3 }],
			path: ['note'],
			extensions: { code: ErrorCode.InternalServerError },
		});
	});

	it('answers a non-Error with the generic message', () => {
		const result = production(formatted('a thrown string'), 'a thrown string');
		expect(result).toMatchObject({
			message: 'Unexpected error.',
			extensions: { code: ErrorCode.InternalServerError },
		});
		expect(JSON.stringify(result)).not.toContain('a thrown string');
	});
});

describe('createFormatError, through Apollo Server', () => {
	const server = (isProduction: boolean) =>
		new ApolloServer({
			typeDefs: 'type Query { note: String, missing: String }',
			resolvers: {
				Query: {
					note: () => {
						throw new Error('an internal detail');
					},
					missing: () => {
						throw exception();
					},
				},
			},
			formatError: createFormatError(translate as never, isProduction),
		});

	const run = async (isProduction: boolean, query: string) => {
		const response = await server(isProduction).executeOperation({ query });
		if (response.body.kind !== 'single') throw new Error('not a single result');
		return response.body.singleResult.errors?.[0];
	};

	it('answers the generic message for an unexpected error in production', async () => {
		const error = await run(true, '{ note }');
		expect(error?.message).toBe('Unexpected error.');
		expect(error?.path).toEqual(['note']);
		expect(JSON.stringify(error)).not.toContain('an internal detail');
	});

	it('sends no debugMessage for an exception in production', async () => {
		const error = await run(true, '{ missing }');
		expect(error?.message).toBe('t(errors.not-found)');
		expect(error?.extensions).not.toHaveProperty('debugMessage');
	});

	it('keeps both in development', async () => {
		expect((await run(false, '{ note }'))?.message).toBe('an internal detail');
		expect((await run(false, '{ missing }'))?.extensions).toMatchObject({
			debugMessage: 'note 42 is not in the collection',
		});
	});
});
