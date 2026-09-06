#!/usr/bin/env bun

/**
 * Packs every package, installs the tarballs the way a consumer does, and
 * imports every subpath each one declares.
 *
 * This exists because `bun run build` exiting 0 proves almost nothing here.
 * Inside this workspace `@nxgt/*` resolves to `src/`, so nothing ever loads
 * `dist/`, and three separate defects shipped past a green build:
 *
 *   - `@nxgt/shared-mongo` threw `mongoose2 is not defined` at import
 *   - `@nxgt/shared-hono/mcp` threw `hono is not defined` at import
 *   - `@nxgt/shared-openapi` threw on `ts.factory` under the wrong TypeScript
 *
 * All three were invisible to `bun run build`, `bun typecheck` and `biome`.
 * Only importing the built artifact catches that class of failure.
 *
 * The install uses `overrides` so the packages resolve to each other's
 * tarballs rather than to whatever is on the registry — otherwise this would
 * silently verify the *published* versions instead of the working tree.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

type Pkg = { name: string; dir: string; subpaths: string[] };

/** Every subpath a package publishes, from its own `exports` map. */
function subpathsOf(name: string, exports: Record<string, unknown>): string[] {
	return Object.keys(exports)
		.filter((key) => key.startsWith('.') && !key.endsWith('package.json'))
		.map((key) => (key === '.' ? name : `${name}/${key.slice(2)}`));
}

async function readPackages(): Promise<Pkg[]> {
	const dirs = [...new Bun.Glob('packages/*/package.json').scanSync(ROOT)];
	const pkgs: Pkg[] = [];
	for (const rel of dirs.sort()) {
		const manifest = await Bun.file(join(ROOT, rel)).json();
		pkgs.push({
			name: manifest.name,
			dir: join(ROOT, rel.replace(/\/package\.json$/, '')),
			subpaths: subpathsOf(manifest.name, manifest.exports ?? {}),
		});
	}
	return pkgs;
}

/**
 * A published manifest must never name a `link:`, in any dependency field.
 * One shipped inside a tarball once and broke every consumer's install with a
 * 404 on a package that is on no registry.
 */
async function assertNoLinkDependencies(tarballs: string[]): Promise<string[]> {
	const problems: string[] = [];
	for (const tgz of tarballs) {
		const raw = await $`tar -xzOf ${tgz} package/package.json`.quiet().text();
		const manifest = JSON.parse(raw);
		for (const field of [
			'dependencies',
			'devDependencies',
			'peerDependencies',
			'optionalDependencies',
		]) {
			for (const [dep, range] of Object.entries<string>(
				manifest[field] ?? {},
			)) {
				if (String(range).includes('link:')) {
					problems.push(`${manifest.name}: ${field}.${dep} = ${range}`);
				}
			}
		}
	}
	return problems;
}

const packages = await readPackages();
const workdir = await mkdtemp(join(tmpdir(), 'nxgt-core-verify-'));

try {
	console.log(`Packing ${packages.length} packages…`);
	const tarballs: string[] = [];
	const overrides: Record<string, string> = {};
	for (const pkg of packages) {
		await $`bun pm pack --destination ${workdir}`.cwd(pkg.dir).quiet();
		const file = [...new Bun.Glob('*.tgz').scanSync(workdir)]
			.map((f) => join(workdir, f))
			.find((f) => !tarballs.includes(f));
		if (!file) throw new Error(`${pkg.name}: bun pm pack produced no tarball`);
		tarballs.push(file);
		overrides[pkg.name] = `file:${file}`;
	}

	const linked = await assertNoLinkDependencies(tarballs);
	if (linked.length > 0) {
		console.error('\nA published manifest names a `link:` dependency:\n');
		for (const problem of linked) console.error(`  ${problem}`);
		console.error(
			'\nNo consumer can resolve that. Move it to the root package.json,\n' +
				'or drop the declaration entirely. See AGENTS.md.',
		);
		process.exit(1);
	}

	// `@nxgt/shared-hono` and `@nxgt/shared-graphql` import `stx-sdk`, which is
	// published to no registry and is deliberately named in no manifest here
	// (Bun installs a peer even when it is declared optional, which broke every
	// consumer's install with a 404). Every real consumer supplies it through
	// its own `link:stx-sdk`, so the probe supplies it too — otherwise it would
	// report a failure that no consumer will ever see.
	const stxSdk = join(ROOT, '..', 'stx-sdk');
	const hasStxSdk = await Bun.file(join(stxSdk, 'package.json')).exists();
	if (!hasStxSdk) {
		console.warn(
			`warning: ${stxSdk} not found — the subpaths that import stx-sdk will be\n` +
				'         skipped. Every consumer supplies it through its own\n' +
				'         link:stx-sdk, so this is an absence here, not a defect.\n',
		);
	}

	await Bun.write(
		join(workdir, 'package.json'),
		`${JSON.stringify(
			{
				name: 'nxgt-core-artifact-probe',
				private: true,
				version: '0.0.0',
				type: 'module',
				dependencies: hasStxSdk
					? { ...overrides, 'stx-sdk': `file:${stxSdk}` }
					: overrides,
				overrides,
				resolutions: overrides,
			},
			null,
			2,
		)}\n`,
	);

	console.log('Installing them as a consumer would…');
	const install = await $`bun install`.cwd(workdir).quiet().nothrow();
	if (install.exitCode !== 0) {
		console.error(`\n${install.stderr.toString().trim()}`);
		console.error(
			'\nThe install failed. A dependency that exists on no registry is the\n' +
				'usual cause — note that `peerDependenciesMeta.optional` does NOT\n' +
				'stop Bun fetching a peer.',
		);
		process.exit(1);
	}

	const subpaths = packages.flatMap((p) => p.subpaths);
	console.log(`Importing ${subpaths.length} declared subpaths…\n`);
	// Without a local stx-sdk checkout — a GitHub-hosted runner, for one — the
	// four subpaths that import it cannot load, for a reason no consumer can
	// hit. Those are reported as skipped, not failed. Every other failure still
	// fails, including a different error from those same subpaths.
	const probe = subpaths
		.map(
			(s) =>
				`try { const m = await import(${JSON.stringify(s)});` +
				` console.log("  ok      ${s.padEnd(40)}" + Object.keys(m).length + " exports"); }` +
				' catch (e) {' +
				`  if (${!hasStxSdk} && /Cannot find package 'stx-sdk'/.test(e.message))` +
				`   { skipped++; console.log("  skip    ${s.padEnd(40)}needs a local stx-sdk checkout"); }` +
				`  else { failed++; console.log("  FAIL    ${s.padEnd(40)}" + e.message.split("\\n")[0]); } }`,
		)
		.join('\n');
	await Bun.write(
		join(workdir, 'probe.mjs'),
		`let failed = 0;\nlet skipped = 0;\n${probe}\n` +
			'if (skipped > 0) console.log(`\\n${skipped} subpath(s) skipped.`);\n' +
			'process.exit(failed);\n',
	);

	const result = await $`bun run probe.mjs`.cwd(workdir).nothrow();
	if (result.exitCode !== 0) {
		console.error(
			`\n${result.exitCode} subpath(s) failed to load from the built artifact.\n` +
				'A build exiting 0 is not evidence the artifact loads. See AGENTS.md.',
		);
		process.exit(1);
	}
	console.log(
		hasStxSdk
			? `\nAll ${subpaths.length} subpaths load.`
			: `\nEvery subpath that could be checked here loads (${subpaths.length} declared,\n` +
					'those needing stx-sdk skipped).',
	);
} finally {
	await rm(workdir, { recursive: true, force: true });
}
