import { z } from 'zod';
import { zRuleEntry } from '../rule-entry.schema';

// ---------------------------------------------------------------------------
// GraphQL rules  →  type name → field name → rule entry
// ---------------------------------------------------------------------------

/**
 * Rule entries for one GraphQL type, keyed by field name. Field names can't
 * be enumerated ahead of time (they depend on the consuming service's own
 * GraphQL schema), so this level stays an open dictionary.
 */
const zGraphqlFieldMap = z.record(
	z.string().describe('Field name on this GraphQL type, e.g. "createUser".'),
	// `.strict()` so a REST-only key that wandered into a GraphQL rule — `keto`
	// above all — fails at startup with a Zod error naming it, rather than
	// being stripped in silence and leaving the field looking guarded.
	zRuleEntry.strict(),
);

/**
 * GraphQL rules keyed by type name. `Query`, `Mutation`, and `Subscription`
 * are modeled as explicit optional properties (rather than left to the
 * catch-all below) purely so JSON-Schema-aware editors can autocomplete
 * them — those three root types exist in every GraphQL schema, so they're
 * safe to enumerate ahead of time.
 *
 * Any other object type name (e.g. `User`, `Employee`) is also accepted —
 * `.catchall()` validates additional keys against the same field-map shape,
 * which lets rules target fields on nested/returned types, not just root
 * operation fields. This is what `applyGraphqlPolicy` (see `./resolvers`)
 * walks to wrap resolvers across an entire schema, not just its root types.
 */
export const zGraphqlRules = z
	.object({
		Query: zGraphqlFieldMap.optional(),
		Mutation: zGraphqlFieldMap.optional(),
		Subscription: zGraphqlFieldMap.optional(),
	})
	.catchall(zGraphqlFieldMap)
	.describe(
		'GraphQL authorization rules, keyed by type name then field name. ' +
			'`Query`/`Mutation`/`Subscription` cover root operation fields; any ' +
			'other type name (e.g. "User") targets fields on that type wherever ' +
			'it appears in the schema.',
	);
