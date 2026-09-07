import type { Context } from 'hono';
import {
	evaluateRequirement,
	type PermissionTerm as OryPermissionTerm,
	type Permission,
	type Subject,
} from 'stx-sdk/ory';
import type { PermissionTerm, PolicySubject } from '../../policy';
import type { PolicyPermissions } from './policy-guard';

// The core declares the permission vocabulary structurally so that `src/policy`
// depends on nothing to speak it (see `policy/permissions.types.ts`). These two
// assignments are what keep that claim honest: if either shape drifts, this
// file stops compiling, here, rather than mismatching at runtime somewhere else.
const _subjectsMatch: Subject = null as unknown as PolicySubject;
const _termsMatch: OryPermissionTerm = null as unknown as PermissionTerm;
void _subjectsMatch;
void _termsMatch;

/**
 * Bind a rules file's Keto terms to the app's Ory wiring.
 *
 * This is the **only** module in `@nxgt/security` that imports `stx-sdk`, and
 * it is its own entrypoint for that reason: a service whose rules file has no
 * `keto` term never imports it, so `stx-sdk` — an optional peer — never has to
 * be installed. The gateway, oauth-api and storex-api authenticate with
 * oauth-api JWTs and will never ask Keto anything; they should not carry it.
 *
 * It reads two things `@nxgt/shared-hono` already puts on the context:
 *
 * - `ory.subject`, the caller — from `oryAuth()`.
 * - `ketoChecks`, the per-request `DataLoader` — from `oryChecks(ory)`, which
 *   must therefore be mounted **before** the guard. That loader is what makes
 *   a second rail free: it memoises by Keto's own `Bookmark:b1#view@idn-7`
 *   notation, so the same question asked by the rules file and again by a
 *   `ketoCheck()` on the route costs one round trip between them.
 *
 * `evaluateRequirement` comes from `stx-sdk/ory` rather than being rewritten
 * here, so the rules file, the `@check` directive and `ketoCheck()` all walk
 * the same DNF and cannot come to disagree about what `[[A, B], [C]]` means.
 *
 * ```ts
 * app.use('/api/*', policyGuard(rawRules, { permissions: ketoPermissions() }));
 * ```
 */
export function ketoPermissions() {
	return (ctx: Context): PolicyPermissions => {
		const check = ctx.get('ketoChecks');
		if (!check) {
			throw new Error(
				'policyGuard: a rule carries a `keto` check, but oryChecks(ory) is ' +
					'not mounted on this app — mount it before the guard.',
			);
		}

		return {
			subject: ctx.get('ory')?.subject,
			evaluatePermissions: (requirement, objectsOf, subject) =>
				evaluateRequirement(
					requirement,
					objectsOf,
					check as (
						permission: Permission,
						subject: Subject,
					) => Promise<boolean>,
					subject as Subject,
				),
		};
	};
}
