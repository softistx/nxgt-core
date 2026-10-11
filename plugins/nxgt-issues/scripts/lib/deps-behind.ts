/**
 * `issues.ts deps <pkg>`: the rows of the rolling dependencies table, computed
 * from the registry — each dependency the package's `latest` manifest declares
 * whose own latest release falls outside the declared range. Ranges this
 * cannot read (`*`, tags, `workspace:`, unions) are skipped, never guessed.
 */

import type { DependencyRow } from './issue-body';
import type { Runner } from './runner';

const REGISTRY = 'https://registry.npmjs.org';
export const DEPS_FETCH_TIMEOUT_MS = 2000;

type Version = readonly [number, number, number];

const parse = (text: string): Version | undefined => {
	const match = /^(\d+)\.(\d+)\.(\d+)/.exec(text.trim());
	return match
		? [Number(match[1]), Number(match[2]), Number(match[3])]
		: undefined;
};

const compare = (a: Version, b: Version): number =>
	a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/** Whether `latest` lies above what `range` accepts (`^`, `~`, exact, `>=`). */
export function isBehind(range: string, latest: string): boolean | undefined {
	const match = /^(\^|~|>=|=)?\s*v?(\d+\.\d+\.\d+)\S*$/.exec(range.trim());
	const target = parse(latest);
	const base = match?.[2] ? parse(match[2]) : undefined;
	if (!match || !base || !target) return undefined;
	const op = match[1] ?? '=';
	if (op === '>=') return false;
	if (op === '=') return compare(target, base) > 0;
	if (op === '~') return target[0] > base[0] || target[1] > base[1];
	if (base[0] > 0) return target[0] > base[0];
	if (base[1] > 0) return target[0] > 0 || target[1] > base[1];
	return compare(target, base) > 0;
}

const latestOf = async (
	runner: Runner,
	name: string,
): Promise<Record<string, unknown>> => {
	const url = `${REGISTRY}/${name.replace('/', '%2F')}/latest`;
	const json = await runner.fetchJson(url, DEPS_FETCH_TIMEOUT_MS);
	return json && typeof json === 'object'
		? (json as Record<string, unknown>)
		: {};
};

/** The dependencies of `pkg@latest` that are behind; throws when `pkg` cannot be read. */
export async function behindDependencies(
	runner: Runner,
	pkg: string,
): Promise<DependencyRow[]> {
	const manifest = await latestOf(runner, pkg);
	const deps = manifest['dependencies'];
	const rows: DependencyRow[] = [];
	if (!deps || typeof deps !== 'object') return rows;
	for (const [name, range] of Object.entries(deps)) {
		if (typeof range !== 'string') continue;
		let latest: unknown;
		try {
			latest = (await latestOf(runner, name))['version'];
		} catch {
			continue;
		}
		if (typeof latest === 'string' && isBehind(range, latest)) {
			rows.push({ name, current: range, latest });
		}
	}
	return rows.sort((a, b) => a.name.localeCompare(b.name));
}
