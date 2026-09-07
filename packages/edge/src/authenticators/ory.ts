import { claimsFromOryPrincipal } from '@nxgt/security/integrations/ory';
import type {
	PermissionTerm,
	PolicySubject,
	RestEvaluateDeps,
} from '@nxgt/security/policy';
import {
	createEdgeSigner,
	type EdgeSignerConfig,
	evaluateRequirement,
	type Ory,
	type PermissionTerm as OryPermissionTerm,
	type OryPrincipal,
	OryUnavailable,
	type Permission,
	type Subject,
	tuple,
} from 'stx-sdk/ory';
import {
	type Authenticator,
	AuthorityUnavailable,
	type EdgeIdentity,
} from '../types';

// The core speaks the permission vocabulary structurally, so `src/` depends on
// nothing to say it. These two assignments are what keep that honest: if
// either shape drifts, this file stops compiling here rather than mismatching
// at runtime somewhere else. Same device as `@nxgt/security`'s keto entrypoint.
const _subjectsMatch: Subject = null as unknown as PolicySubject;
const _termsMatch: OryPermissionTerm = null as unknown as PermissionTerm;
void _subjectsMatch;
void _termsMatch;

export interface OryAuthenticatorConfig {
	/** The app's `createOry()` — one per process. */
	ory: Ory;
	/**
	 * How the edge vouches for a caller upstream. Give it the same issuer and
	 * the same key set Oathkeeper uses and every fronted app accepts our
	 * tokens with no change at all, which is what makes the switchover a
	 * compose change rather than a bump of the parc.
	 */
	signer: EdgeSignerConfig;
}

/**
 * The Ory authenticator — Kratos sessions, Hydra tokens, and Keto for whether
 * the caller may reach the app at all.
 *
 * This is the only module in `@nxgt/edge` that imports `stx-sdk`, and it is
 * its own entrypoint for that reason: the core is an authenticator interface
 * with no opinion about identity, so an edge in front of a parc with no Ory
 * never loads this and never installs the optional peer.
 *
 * What it does that Ory Oathkeeper does not: an authority that cannot answer
 * becomes `AuthorityUnavailable`, which the edge turns into **503**.
 * Oathkeeper's `cookie_session` has no retry and its error handler no status
 * mapping, so with Kratos down it answers 403 — a refusal a caller cannot
 * tell from a real one, and a UI reads as "you may not" when the truth is
 * "nobody could ask".
 */
export function oryAuthenticator(
	config: OryAuthenticatorConfig,
): Authenticator {
	const { ory } = config;
	const signer = createEdgeSigner(config.signer);

	return {
		name: 'ory',

		async resolve(request: Request): Promise<EdgeIdentity | null> {
			let principal: OryPrincipal | null;
			try {
				principal = await ory.resolve(request.headers);
			} catch (error) {
				if (error instanceof OryUnavailable) {
					throw new AuthorityUnavailable(error.service, error);
				}
				throw error;
			}

			if (!principal) return null;

			return {
				claims: claimsFromOryPrincipal(principal),
				assert: () => signer.sign(principal),
				permissions: ketoFor(ory, principal.subject),
			};
		},
	};
}

/**
 * A Keto evaluator for one request, memoised for that request.
 *
 * An edge asks one question per request today — `App:<app>#use` — so the cache
 * looks like an over-engineering. It is not: a rules document may put the
 * requirement on several rungs, and the cache is what keeps a second rung from
 * being a second round trip. It is keyed by Keto's own
 * `App:bookmarks#use@idn-7` notation, the same key `oryChecks(ory)` uses
 * inside an app, so the two would agree if they ever met.
 */
function ketoFor(ory: Ory, subject: string): RestEvaluateDeps {
	const answers = new Map<string, Promise<boolean>>();

	const check = (permission: Permission, who: Subject): Promise<boolean> => {
		const key = tuple(permission, who);
		let answer = answers.get(key);
		if (!answer) {
			// `isAllowed` goes through `/relation-tuples/check/openapi`, never
			// `/check` — the latter answers a denial with 403, which is
			// indistinguishable from Keto refusing to answer at all. A Keto
			// outage throws `OryUnavailable` and becomes a 503 upstream of
			// here, never `false`.
			answer = ory.isAllowed(permission, who);
			answers.set(key, answer);
		}
		return answer;
	};

	return {
		subject,
		// One evaluator for every vocabulary in the parc — the `@check`
		// directive, `ketoCheck()`, a rules file's `keto` term and now the
		// edge all walk this same DNF, which is what stops them coming to
		// disagree about what `[[A, B], [C]]` means.
		evaluatePermissions: (requirement, objectsOf, who) =>
			evaluateRequirement(requirement, objectsOf, check, who),
	};
}
