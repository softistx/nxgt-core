import { describe, expect, it } from 'bun:test';
import { ApolloServer } from '@apollo/server';
import type { Permission } from '@nxgt/ory-sdk';
import { ErrorCode } from '@nxgt/shared-exceptions';
import { createSchema, createYoga } from 'graphql-yoga';
import { KETO_DIRECTIVES_SDL } from '../directives';
import { denial } from '../utils/errors/denial';
import { createMaskError } from '../utils/errors/mask-error';
import { applyKetoChecks } from './apply-keto-checks';
import { requireUser } from './keto-helpers';

/**
 * A denial is a `GraphQLError` carrying its status, so a server that never
 * registered `createMaskError` answers 401/403/404 — not Yoga's masked 500.
 */
const schema = applyKetoChecks(
	createSchema({
		typeDefs: [
			KETO_DIRECTIVES_SDL,
			`type Query {
				note(id: ID!): String @permission(name: "view", type: "Note")
				editable(id: ID!): String
					@permission(name: "view", type: "Note")
					@permission(name: "edit", type: "Note", onDeny: FORBIDDEN)
				me: String
			}`,
		],
		resolvers: {
			Query: {
				note: () => 'n',
				editable: () => 'n',
				me: (_s: unknown, _a: unknown, ctx: { user?: { sub: string } }) =>
					requireUser(ctx).sub,
			},
		},
	}),
);

/** A caller who may view n1 and nothing else. */
const ketoChecks = async (permission: Permission) =>
	permission.relation === 'view' && permission.object === 'n1';

function server(maskError?: ReturnType<typeof createMaskError>) {
	return createYoga({
		schema,
		context: { ory: { subject: 'idn-7' }, ketoChecks },
		maskedErrors: maskError ? { maskError } : true,
	});
}

async function ask(
	query: string,
	maskError?: ReturnType<typeof createMaskError>,
) {
	const response = await server(maskError).fetch('http://api.test/graphql', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ query }),
	});
	const body = (await response.json()) as {
		errors: { message: string; extensions: { code: string } }[];
	};
	return { status: response.status, error: body.errors[0] };
}

describe('a denial, without createMaskError', () => {
	it.each([
		[
			'{ note(id: "n2") }',
			404,
			'NOT_FOUND',
			'Could not find the requested resource.',
		],
		[
			'{ editable(id: "n1") }',
			403,
			'FORBIDDEN',
			"You don't have required permissions",
		],
		['{ me }', 401, 'UNAUTHENTICATED', "You're not authenticated"],
	])('%s answers %d %s', async (query, status, code, message) => {
		const { status: answered, error } = await ask(query);
		expect(answered).toBe(status);
		expect(error?.extensions.code).toBe(code);
		expect(error?.message).toStartWith(message);
	});
});

describe('a denial, through createMaskError', () => {
	it('keeps its code and status, and is translated with your translate', async () => {
		const mask = createMaskError(((key: string) => `t(${key})`) as never);
		const { status, error } = await ask('{ note(id: "n2") }', mask);
		expect(status).toBe(404);
		expect(error).toMatchObject({
			message: 't(errors.not-found)',
			extensions: { code: 'NOT_FOUND' },
		});
	});
});

describe('a denial, under Apollo Server without createFormatError', () => {
	it('answers its status too', async () => {
		const apollo = new ApolloServer({
			typeDefs: 'type Query { note: String }',
			resolvers: {
				Query: {
					note: () => {
						throw denial(ErrorCode.Forbidden);
					},
				},
			},
		});
		const response = await apollo.executeOperation({ query: '{ note }' });
		expect(response.http.status).toBe(403);
	});
});
