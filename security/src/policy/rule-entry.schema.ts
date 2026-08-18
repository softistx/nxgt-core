import { z } from 'zod';

// ---------------------------------------------------------------------------
// Reusable sub-schemas — shared between `global` and per-rule overrides
// ---------------------------------------------------------------------------

export const zCorsConfig = z.object({
	origins: z.array(z.string()).describe('Allowed CORS origins.'),
	methods: z.array(z.string()).describe('Allowed CORS HTTP methods.'),
	allowedHeaders: z.array(z.string()).describe('Allowed CORS request headers.'),
});

export const zRateLimitConfig = z.object({
	windowMs: z.number().describe('Rate-limit window size, in milliseconds.'),
	limit: z.number().describe('Maximum number of requests allowed per window.'),
});

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
	 *   GraphQL — `claims`, `args`, `source`, `info`
	 */
	expression: z
		.object({
			value: z
				.string()
				.describe(
					'JavaScript expression source evaluated at request time; must ' +
						'return a truthy value for the rule to allow the request. ' +
						'REST rules see `claims` and `req` (body, params, query, ' +
						'headers, cookies) in scope; GraphQL rules see `claims`, ' +
						"`args`, `source` (the resolver's parent/source value — " +
						'useful for ownership checks like `source.id === claims.sub`), ' +
						'and `info` (the GraphQLResolveInfo). Example: ' +
						'"args.input.username.toLowerCase() !== \'admin\'".',
				)
				.meta({
					// Not exhaustive, and not enforced — these just seed editor
					// autocompletion (vscode-yaml suggests `examples` as value
					// choices for a string field) with realistic starting points,
					// since the field itself is arbitrary JS and can't offer real
					// member-level completion (e.g. typing `claims.` and seeing
					// `roles`/`scope`) through a JSON Schema alone.
					examples: [
						// REST
						"req.body.username.toLowerCase() !== 'admin'",
						"req.method === 'GET' || claims.roles?.includes('ADMIN')",
						'req.params.id === claims.sub',
						// GraphQL
						"args.input.username.toLowerCase() !== 'admin'",
						'source.id === claims.sub',
						"info.fieldName !== 'ssn' || claims.roles?.includes('ADMIN')",
					],
				}),
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

	cors: zCorsConfig
		.optional()
		.describe(
			'Per-rule CORS override. Reserved for future use — not currently ' +
				'enforced by the policy evaluators in this package.',
		),

	rateLimit: zRateLimitConfig
		.optional()
		.describe(
			'Per-rule rate-limit override. Reserved for future use — not ' +
				'currently enforced by the policy evaluators in this package.',
		),
});

export type RuleEntry = z.infer<typeof zRuleEntry>;
