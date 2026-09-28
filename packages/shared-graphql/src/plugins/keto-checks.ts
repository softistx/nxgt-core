import type { Ory } from '@nxgt/ory-sdk';
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
 * schema, and with every schema another plugin makes of it. `applyKetoChecks`
 * returns a schema with no field left to guard as it is, so the replacement settles
 * instead of looping, alongside `useAuthenticated` whatever their order.
 *
 * `OryUnavailable` is deliberately not caught anywhere here: a Keto outage is
 * a 503 through `createMaskError`, never a denial.
 */
export function useKetoChecks(
	ory: Ory,
	options: KetoChecksOptions = {},
): Plugin<GraphQLBaseContext & OryContext & KetoChecksContext> {
	return {
		onSchemaChange: ({ schema, replaceSchema }) => {
			const next = applyKetoChecks(schema, options);
			if (next !== schema) replaceSchema(next);
		},
		onContextBuilding: ({ extendContext }) => {
			extendContext({ ketoChecks: createKetoChecks(ory) });
		},
	};
}
