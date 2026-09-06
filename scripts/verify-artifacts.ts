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
 * Everything else, `stx-sdk` included, resolves from the registry the way a
 * consumer's install does.
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
 * What a published manifest may not contain, measured on Bun 1.4.0 rather than
 * assumed:
 *
 *   - a `link:` or `file:` in a field a consumer installs. `devDependencies`
 *     are exempt: a consumer never installs a dependency's dev dependencies,
 *     so a `link:` there is untidy, not harmful.
 *   - a **required** peer that is on no registry. This is the shape that once
 *     broke every consumer's install with a 404 on `stx-sdk`. An *optional*
 *     peer is safe whatever its range; a required one is not.
 *   - an **exact pin on a sibling package**. `workspace:*` publishes as the
 *     exact version, so `@nxgt/shared-hono@1.0.2` demanded
 *     `@nxgt/shared-mongo@1.0.0` while the consumer's own `^1.0.0` resolved to
 *     1.1.0 — two copies in one tree, each registering the `Audit` Mongoose
 *     model, and `OverwriteModelError` on the second. `workspace:^` publishes
 *     as a caret range, which dedupes.
 */
async function manifestProblems(tarballs: string[]): Promise<string[]> {
	const problems: string[] = [];
	const own = new Set<string>();
	const manifests: Record<string, unknown>[] = [];

	for (const tgz of tarballs) {
		const raw = await $`tar -xzOf ${tgz} package/package.json`.quiet().text();
		const manifest = JSON.parse(raw);
		manifests.push(manifest);
		own.add(manifest.name);
	}

	for (const manifest of manifests) {
		const name = manifest.name as string;

		for (const field of [
			'dependencies',
			'peerDependencies',
			'optionalDependencies',
		]) {
			for (const [dep, range] of Object.entries<string>(
				(manifest[field] as Record<string, string>) ?? {},
			)) {
				if (/^(link|file):/.test(String(range))) {
					problems.push(`${name}: ${field}.${dep} = ${range}`);
				}
				if (own.has(dep) && /^\d/.test(String(range))) {
					problems.push(
						`${name}: ${field}.${dep} = ${range} pins a sibling exactly; ` +
							'use `workspace:^` so the consumer gets one copy',
					);
				}
			}
		}

		const meta =
			(manifest.peerDependenciesMeta as Record<
				string,
				{ optional?: boolean }
			>) ?? {};
		for (const peer of Object.keys(
			(manifest.peerDependencies as Record<string, string>) ?? {},
		)) {
			if (meta[peer]?.optional || own.has(peer)) continue;
			const res = await fetch(
				`https://registry.npmjs.org/${peer.replace('/', '%2F')}`,
				{ method: 'HEAD' },
			).catch(() => null);
			if (!res?.ok) {
				problems.push(
					`${name}: peerDependencies.${peer} is required but is on no registry`,
				);
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

	const problems = await manifestProblems(tarballs);
	if (problems.length > 0) {
		console.error('\nA published manifest would break a consumer:\n');
		for (const problem of problems) console.error(`  ${problem}`);
		console.error(
			'\nA `link:` or `file:` no consumer can resolve, a required peer that is\n' +
				'on no registry, or an exact pin on a sibling. See AGENTS.md.',
		);
		process.exit(1);
	}

	// `stx-sdk` is a required peer of two packages and resolves from the public
	// registry like anything else — no checkout next door, no special case.
	await Bun.write(
		join(workdir, 'package.json'),
		`${JSON.stringify(
			{
				name: 'nxgt-core-artifact-probe',
				private: true,
				version: '0.0.0',
				type: 'module',
				dependencies: overrides,
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
			'\nThe install failed. A required peer on a package that is on no\n' +
				'registry is the usual cause — an optional one never fails an install.',
		);
		process.exit(1);
	}

	const subpaths = packages.flatMap((p) => p.subpaths);
	console.log(`Importing ${subpaths.length} declared subpaths…\n`);
	const probe = subpaths
		.map(
			(s) =>
				`try { const m = await import(${JSON.stringify(s)});` +
				` console.log("  ok      ${s.padEnd(40)}" + Object.keys(m).length + " exports"); }` +
				` catch (e) { failed++; console.log("  FAIL    ${s.padEnd(40)}" + e.message.split("\\n")[0]); }`,
		)
		.join('\n');
	await Bun.write(
		join(workdir, 'probe.mjs'),
		`let failed = 0;\n${probe}\nprocess.exit(failed);\n`,
	);

	const result = await $`bun run probe.mjs`.cwd(workdir).nothrow();
	if (result.exitCode !== 0) {
		console.error(
			`\n${result.exitCode} subpath(s) failed to load from the built artifact.\n` +
				'A build exiting 0 is not evidence the artifact loads. See AGENTS.md.',
		);
		process.exit(1);
	}
	console.log(`\nAll ${subpaths.length} subpaths load.`);
} finally {
	await rm(workdir, { recursive: true, force: true });
}
