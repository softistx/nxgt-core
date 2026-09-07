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
	/**
	 * What a REST path no rule names is answered.
	 *
	 * `allow` — the default, and what every document did before this field
	 * existed. `deny` closes the door and makes the rules file the exhaustive
	 * statement of what the service exposes.
	 */
	unmatched: z
		.enum(['allow', 'deny'])
		.default('allow')
		.describe(
			'What a REST request no rule matches is answered. "allow" (the ' +
				'default, and the behaviour of every document written before this ' +
				'field existed) lets it through — the rules file adds protections ' +
				'to the paths it names and says nothing about the others. "deny" ' +
				'makes the file the EXHAUSTIVE statement of what this service ' +
				'exposes: an unnamed path is refused, 401 for an anonymous caller ' +
				'and 403 otherwise, exactly as a matched rule would refuse them. ' +
				'Turn it on only once every published operation has an entry — ' +
				'the point is that forgetting one then fails loudly instead of ' +
				'silently leaving it open. REST ONLY: see the note in the ' +
				'package README on why GraphQL has no equivalent.',
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
