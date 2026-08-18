import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared rule entry — used by both REST and GraphQL rule maps
// ---------------------------------------------------------------------------

export const zRuleEntry = z.object({
	/**
	 * Authority groups to check against the caller's claims.
	 *
	 * - null / undefined / empty array  → authenticated caller is sufficient
	 * - Outer array = AND — every group must be satisfied
	 * - Inner array = OR  — at least one authority in the group must match
	 *
	 * The check is performed against the union of claims.authorities,
	 * claims.roles, and the individual items in claims.scope (space-separated).
	 *
	 * @example [["ADMIN", "users:read"]]        — ADMIN or users:read
	 * @example [["ADMIN"], ["users:read"]]       — ADMIN and users:read
	 */
	authorities: z.array(z.array(z.string())).nullish(),

	/**
	 * Optional JavaScript expression evaluated against the request context.
	 * Must return a truthy value for the rule to allow the request.
	 *
	 * Available scope variables differ by evaluator type:
	 *   REST    — `claims`, `req` (body, params, query, headers, cookies)
	 *   GraphQL — `claims`, `args`
	 */
	expression: z
		.object({
			value: z.string(),
			/** Custom error message surfaced when the expression returns falsy. */
			message: z.string().optional(),
		})
		.optional(),
});

export type RuleEntry = z.infer<typeof zRuleEntry>;

// ---------------------------------------------------------------------------
// REST rules  →  path pattern → HTTP method → rule entry
// ---------------------------------------------------------------------------

export const zRestRules = z.record(
	z.string(), // path pattern, e.g. "/users/:id"
	z.record(
		z.string(), // HTTP method, e.g. "GET", "POST"
		zRuleEntry,
	),
);

// ---------------------------------------------------------------------------
// GraphQL rules  →  operation type → field name → rule entry
// ---------------------------------------------------------------------------

export const zGraphqlRules = z.record(
	z.string(), // operation type, e.g. "Query", "Mutation"
	z.record(
		z.string(), // field name, e.g. "createUser"
		zRuleEntry,
	),
);

// ---------------------------------------------------------------------------
// Global configuration block
// ---------------------------------------------------------------------------

export const zGlobalConfig = z.object({
	basePath: z.string().optional(),
	rateLimit: z
		.object({
			windowMs: z.number(),
			max: z.number(),
		})
		.optional(),
	cors: z
		.object({
			origins: z.array(z.string()),
			methods: z.array(z.string()),
			allowedHeaders: z.array(z.string()),
		})
		.optional(),
	/**
	 * Dynamic authority providers — evaluate a JavaScript expression against
	 * the caller's claims and, when truthy, append the listed authorities.
	 */
	providers: z
		.array(
			z.object({
				when: z.string(),
				authorities: z.array(z.string()),
			}),
		)
		.optional(),
});

// ---------------------------------------------------------------------------
// Top-level rules document schema
// ---------------------------------------------------------------------------

export const RulesSchema = z.object({
	global: zGlobalConfig.optional(),
	rest: zRestRules.optional(),
	graphql: zGraphqlRules.optional(),
});

export type Rules = z.infer<typeof RulesSchema>;
