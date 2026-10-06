import type {
	PermissionEvaluator,
	PermissionRequirement,
	PermissionTerm,
	PolicySubject,
} from './permissions.types';
import type { EvaluateResult } from './rest/evaluator';

/** One declared check: a requirement, and how ITS failure is answered. */
export interface KetoRung {
	permissions: PermissionRequirement;
	onDeny: 'NOT_FOUND' | 'FORBIDDEN';
	message?: string | undefined;
}

/** What a caller must supply for a rule carrying `keto` to be answerable. */
export interface KetoDeps {
	/**
	 * The DNF walk, with its Keto `check` already bound to this request's
	 * batching, memoising loader. See `permissions.types.ts` for why the core
	 * takes it rather than importing one.
	 */
	evaluatePermissions?: PermissionEvaluator | undefined;
	/** The Keto subject. In an Ory-native app this is `claims.sub`. */
	subject?: PolicySubject | null | undefined;
}

/**
 * Deps that are worked out only when a Keto rung first reads them.
 *
 * The guard and the GraphQL wrapper run before they know which rule applies,
 * and the provider they are given (`ketoPermissions()`) throws when the app
 * has no Keto loader — which is right for a rule that asks Keto something and
 * wrong for every other one. `evaluateKetoRungs` reads these two fields only
 * after it has found a rung, so a request whose rule has no `keto` term never
 * calls `resolve`. The result is remembered, so a rule with several rungs
 * calls it once. A `resolve` that throws throws from the first rung, with its
 * own message.
 */
export function lazyKetoDeps(resolve: () => KetoDeps | undefined): KetoDeps {
	let resolved: { deps: KetoDeps | undefined } | undefined;
	const deps = () => {
		resolved ??= { deps: resolve() };
		return resolved.deps;
	};
	return {
		get evaluatePermissions() {
			return deps()?.evaluatePermissions;
		},
		get subject() {
			return deps()?.subject;
		},
	};
}

/**
 * Walk a rule's Keto rungs in declaration order.
 *
 * Returns the refusal of the first rung that fails, or `undefined` when every
 * rung passed — the shape a caller can use as `return refusal ?? allow`.
 *
 * **Both evaluators call this one function.** The rungs, the order, the
 * short-circuit and the denial mapping are identical for REST and GraphQL;
 * only where an object id is read from differs, and that arrives as
 * `objectsOf`. Two copies of this would be two chances for `[[A, B], [C]]` to
 * come to mean different things on the two sides — the very drift the shared
 * `evaluateRequirement` exists to prevent.
 */
export async function evaluateKetoRungs(
	rungs: KetoRung[] | undefined,
	deps: KetoDeps,
	objectsOf: (term: PermissionTerm) => string[],
	where: string,
	describeWhere: string,
): Promise<EvaluateResult | undefined> {
	if (!rungs?.length) return undefined;

	for (const rung of rungs) {
		if (!deps.evaluatePermissions) {
			throw new Error(
				`Policy: ${where} declares a \`keto\` check, but no permission ` +
					'evaluator was supplied. Pass one — `ketoPermissions()` from ' +
					'`@nxgt/security/integrations/hono/keto` or ' +
					'`@nxgt/security/integrations/graphql/keto` — mounted after the ' +
					'middleware or plugin that publishes the per-request Keto loader.',
			);
		}
		if (!deps.subject) {
			// The caller passed the authentication floor (its claims name a
			// `sub` or a `clientId`), but the provider has no Keto subject for
			// it — claims from another resolver than `oryAuth()` /
			// `useOryAuth()`, say. There is nobody to ask Keto about, so this
			// fails closed. (A `public` rule would land here too, which is why
			// compilePolicy refuses to pair it with `keto`.)
			return {
				decision: 'UNAUTHENTICATED',
				reason: `${where} needs a subject to ask Keto about`,
			};
		}

		const allowed = await deps.evaluatePermissions(
			rung.permissions,
			objectsOf,
			deps.subject,
		);

		if (!allowed) {
			return {
				decision: 'DENY',
				denial: rung.onDeny,
				// The same fallbacks as `ketoCheck()` and the `@check` directive:
				// rails that refuse the same thing must say it with the same words.
				message:
					rung.message ??
					(rung.onDeny === 'FORBIDDEN'
						? 'errors.insufficient-permissions'
						: 'errors.not-found'),
				reason: `Keto refused ${describe(rung.permissions)} for ${describeWhere}`,
			};
		}
	}

	return undefined;
}

/** A requirement, in the `Namespace#permit` shorthand, for a log line. */
function describe(requirement: PermissionRequirement): string {
	return requirement
		.map((group) =>
			group.map((term) => `${term.namespace}#${term.permit}`).join(' and '),
		)
		.join(' or ');
}
