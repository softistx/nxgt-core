import { parse as parseYaml } from 'yaml';
import { type CompiledPolicy, compilePolicy } from './compile';
import { type Rules, RulesSchema } from './rules.schema';

/**
 * Validates already-parsed rules data against `RulesSchema` and precompiles
 * it in one call — the common case for every consumer of this package:
 * parse once at startup, reuse the returned `CompiledPolicy` for every
 * request. Equivalent to `compilePolicy(RulesSchema.parse(raw))`.
 */
export function parseRules(raw: unknown): CompiledPolicy {
	return compilePolicy(RulesSchema.parse(raw));
}

/**
 * Reads a rules YAML (or JSON — YAML is a superset) file from disk and
 * validates it against `RulesSchema`, without compiling it. Useful when the
 * raw document is needed as well as (or instead of) a `CompiledPolicy` — e.g.
 * `policyGuard`/`applyGraphqlPolicy`, which only accept a raw document and
 * compile it themselves.
 */
export async function loadRawRulesFromFile(path: string): Promise<Rules> {
	const text = await Bun.file(path).text();
	return RulesSchema.parse(parseYaml(text));
}

/**
 * `loadRawRulesFromFile`, then `compilePolicy`. Call once at startup; the
 * file is read fresh each call, so restarting the process (not rebuilding
 * it) is enough to pick up a changed rules file.
 */
export async function loadRulesFromFile(path: string): Promise<CompiledPolicy> {
	return compilePolicy(await loadRawRulesFromFile(path));
}

export interface LoadRulesFromEnvOptions {
	/** Environment variable holding the rules file path. */
	envVar: string;
	/**
	 * Path used when `envVar` isn't set. Resolved relative to the process's
	 * current working directory, same as `loadRulesFromFile`.
	 */
	fallbackPath?: string;
}

function resolveRulesPath(options: LoadRulesFromEnvOptions): string {
	const path = process.env[options.envVar] ?? options.fallbackPath;
	if (!path) {
		throw new Error(
			`Environment variable "${options.envVar}" is not set and no ` +
				'fallbackPath was provided.',
		);
	}
	return path;
}

/**
 * `loadRawRulesFromFile`, with the path read from an environment variable
 * instead of a hardcoded literal — lets ops point at a different rules file
 * at deploy time (or swap it at runtime, e.g. a mounted volume) without a
 * rebuild. Throws if `envVar` isn't set and no `fallbackPath` was given.
 */
export async function loadRawRulesFromEnv(
	options: LoadRulesFromEnvOptions,
): Promise<Rules> {
	return loadRawRulesFromFile(resolveRulesPath(options));
}

/**
 * `loadRawRulesFromEnv`, then `compilePolicy`. See `loadRawRulesFromEnv`.
 */
export async function loadRulesFromEnv(
	options: LoadRulesFromEnvOptions,
): Promise<CompiledPolicy> {
	return compilePolicy(await loadRawRulesFromEnv(options));
}
