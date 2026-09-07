import { z } from 'zod';
import { zGraphqlKetoCheck, zRuleEntry } from '../rule-entry.schema';

// ---------------------------------------------------------------------------
// GraphQL rules  →  type name → field name → rule entry
// ---------------------------------------------------------------------------

/**
 * A GraphQL rule: everything a shared rule entry carries, plus `keto`.
 *
 * The twin of `zRestRuleEntry`. Same field, same rungs, same denials — only
 * the `id` grammar differs, `args.<path>` / `source.<path>` where REST reads
 * `param.` / `query.` / `json.`. That difference is exactly why the field is
 * declared per transport instead of on the shared entry: written once, either
 * spelling would be accepted on either side and then resolve nothing at
 * request time.
 */
export const zGraphqlRuleEntry = zRuleEntry.extend({
	/**
	 * Per-object permission checks, answered by Keto — the declarative
	 * statement of what the `@check` directive says on a field.
	 *
	 * A LIST, evaluated in order, each entry carrying its own denial: `view`
	 * answering NOT_FOUND then `edit` answering FORBIDDEN is the ladder, and
	 * it is why `@check` is `repeatable`.
	 *
	 * Evaluated LAST, after the authentication floor, `authorities` and
	 * `expression` — those are local and synchronous, and there is no reason
	 * to cross the network for a question already answerable here.
	 */
	keto: z
		.array(zGraphqlKetoCheck)
		.optional()
		.describe(
			'Per-object permission checks answered by Keto, evaluated in order ' +
				'after `authorities` and `expression`. Each entry is one check with ' +
				'its own denial: list `view` (NOT_FOUND) then `edit` (FORBIDDEN) to ' +
				'get the 404-then-403 ladder. Ids are read from `args.<path>` or ' +
				'`source.<path>`. Requires `applyGraphqlPolicy` to be given a ' +
				'permission evaluator — a rule that asks for one without it throws ' +
				'rather than denying. NOT for a field that answers a LIST: that is ' +
				'a Keto query folded into the read, not a check.',
		),
});

export type GraphqlRuleEntry = z.infer<typeof zGraphqlRuleEntry>;

/**
 * Rule entries for one GraphQL type, keyed by field name. Field names can't
 * be enumerated ahead of time (they depend on the consuming service's own
 * GraphQL schema), so this level stays an open dictionary.
 */
const zGraphqlFieldMap = z.record(
	z.string().describe('Field name on this GraphQL type, e.g. "createUser".'),
	// `.strict()` so a key that belongs to the other transport — a REST
	// `param.id` term, above all — fails at startup with a Zod error naming
	// it, rather than being stripped in silence and leaving the field looking
	// guarded.
	zGraphqlRuleEntry.strict(),
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
