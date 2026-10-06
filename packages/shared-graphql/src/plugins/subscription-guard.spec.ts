import { describe, expect, it } from 'bun:test';
import type { Permission } from '@nxgt/ory-sdk';
import { ErrorCode } from '@nxgt/shared-exceptions';
import { type ExecutionResult, parse, subscribe } from 'graphql';
import { createSchema } from 'graphql-yoga';
import { KETO_DIRECTIVES_SDL } from '../directives';
import { applyKetoChecks } from './apply-keto-checks';

/**
 * `subscribe` runs before any event exists. A `@permission` reading only
 * `args.*` is asked there, so a refused subscription opens no stream; one
 * reading `parent.*` has nothing to read yet, and is asked of each event.
 */
function schemaWith(opened: { count: number }) {
	const events = (ids: string[]) => () => {
		opened.count += 1;
		return (async function* () {
			for (const noteId of ids) yield { noteId };
		})();
	};
	return applyKetoChecks(
		createSchema({
			typeDefs: [
				KETO_DIRECTIVES_SDL,
				`type Query { _: String }
				type Subscription {
					byArg(id: ID!): String @permission(name: "view", type: "Note")
					byEvent: String @permission(name: "view", type: "Note", id: "parent.noteId")
				}`,
			],
			resolvers: {
				Subscription: {
					byArg: { subscribe: events(['n1']), resolve: () => 'n1' },
					byEvent: {
						subscribe: events(['n1', 'n2']),
						resolve: (event: { noteId: string }) => event.noteId,
					},
				},
			},
		}),
	);
}

/** A caller who may view n1 only. */
const context = {
	ory: { subject: 'idn-7' },
	ketoChecks: async (permission: Permission) => permission.object === 'n1',
};

describe('@permission on a subscription', () => {
	it('reading args: refused before the stream is opened', async () => {
		const opened = { count: 0 };
		const refused = (await subscribe({
			schema: schemaWith(opened),
			document: parse('subscription { byArg(id: "n2") }'),
			contextValue: context,
		})) as ExecutionResult;
		expect(refused.errors?.[0]?.extensions?.['code']).toBe(ErrorCode.NotFound);
		expect(opened.count).toBe(0);
	});

	it('reading parent: asked of each event, the stream opened', async () => {
		const opened = { count: 0 };
		const stream = (await subscribe({
			schema: schemaWith(opened),
			document: parse('subscription { byEvent }'),
			contextValue: context,
		})) as AsyncGenerator<ExecutionResult>;
		const first = await stream.next();
		const second = await stream.next();
		expect(opened.count).toBe(1);
		expect(first.value?.data).toEqual({ byEvent: 'n1' });
		expect(second.value?.errors?.[0]?.extensions?.code).toBe(
			ErrorCode.NotFound,
		);
	});
});
