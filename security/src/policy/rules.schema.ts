import { z } from 'zod';
import { zGraphqlRules } from './graphql/schema';
import { zCorsConfig, zRateLimitConfig, zRuleEntry } from './rule-entry.schema';

export { zGraphqlRules } from './graphql/schema';
export type { RuleEntry } from './rule-entry.schema';
export { zRuleEntry } from './rule-entry.schema';

// ---------------------------------------------------------------------------
// REST rules  →  path pattern → HTTP method → rule entry
// ---------------------------------------------------------------------------

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
		GET: zRuleEntry.optional(),
		POST: zRuleEntry.optional(),
		PUT: zRuleEntry.optional(),
		PATCH: zRuleEntry.optional(),
		DELETE: zRuleEntry.optional(),
		HEAD: zRuleEntry.optional(),
		OPTIONS: zRuleEntry.optional(),
		CONNECT: zRuleEntry.optional(),
		TRACE: zRuleEntry.optional(),
		/** IETF draft safe-method-with-body — GET semantics with a request body. */
		QUERY: zRuleEntry.optional(),
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

// ---------------------------------------------------------------------------
// Global configuration block
// ---------------------------------------------------------------------------

export const zGlobalConfig = z.object({
	basePath: z
		.string()
		.optional()
		.describe(
			'Prefix prepended to every REST path pattern before matching, e.g. "/api".',
		),
	rateLimit: zRateLimitConfig
		.optional()
		.describe(
			'Default rate limit applied unless a rule declares its own ' +
				'`rateLimit` override. Reserved for future use — not currently ' +
				'enforced by the policy evaluators in this package.',
		),
	cors: zCorsConfig
		.optional()
		.describe(
			'Default CORS policy applied unless a rule declares its own `cors` ' +
				'override. Reserved for future use — not currently enforced by ' +
				'the policy evaluators in this package.',
		),
	/**
	 * Dynamic authority providers — evaluate a JavaScript expression against
	 * the caller's claims and, when truthy, append the listed authorities.
	 */
	providers: z
		.array(
			z.object({
				when: z
					.string()
					.describe(
						'JavaScript expression evaluated against `claims`; truthy activates this provider.',
					),
				authorities: z
					.array(z.string())
					.describe(
						'Authorities granted to the caller when `when` evaluates truthily.',
					),
			}),
		)
		.optional()
		.describe(
			'Reserved for future use — not currently enforced by the policy evaluators in this package. ' +
				'Intended to dynamically grant authorities based on claims.',
		),
});

// ---------------------------------------------------------------------------
// Top-level rules document schema
// ---------------------------------------------------------------------------

export const RulesSchema = z
	.object({
		global: zGlobalConfig
			.optional()
			.describe(
				'Global configuration applied across all rules in this document.',
			),
		rest: zRestRules.optional(),
		graphql: zGraphqlRules.optional(),
	})
	.describe(
		'Authorization policy document consumed by @nxgt/security/policy — ' +
			'defines REST and/or GraphQL access rules and global configuration.',
	);

export type Rules = z.infer<typeof RulesSchema>;
