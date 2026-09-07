import type { CompiledPolicy } from '../compile';

/** One operation an API publishes: an uppercase method and a path pattern. */
export interface OperationRef {
	method: string;
	path: string;
}

export interface CoverageOptions {
	/**
	 * Prefix the service is mounted under, when the OpenAPI document's paths
	 * are relative to it. Not the same thing as `global.basePath`, which the
	 * compiled patterns already carry — this is what the OpenAPI document
	 * leaves out. Usually they are the same string.
	 */
	basePath?: string;
	/**
	 * Substituted for every `{param}` in an OpenAPI path before matching.
	 * Defaults to a value no literal segment is likely to be.
	 */
	placeholder?: string;
	/** Operations to skip, e.g. a health endpoint mounted before the guard. */
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
 * Every operation in an OpenAPI `paths` object that **no rule names**.
 *
 * This is the check that makes `global.unmatched: deny` turnable on. The flag
 * is only safe once the rules file is exhaustive, and "exhaustive" is not a
 * feeling — it is this list being empty. Run it from the app's own test suite,
 * get it to zero, then set the flag, and the test keeps it at zero.
 *
 * It asks the matchers directly rather than calling `evaluateRest`: the
 * question is "does any rule name this operation", not "would it allow this
 * caller", so there are no claims to invent, no Keto evaluator to stub and no
 * expression to run.
 *
 * ```ts
 * const missing = unnamedOperations(
 *   parseRules(await loadRawRulesFromFile('rules.yaml')),
 *   (Bun.YAML.parse(await Bun.file('openapi/api-docs.yaml').text()) as any).paths,
 *   { basePath: '/api' },
 * );
 * expect(missing).toEqual([]);
 * ```
 */
export function unnamedOperations(
	policy: CompiledPolicy,
	paths: Record<string, unknown>,
	options: CoverageOptions = {},
): OperationRef[] {
	const placeholder = options.placeholder ?? '__id__';
	const basePath = options.basePath ?? '';
	const missing: OperationRef[] = [];

	for (const [path, operations] of Object.entries(paths ?? {})) {
		if (!operations || typeof operations !== 'object') continue;

		for (const key of Object.keys(operations)) {
			if (NON_OPERATION_KEYS.has(key)) continue;

			const method = key.toUpperCase();
			const operation = { method, path };
			if (options.ignore?.(operation)) continue;

			// `{id}` in OpenAPI, `:id` in the rules file — substitute a concrete
			// segment so the compiled matcher has something to capture.
			const concrete =
				basePath + path.replace(/\{[^}]+\}/g, placeholder as string);

			const routes = policy.restRoutesByMethod.get(method) ?? [];
			if (!routes.some((route) => route.matcher(concrete) !== false)) {
				missing.push(operation);
			}
		}
	}

	return missing;
}
