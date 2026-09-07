import type { PolicyClaims, RestEvaluateDeps } from '@nxgt/security/policy';

/**
 * A caller an authenticator has resolved.
 *
 * It is deliberately not "a principal": the edge does not need the shape any
 * particular identity provider produces, only the two things it does with a
 * caller — decide about them, and vouch for them upstream.
 */
export interface EdgeIdentity {
	/** The caller in the vocabulary a rules document reads. */
	claims: PolicyClaims;

	/**
	 * The `Authorization` value to hand the upstream — a signed assertion,
	 * never a copy of the caller's own credential.
	 *
	 * A function, and lazy on purpose: in `mirror` mode nothing is minted,
	 * because the request must reach the edge being mirrored carrying the
	 * credential IT needs to authenticate.
	 */
	assert(): Promise<string>;

	/**
	 * What a `keto:` term in the rules document is evaluated with — the
	 * subject and the per-request evaluator. Absent when the authenticator has
	 * no permission system behind it, which is legitimate: a document that
	 * only asks for authorities needs none.
	 */
	permissions?: RestEvaluateDeps;
}

/**
 * How the edge learns who is calling.
 *
 * One method per implementation, tried in order, first non-null winning. The
 * Ory one is the first; an oauth-api introspection one is written three times
 * in the parc already and will be the second the day the edge fronts an app
 * that is not Ory-native.
 */
export interface Authenticator {
	/** Named in logs and in the decision record. */
	name: string;

	/**
	 * `null` when the request carried no credential this authenticator
	 * honours — anonymous, which is a legitimate answer and may still be
	 * allowed by a `public: true` rule.
	 *
	 * MUST THROW `AuthorityUnavailable` when the authority could not answer.
	 * Returning `null` there is the defect this whole edge exists to fix: it
	 * turns an outage into a refusal, and a refusal is indistinguishable from
	 * a real one.
	 */
	resolve(request: Request): Promise<EdgeIdentity | null>;
}

/**
 * The authority behind an authenticator could not answer.
 *
 * The core maps it to **503**, never 401 and never 403. Ory Oathkeeper's
 * `cookie_session` returns 403 when Kratos is down, which is the measured
 * defect this replaces: at the edge, "I could not ask" and "the answer was no"
 * must not be the same status.
 */
export class AuthorityUnavailable extends Error {
	constructor(
		readonly authority: string,
		override readonly cause?: unknown,
	) {
		super(`${authority} could not answer`);
		this.name = 'AuthorityUnavailable';
	}
}

/**
 * `mirror` — decide, log, and forward the request **unchanged**. Nothing is
 * minted, nothing is refused. This is how the edge is compared against the one
 * it replaces on real traffic, with the one it replaces still answering.
 *
 * `enforce` — decide and act: refuse, or forward with a signed assertion.
 */
export type EdgeMode = 'mirror' | 'enforce';

/** What the edge decided, for the log and for the differential harness. */
export interface EdgeDecision {
	method: string;
	host: string;
	path: string;
	/** The routing table entry that matched, or `null` if none did. */
	app: string | null;
	/** The authenticator that resolved the caller, or `null` if anonymous. */
	authenticator: string | null;
	subject: string | null;
	decision: 'ALLOW' | 'DENY' | 'NOT_APPLICABLE' | 'UNAUTHENTICATED';
	reason: string;
	/** The status the edge would answer. 0 when it would forward. */
	status: number;
}
