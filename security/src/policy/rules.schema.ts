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
	authorities: z
		.array(z.array(z.string()))
		.nullish()
		.describe(
			'Authority groups checked against the union of claims.authorities, ' +
				'claims.roles, and space-separated claims.scope tokens. Outer array ' +
				'is AND (every group must be satisfied), inner array is OR (at ' +
				'least one authority in the group must match). Omit, or use an ' +
				'empty/null value, to require only that the caller is authenticated. ' +
				'Example: [["ADMIN", "users:read"]] means ADMIN OR users:read; ' +
				'[["ADMIN"], ["users:read"]] means ADMIN AND users:read.',
		),

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
			value: z
				.string()
				.describe(
					'JavaScript expression source evaluated at request time; must ' +
						'return a truthy value for the rule to allow the request. ' +
						'REST rules see `claims` and `req` (body, params, query, ' +
						'headers, cookies) in scope; GraphQL rules see `claims` and ' +
						'`args`. Example: "args.input.username.toLowerCase() !== ' +
						"'admin'\".",
				),
			message: z
				.string()
				.optional()
				.describe(
					'Custom error message surfaced when the expression returns ' +
						'falsy. Defaults to "Expression check failed".',
				),
		})
		.optional()
		.describe(
			'Optional JavaScript expression check evaluated in addition to (and ' +
				'after) the authorities check.',
		),
});

export type RuleEntry = z.infer<typeof zRuleEntry>;

// ---------------------------------------------------------------------------
// REST rules  →  path pattern → HTTP method → rule entry
// ---------------------------------------------------------------------------

export const zRestRules = z
	.record(
		z
			.string()
			.describe('Path pattern in path-to-regexp syntax, e.g. "/users/:id".'),
		z.record(
			z.string().describe('HTTP method, e.g. "GET", "POST".'),
			zRuleEntry,
		),
	)
	.describe(
		'REST authorization rules, keyed by path pattern then HTTP method. ' +
			'The first path pattern that matches the request (in document ' +
			'order) is used.',
	);

// ---------------------------------------------------------------------------
// GraphQL rules  →  operation type → field name → rule entry
// ---------------------------------------------------------------------------

export const zGraphqlRules = z
	.record(
		z
			.string()
			.describe(
				'GraphQL operation type, e.g. "Query", "Mutation", "Subscription".',
			),
		z.record(
			z.string().describe('Resolved GraphQL field name, e.g. "createUser".'),
			zRuleEntry,
		),
	)
	.describe(
		'GraphQL authorization rules, keyed by operation type then field name.',
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
	rateLimit: z
		.object({
			windowMs: z.number().describe('Rate-limit window size, in milliseconds.'),
			max: z
				.number()
				.describe('Maximum number of requests allowed per window.'),
		})
		.optional()
		.describe(
			'Reserved for future use — not currently enforced by the policy evaluators in this package.',
		),
	cors: z
		.object({
			origins: z.array(z.string()).describe('Allowed CORS origins.'),
			methods: z.array(z.string()).describe('Allowed CORS HTTP methods.'),
			allowedHeaders: z
				.array(z.string())
				.describe('Allowed CORS request headers.'),
		})
		.optional()
		.describe(
			'Reserved for future use — not currently enforced by the policy evaluators in this package.',
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
