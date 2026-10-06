import type { CompiledPolicy } from '../compile';
import { REST_METHODS, ruleSetsForMethod } from './routes';

/** One operation a service exposes: an uppercase method and a path pattern. */
export interface OperationRef {
	method: string;
	path: string;
	/**
	 * The handler registered for it, when the operations come from a route
	 * table (a Hono `app.routes` entry carries one). Read structurally, so this
	 * module imports nothing from a framework; only used to tell a middleware
	 * mounted on an exact path from a handler that answers every method.
	 */
	handler?: unknown;
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
 * Wildcard mounts (`/api/*`, any method) are skipped: those are middleware,
 * not operations. An `ALL` on an exact path is reported unless every method
 * the rules schema knows is named for it — except a middleware mounted on that
 * path in front of a later route (`app.use('/x', …)` then `app.get('/x', …)`),
 * which is skipped: see `isMiddlewareMount`. Duplicates are collapsed.
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

	for (const [
		index,
		{ method: rawMethod, path, handler },
	] of operations.entries()) {
		const method = rawMethod.toUpperCase();
		// `app.use('/api/*', …)` registers as ALL on a wildcard path. It is the
		// guard itself, among others — never something to demand a rule for.
		// An ALL on an exact path (`app.all('/api/doc', …)`) is a handler that
		// answers every method, so it is checked below like any other.
		if (path.includes('*')) continue;
		if (options.mountedOn && !path.startsWith(options.mountedOn)) continue;
		// Before the duplicate check, so a skipped middleware never hides an
		// `app.all` handler registered later on the same path.
		if (
			method === 'ALL' &&
			isMiddlewareMount(handler, path, operations.slice(index + 1))
		) {
			continue;
		}

		const key = `${method} ${path}`;
		if (seen.has(key)) continue;
		seen.add(key);

		const operation = { method, path };
		if (options.ignore?.(operation)) continue;

		// `{id}` in OpenAPI, `:id` in a route table and in the rules file.
		const concrete = path
			.replace(/\{[^}]+\}/g, placeholder)
			.replace(/:[A-Za-z0-9_]+/g, placeholder);

		// Named when any rule set the method faces matches it — HEAD is
		// named by a HEAD rule or a GET one.
		const isNamed = (m: string) =>
			ruleSetsForMethod(policy, m).some((routes) =>
				routes.some((route) => route.matcher(concrete) !== false),
			);
		// ALL is named only when every method a rules file can name is: a
		// method left out reaches the handler with no rule applied. Methods
		// the schema cannot name at all (`PURGE`) are out of reach here —
		// `global.unmatched: deny` is what closes those.
		const named =
			method === 'ALL' ? REST_METHODS.every(isNamed) : isNamed(method);
		if (!named) {
			missing.push(operation);
		}
	}

	return missing;
}

/**
 * Whether an exact-path `ALL` entry is a middleware in front of a route
 * rather than a handler that answers every method — both register as `ALL`
 * in Hono (`app.use('/x', mw)` and `app.all('/x', h)`).
 *
 * Both must hold:
 *
 * - the handler is middleware-shaped: it takes `next`. This is Hono's own
 *   test (`isMiddleware` / `findTargetHandler` in `hono/utils/handler`, the
 *   ones `hono/dev`'s `inspectRoutes` uses): unwrap `__COMPOSED_HANDLER`,
 *   which `app.route()` sets when it wraps a sub-app's handlers in that
 *   sub-app's `onError`, then check `length > 1`;
 * - a later entry has the same path, so there is a route for it to pass to.
 *   A middleware with nothing after it answers every method itself.
 *
 * An entry with no handler (an OpenAPI document, a hand-written list) is
 * never a middleware mount.
 */
function isMiddlewareMount(
	handler: unknown,
	path: string,
	later: readonly OperationRef[],
): boolean {
	let target = handler;
	while (
		typeof target === 'function' &&
		(target as { __COMPOSED_HANDLER?: unknown }).__COMPOSED_HANDLER
	) {
		target = (target as { __COMPOSED_HANDLER?: unknown }).__COMPOSED_HANDLER;
	}
	return (
		typeof target === 'function' &&
		target.length > 1 &&
		later.some((operation) => operation.path === path)
	);
}
