import { join } from 'node:path';

/** The repository root, whatever the working directory. */
export const ROOT = new URL('../..', import.meta.url).pathname.replace(
	/\/$/,
	'',
);

export type Pkg = {
	name: string;
	dir: string;
	subpaths: string[];
	browserSubpaths: string[];
	bins: string[];
};

/** Every subpath a package publishes, from its own `exports` map. */
export function subpathsOf(
	name: string,
	exports: Record<string, unknown>,
): string[] {
	return Object.keys(exports)
		.filter((key) => key.startsWith('.') && !key.endsWith('package.json'))
		.map((key) => (key === '.' ? name : `${name}/${key.slice(2)}`));
}

/**
 * The subset of a package's subpaths whose `exports` condition map declares a
 * `browser` entry — today only `@nxgt/i18n`. A bundler (Vite, Nuxt's client
 * build) resolves that entry instead of `import`/`default`, so it is the one
 * that must never reach a Node built-in or `hono/context-storage`: both drag
 * `node:async_hooks` into a client bundle that never runs inside a Hono
 * request.
 */
export function browserSubpathsOf(
	name: string,
	exports: Record<string, unknown>,
): string[] {
	return Object.entries(exports)
		.filter(
			([key, value]) =>
				key.startsWith('.') &&
				!key.endsWith('package.json') &&
				typeof value === 'object' &&
				value !== null &&
				'browser' in value,
		)
		.map(([key]) => (key === '.' ? name : `${name}/${key.slice(2)}`));
}

/** Every package under `packages/`, in a stable order. */
export async function readPackages(): Promise<Pkg[]> {
	const dirs = [...new Bun.Glob('packages/*/package.json').scanSync(ROOT)];
	const pkgs: Pkg[] = [];
	for (const rel of dirs.sort()) {
		const manifest = await Bun.file(join(ROOT, rel)).json();
		pkgs.push({
			name: manifest.name,
			dir: join(ROOT, rel.replace(/\/package\.json$/, '')),
			subpaths: subpathsOf(manifest.name, manifest.exports ?? {}),
			browserSubpaths: browserSubpathsOf(manifest.name, manifest.exports ?? {}),
			bins:
				typeof manifest.bin === 'string'
					? [manifest.name.split('/').pop()]
					: Object.keys(manifest.bin ?? {}),
		});
	}
	return pkgs;
}
