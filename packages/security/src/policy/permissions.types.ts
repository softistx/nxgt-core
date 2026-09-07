/**
 * The permission vocabulary, declared structurally so that `src/policy/` — the
 * framework-agnostic core — depends on nothing to speak it.
 *
 * Every type here is structurally identical to its namesake in `stx-sdk/ory`,
 * and deliberately so: the Keto adapter in `src/integrations/hono/keto.ts`
 * passes values straight between the two with no conversion. That adapter
 * carries a compile-time assertion pinning the two shapes together, so a drift
 * in either is a type error rather than a runtime surprise.
 *
 * Why not just import them: `stx-sdk` would then be a hard dependency of the
 * whole package, and the three services that use a rules file today — the
 * gateway, oauth-api and storex-api — authenticate with oauth-api JWTs and
 * will never ask Keto anything. They should not carry it.
 */

/** One term: "the caller holds `permit` on `namespace`:<the id at `id`>". */
export interface PermissionTerm {
	namespace: string;
	permit: string;
	/** `param.<name>`, `query.<name>` or `json.<path>` — read off the request. */
	id: string;
}

/**
 * Disjunctive normal form: the OUTER list is OR, the INNER list is AND.
 * `[[A, B], [C]]` reads "(A and B) or C" — the same grammar as the `@check`
 * directive and `ketoCheck()`.
 */
export type PermissionRequirement = PermissionTerm[][];

/** A Keto subject: an identity id, or a subject set. */
export type PolicySubject =
	| string
	| {
			subjectSet: { namespace: string; object: string; relation: string };
	  };

/**
 * The whole DNF walk, injected rather than implemented here.
 *
 * The core hands over the requirement, a way to resolve each term's object
 * ids from this request, and the subject; the adapter supplies
 * `evaluateRequirement` from `stx-sdk/ory` with its `check` already bound to
 * the per-request DataLoader. One evaluator serves the rules file, the
 * `@check` directive and `ketoCheck()`, so the three cannot disagree about
 * what `[[A, B], [C]]` means.
 */
export type PermissionEvaluator = (
	requirement: PermissionRequirement,
	objectsOf: (term: PermissionTerm) => string[],
	subject: PolicySubject,
) => Promise<boolean>;
