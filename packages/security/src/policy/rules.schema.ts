import { z } from 'zod';
import { zGraphqlRules } from './graphql/schema';
import { zRestRules } from './rest/schema';
import { zCorsConfig, zRateLimitConfig } from './rule-entry.schema';

export { zGraphqlRules } from './graphql/schema';
export { zRestRules } from './rest/schema';
export type { RuleEntry } from './rule-entry.schema';
export { zRuleEntry } from './rule-entry.schema';

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
