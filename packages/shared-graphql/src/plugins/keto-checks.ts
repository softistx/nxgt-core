import type { Ory } from '@nxgt/ory-sdk';
import type { GraphQLSchema } from 'graphql';
import type { Plugin } from 'graphql-yoga';
import type { ReadOptions } from '../directives';
import type { GraphQLBaseContext } from '../types';
import { applyKetoChecks } from './apply-keto-checks';
import { createKetoChecks, type KetoChecksContext } from './keto-checker';
import type { OryContext } from './ory-auth';

/** What `useKetoChecks` and `applyKetoChecks` take besides the `Ory` client. */
export type KetoChecksOptions = ReadOptions;

/**
 * Registers the whole thing: the schema transform, and the per-request checker
 * the transform — and the app's own access layer, through `can` — read off the
 * context.
 *
 * Goes after `useOryAuth(ory)`, which is what puts `ory.subject` there.
 *
 * `replaceSchema` inside `onSchemaChange` re-enters this hook with the new
 * schema, so transformed schemas are remembered and passed through. Without
 * the guard this loops until the stack gives out.
 *
 * `OryUnavailable` is deliberately not caught anywhere here: a Keto outage is
 * a 503 through `createMaskError`, never a denial.
 */
export function useKetoChecks(
	ory: Ory,
	options: KetoChecksOptions = {},
): Plugin<GraphQLBaseContext & OryContext & KetoChecksContext> {
	const transformed = new WeakSet<GraphQLSchema>();

	return {
		onSchemaChange: ({ schema, replaceSchema }) => {
			if (transformed.has(schema)) return;
			const next = applyKetoChecks(schema, options);
			transformed.add(next);
			replaceSchema(next);
		},
		onContextBuilding: ({ extendContext }) => {
			extendContext({ ketoChecks: createKetoChecks(ory) });
		},
	};
}
