import type { CompiledPolicy } from '../compile';

/** One operation a service exposes: an uppercase method and a path pattern. */
export interface OperationRef {
	method: string;
	path: string;
}

export interface CoverageOptions {
	/**
	 * The prefix the guard is mounted on, e.g. `/api`. Operations outside it
	 * are skipped, because nothing else reaches the guard — a `/health` route
	 * registered before it is not a hole. Omit to check every operation given.
	 */
	mountedOn?: string;
	/**
	 * Substituted for every `{param}` and `:param` before matching. Defaults
	 * to a value no literal segment is likely to be — and it MUST stay that
	 * way: a placeholder that could be a literal (`me`, say) would let a rule
	 * on `/users/me` report `/users/{id}` as covered.
	 */
	placeholder?: string;
	/** Anything else to skip. */
	ignore?: (operation: OperationRef) => boolean;
}

const NON_OPERATION_KEYS = new Set([
	'summary',
	'description',
	'servers',
	'parameters',
	'$ref',
]);

/**
 * The operations an OpenAPI `paths` object declares.
 *
 * `prefix` is what the document leaves out — an OpenAPI path is relative to
 * the server URL, so a service mounted on `/api` writes `/things` there and
 * `/api/things` in its rules file.
 *
 * Note what this source does NOT see: a route that is mounted but not
 * documented. storex-api has three. Prefer the app's own route table where
 * there is one — a Hono `app.routes` is already `{ method, path }[]` and can
 * be passed to `unnamedOperations` directly.
 */
export function openapiOperations(
	paths: Record<string, unknown>,
	options: { prefix?: string } = {},
): OperationRef[] {
	const prefix = options.prefix ?? '';
	const operations: OperationRef[] = [];

	for (const [path, methods] of Object.entries(paths ?? {})) {
		if (!methods || typeof methods !== 'object') continue;
		for (const key of Object.keys(methods)) {
			if (NON_OPERATION_KEYS.has(key)) continue;
			operations.push({ method: key.toUpperCase(), path: `${prefix}${path}` });
		}
	}

	return operations;
}

/**
 * Every operation **no rule names**.
 *
 * This is the check that makes `global.unmatched: deny` turnable on. The flag
 * is only safe once the rules file is exhaustive, and "exhaustive" is not a
 * feeling — it is this list being empty. Run it from the app's own test suite,
 * get it to zero, then set the flag, and the test keeps it at zero.
 *
 * It asks the compiled matchers directly rather than calling `evaluateRest`:
 * the question is "does any rule name this operation", not "would it allow
 * this caller", so there are no claims to invent, no Keto evaluator to stub
 * (which `evaluateRest` demands of any route carrying a `keto` term) and no
 * expression to run.
 *
 * Wildcard mounts (`/api/*`) and `ALL` are skipped: those are middleware, not
 * operations. Duplicates are collapsed.
 *
 * ```ts
 * // From the app's own route table — the mounted surface, which is the one
 * // the guard will actually be asked about.
 * expect(unnamedOperations(policy, app.routes, { mountedOn: '/api' })).toEqual([]);
 *
 * // Or from what it publishes, when there is no route table to hand.
 * expect(
 *   unnamedOperations(policy, openapiOperations(doc.paths, { prefix: '/api' })),
 * ).toEqual([]);
 * ```
 */
export function unnamedOperations(
	policy: CompiledPolicy,
	operations: readonly OperationRef[],
	options: CoverageOptions = {},
): OperationRef[] {
	const placeholder = options.placeholder ?? '__id__';
	const missing: OperationRef[] = [];
	const seen = new Set<string>();

	for (const { method: rawMethod, path } of operations) {
		const method = rawMethod.toUpperCase();
		// `app.use('/api/*', …)` registers as ALL on a wildcard path. It is the
		// guard itself, among others — never something to demand a rule for.
		if (method === 'ALL' || path.includes('*')) continue;
		if (options.mountedOn && !path.startsWith(options.mountedOn)) continue;

		const key = `${method} ${path}`;
		if (seen.has(key)) continue;
		seen.add(key);

		const operation = { method, path };
		if (options.ignore?.(operation)) continue;

		// `{id}` in OpenAPI, `:id` in a route table and in the rules file.
		const concrete = path
			.replace(/\{[^}]+\}/g, placeholder)
			.replace(/:[A-Za-z0-9_]+/g, placeholder);

		const routes = policy.restRoutesByMethod.get(method) ?? [];
		if (!routes.some((route) => route.matcher(concrete) !== false)) {
			missing.push(operation);
		}
	}

	return missing;
}
