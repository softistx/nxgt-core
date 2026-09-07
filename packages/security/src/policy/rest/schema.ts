import { z } from 'zod';
import { zKetoCheck, zRuleEntry } from '../rule-entry.schema';

// ---------------------------------------------------------------------------
// REST rules  →  path pattern → HTTP method → rule entry
// ---------------------------------------------------------------------------

/**
 * A REST rule: everything a shared rule entry carries, plus `keto`.
 *
 * `keto` lives HERE and not on `zRuleEntry` on purpose. `zRuleEntry` feeds
 * the GraphQL rule map too, and `evaluateGraphql` honours no Keto term — a
 * field declared on the shared entry would be advertised by the generated
 * JSON Schema under `graphql:`, autocompleted by the editor, accepted by the
 * parser, and then silently ignored. A primitive that no-ops in one of two
 * evaluators is worse than one that does not exist there at all.
 */
export const zRestRuleEntry = zRuleEntry.extend({
	/**
	 * Per-object permission checks, answered by Keto.
	 *
	 * A LIST, evaluated in order, each entry the exact equivalent of one
	 * `ketoCheck()` middleware — because that is how the 404-then-403 ladder is
	 * written: `view` first with a NOT_FOUND denial, then `edit` with a
	 * FORBIDDEN one. A stranger is told the object is not there; a viewer who
	 * tries to write is told they may not.
	 *
	 * Evaluated LAST, after the authentication floor, `authorities` and
	 * `expression` — those three are local and synchronous, and there is no
	 * reason to cross the network for a question already answerable here.
	 */
	keto: z
		.array(zKetoCheck)
		.optional()
		.describe(
			'Per-object permission checks answered by Keto, evaluated in order ' +
				'after `authorities` and `expression`. Each entry is one check ' +
				'with its own denial: list `view` (NOT_FOUND) then `edit` ' +
				'(FORBIDDEN) to get the 404-then-403 ladder. Requires the guard to ' +
				'be given a permission evaluator — a rule that asks for one ' +
				'without it throws rather than denying.',
		),
});

export type RestRuleEntry = z.infer<typeof zRestRuleEntry>;

/**
 * Rule entries for one path pattern, keyed by HTTP method. Modeled as an
 * object with explicit optional properties — rather than
 * `z.record(z.string(), ...)` — specifically so JSON-Schema-aware editors
 * can autocomplete method names as direct properties of a path entry: an
 * open dictionary (`additionalProperties`) has no enumerable keys for the
 * editor to suggest, whereas an explicit `properties` map does. This
 * mirrors the OpenAPI `paths` object convention (open dictionary of path
 * patterns, each holding an explicit set of method properties).
 *
 * `.strict()` so a typo'd method name (e.g. "GTE") fails validation at
 * startup with a clear Zod error, instead of being silently stripped and
 * leaving that route with no rule (which `evaluateRest` would then treat
 * as NOT_APPLICABLE / open by default).
 */
const zRestMethodMap = z
	.object({
		GET: zRestRuleEntry.optional(),
		POST: zRestRuleEntry.optional(),
		PUT: zRestRuleEntry.optional(),
		PATCH: zRestRuleEntry.optional(),
		DELETE: zRestRuleEntry.optional(),
		HEAD: zRestRuleEntry.optional(),
		OPTIONS: zRestRuleEntry.optional(),
		CONNECT: zRestRuleEntry.optional(),
		TRACE: zRestRuleEntry.optional(),
		/** IETF draft safe-method-with-body — GET semantics with a request body. */
		QUERY: zRestRuleEntry.optional(),
	})
	.strict()
	.describe('Rule entries keyed by HTTP method for this path pattern.');

/**
 * REST rules keyed by path pattern then HTTP method (mirrors OpenAPI's
 * `paths` object). Path patterns can't be enumerated ahead of time (they're
 * arbitrary, service-defined routes), so this level stays an open
 * dictionary — but each path's methods are explicit properties, see
 * `zRestMethodMap`. Matched in document order — first pattern that matches
 * wins.
 */
export const zRestRules = z
	.record(
		z
			.string()
			.describe('Path pattern in path-to-regexp syntax, e.g. "/users/:id".'),
		zRestMethodMap,
	)
	.describe(
		'REST authorization rules, keyed by path pattern then HTTP method. ' +
			'The first path pattern that matches the request path (in document ' +
			'order) is used.',
	);
