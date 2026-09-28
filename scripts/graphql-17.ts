#!/usr/bin/env bun
/**
 * Runs `@nxgt/shared-graphql`'s typecheck and suite on graphql 17.
 *
 * The package peers `graphql` by `^16.4.2 || ^17.0.0`, and `bun.lock` holds a
 * 16 — so without this, the second half of the range is admitted and tested
 * by nobody. It was not free: on graphql 17 `getDirective` stopped applying an
 * input field's default, and every `@check` without an explicit `id` refused
 * the schema at build.
 *
 * It rewrites the package's `graphql` devDependency, installs, runs, and puts
 * `package.json` and `bun.lock` back — whatever happened — then reinstalls so
 * `node_modules` matches the lock again. CI runs it after everything else.
 *
 *     bun run scripts/graphql-17.ts
 */

import { $ } from 'bun';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const PACKAGE = `${ROOT}/packages/shared-graphql`;

/** The range the second half of the peer is tested at. */
export const GRAPHQL_17 = '^17.0.2';

type Manifest = { devDependencies?: Record<string, string> };

/** The manifest with its `graphql` devDependency moved to `range`. */
export function withGraphql<M extends Manifest>(manifest: M, range: string): M {
	if (!manifest.devDependencies?.graphql) {
		throw new Error(
			'@nxgt/shared-graphql has no graphql devDependency to move — the peer is no longer tested in the workspace',
		);
	}
	return {
		...manifest,
		devDependencies: { ...manifest.devDependencies, graphql: range },
	};
}

async function main() {
	const manifestFile = Bun.file(`${PACKAGE}/package.json`);
	const lockFile = Bun.file(`${ROOT}/bun.lock`);
	const [manifest, lock] = [await manifestFile.text(), await lockFile.text()];

	try {
		const moved = withGraphql(JSON.parse(manifest), GRAPHQL_17);
		await Bun.write(manifestFile, `${JSON.stringify(moved, null, '\t')}\n`);
		await $`bun install`.cwd(ROOT);
		// A lock that did not move would test 16 twice and report 17 green.
		const version = (
			await $`bun -e "console.log((await import('graphql')).version)"`
				.cwd(PACKAGE)
				.text()
		).trim();
		if (!version.startsWith('17.')) {
			throw new Error(
				`expected graphql 17 in the package, resolved ${version}`,
			);
		}
		console.log(`@nxgt/shared-graphql on graphql ${version}`);
		await $`bun run typecheck`.cwd(PACKAGE);
		await $`bun test src`.cwd(PACKAGE);
	} finally {
		await Bun.write(manifestFile, manifest);
		await Bun.write(lockFile, lock);
		await $`bun install`.cwd(ROOT).quiet();
	}
}

if (import.meta.main) await main();
