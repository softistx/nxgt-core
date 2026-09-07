import {
	evaluateRequirement,
	type PermissionTerm as OryPermissionTerm,
	type Permission,
	type Subject,
} from 'stx-sdk/ory';
import type { PermissionTerm, PolicySubject } from '../../policy';
import type { ApplyGraphqlPolicyOptions } from '../../policy/graphql/resolvers';

// The core declares the permission vocabulary structurally so that
// `src/policy` depends on nothing to speak it (see
// `policy/permissions.types.ts`). These two assignments keep that claim
// honest: if either shape drifts, this file stops compiling, here.
const _subjectsMatch: Subject = null as unknown as PolicySubject;
const _termsMatch: OryPermissionTerm = null as unknown as PermissionTerm;
void _subjectsMatch;
void _termsMatch;

/** The slice of a GraphQL context this adapter needs. */
interface OryGraphqlContext {
	ory?: { subject?: string | null } | null;
	ketoChecks?: (permission: Permission, subject: Subject) => Promise<boolean>;
}

/**
 * Bind a rules file's `keto` terms to the server's Ory wiring.
 *
 * The twin of `ketoPermissions()` in `integrations/hono/keto`, and its own
 * entrypoint for the same reason: it is the only module on this side that
 * imports `stx-sdk`, so a server whose rules ask Keto nothing never resolves
 * it.
 *
 * It reads two things `@nxgt/shared-graphql` already puts on the context:
 *
 * - `ory.subject`, the caller — from `useOryAuth(ory)`.
 * - `ketoChecks`, the per-request `DataLoader` — from `useKetoChecks(ory)`,
 *   which must therefore be registered **before** this runs. That loader is
 *   what makes a second rail free: it memoises by Keto's own
 *   `Note:n1#view@idn-7` notation, so the same question asked by the rules
 *   file and again by a `@check` on the field costs one round trip between
 *   them.
 *
 * `evaluateRequirement` comes from `stx-sdk/ory` rather than being rewritten,
 * so the rules file, `@check` and `ketoCheck()` all walk the same DNF.
 *
 * ```ts
 * applyGraphqlPolicy(schema, rawRules, {
 *   getClaims: (ctx) => (ctx as IContext).claims,
 *   permissions: ketoPermissions(),
 * });
 * ```
 */
export function ketoPermissions(): NonNullable<
	ApplyGraphqlPolicyOptions['permissions']
> {
	return (context: unknown) => {
		const ctx = (context ?? {}) as OryGraphqlContext;
		const check = ctx.ketoChecks;
		if (!check) {
			throw new Error(
				'applyGraphqlPolicy: a rule carries a `keto` check, but ' +
					'useKetoChecks(ory) is not registered on this server — register ' +
					'it before serving the policed schema.',
			);
		}

		return {
			subject: ctx.ory?.subject,
			evaluatePermissions: (requirement, objectsOf, subject) =>
				evaluateRequirement(requirement, objectsOf, check, subject as Subject),
		};
	};
}
