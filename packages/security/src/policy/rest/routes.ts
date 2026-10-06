import type { CompiledPolicy, CompiledRestRoute } from '../compile';

/**
 * The rule sets a request with this method must pass, each searched for its
 * first matching route, in document order.
 *
 * Every method faces its own rules — except HEAD, which faces two sets: its
 * own HEAD rules, then the GET rules. A server answers HEAD by running the GET
 * route (Hono does, with `ctx.req.method` still `HEAD`), so a HEAD request
 * reaches the GET handler and must pass the GET rule. A HEAD rule that
 * matches can add to that, never take away from it: both must allow. The
 * last set is the handler's, and `evaluateRest` lets it alone fall back to
 * `global.unmatched` — so with no GET rule, HEAD faces what a GET would:
 * open by default, refused under `unmatched: deny`.
 *
 * Every matcher goes through here — `evaluateRest` and `unnamedOperations`
 * — so the guard, a dry run and the coverage check cannot disagree about
 * which rules a method faces. Expects an uppercase method.
 */
export function ruleSetsForMethod(
	policy: CompiledPolicy,
	method: string,
): readonly (readonly CompiledRestRoute[])[] {
	const own = policy.restRoutesByMethod.get(method) ?? [];
	if (method !== 'HEAD') return [own];
	return [own, policy.restRoutesByMethod.get('GET') ?? []];
}
