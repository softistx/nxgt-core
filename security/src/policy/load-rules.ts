import { parse as parseYaml } from 'yaml';
import { type CompiledPolicy, compilePolicy } from './compile';
import { RulesSchema } from './rules.schema';

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
 * Reads a rules YAML (or JSON — YAML is a superset) file from disk,
 * validates it, and precompiles it. Call once at startup; the file is read
 * fresh each call, so restarting the process (not rebuilding it) is enough
 * to pick up a changed rules file.
 */
export async function loadRulesFromFile(path: string): Promise<CompiledPolicy> {
	const text = await Bun.file(path).text();
	return parseRules(parseYaml(text));
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

/**
 * `loadRulesFromFile`, with the path read from an environment variable
 * instead of a hardcoded literal — lets ops point at a different rules file
 * at deploy time (or swap it at runtime, e.g. a mounted volume) without a
 * rebuild. Throws if `envVar` isn't set and no `fallbackPath` was given.
 */
export async function loadRulesFromEnv(
	options: LoadRulesFromEnvOptions,
): Promise<CompiledPolicy> {
	const path = process.env[options.envVar] ?? options.fallbackPath;
	if (!path) {
		throw new Error(
			`loadRulesFromEnv: environment variable "${options.envVar}" is not ` +
				'set and no fallbackPath was provided.',
		);
	}
	return loadRulesFromFile(path);
}
