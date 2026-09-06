#!/usr/bin/env bun
/**
 * Publishes every package whose current version is not on the registry yet,
 * in dependency order, with `bun publish`.
 *
 * This exists instead of `changeset publish` because Changesets shells out to
 * `npm publish`, and Bun is the package manager for this repository: the
 * lockfile is `bun.lock`, `bun pm pack` is what rewrites `workspace:*` into a
 * real version, and `verify:artifacts` reproduces a Bun install specifically.
 * Publishing with a different package manager than the one everything else is
 * verified against is how you ship an artifact nobody tested.
 *
 * `changeset version` still does the versioning and the changelogs — it is
 * pure bookkeeping and touches no registry. Only the publish step is ours.
 *
 * Output format: every published package prints `New tag: <name>@<version>`,
 * which is the line `changesets/action` parses to create GitHub releases.
 * Do not change it without checking that — and note that the action then runs
 * `git push origin <that tag>`, so the tag has to *exist*. `changeset publish`
 * creates it; announcing one without creating it fails the release after every
 * package is already on the registry, which is the worst place to fail.
 *
 * Credentials come from `bunfig.toml`, which reads `$NPM_TOKEN` from the
 * environment. Nothing is written to `~/.npmrc`.
 */

import { join } from 'node:path';
import { $ } from 'bun';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const REGISTRY = 'https://registry.npmjs.org';

type Pkg = { name: string; version: string; dir: string; deps: Set<string> };

async function readPackages(): Promise<Pkg[]> {
	const pkgs: Pkg[] = [];
	for (const rel of [
		...new Bun.Glob('packages/*/package.json').scanSync(ROOT),
	].sort()) {
		const m = await Bun.file(join(ROOT, rel)).json();
		if (m.private) continue;
		const deps = new Set<string>();
		for (const field of ['dependencies', 'peerDependencies']) {
			for (const dep of Object.keys(m[field] ?? {})) {
				if (dep.startsWith('@nxgt/')) deps.add(dep);
			}
		}
		pkgs.push({
			name: m.name,
			version: m.version,
			dir: join(ROOT, rel.replace(/\/package\.json$/, '')),
			deps,
		});
	}
	return pkgs;
}

/** Dependencies first, so a consumer is never on the registry before its dependency. */
function inDependencyOrder(pkgs: Pkg[]): Pkg[] {
	const byName = new Map(pkgs.map((p) => [p.name, p]));
	const done = new Set<string>();
	const order: Pkg[] = [];
	while (order.length < pkgs.length) {
		const ready = pkgs.filter(
			(p) =>
				!done.has(p.name) &&
				[...p.deps].every((d) => !byName.has(d) || done.has(d)),
		);
		if (ready.length === 0) {
			const stuck = pkgs.filter((p) => !done.has(p.name)).map((p) => p.name);
			throw new Error(`dependency cycle between: ${stuck.join(', ')}`);
		}
		for (const p of ready) {
			order.push(p);
			done.add(p.name);
		}
	}
	return order;
}

/** Already on the registry at this exact version? Then there is nothing to do. */
async function isPublished(name: string, version: string): Promise<boolean> {
	const res = await fetch(
		`${REGISTRY}/${name.replace('/', '%2F')}/${version}`,
	).catch(() => null);
	return res?.ok === true;
}

const packages = inDependencyOrder(await readPackages());
let published = 0;
let failed = 0;

for (const pkg of packages) {
	if (await isPublished(pkg.name, pkg.version)) {
		console.log(`  skip      ${pkg.name}@${pkg.version} (already published)`);
		continue;
	}

	const result = await $`bun publish`.cwd(pkg.dir).quiet().nothrow();
	const output = `${result.stdout.toString()}${result.stderr.toString()}`;

	if (result.exitCode === 0) {
		published++;
		console.log(`  published ${pkg.name}@${pkg.version}`);

		// `changesets/action` pushes this tag straight after, so create it here
		// the way `changeset publish` would. `--force` because a re-run after a
		// partial failure must not stop on a tag it already made.
		const tag = `${pkg.name}@${pkg.version}`;
		const tagged = await $`git tag --force ${tag}`.cwd(ROOT).quiet().nothrow();
		if (tagged.exitCode !== 0) {
			console.error(`  warning   could not tag ${tag}`);
			console.error(`            ${tagged.stderr.toString().trim()}`);
		}

		// The line changesets/action looks for when creating GitHub releases.
		console.log(`New tag: ${tag}`);
	} else {
		failed++;
		console.error(`  FAILED    ${pkg.name}@${pkg.version}`);
		console.error(
			output
				.trim()
				.split('\n')
				.map((l) => `            ${l}`)
				.join('\n'),
		);
	}
}

console.log(
	`\n${published} published, ${failed} failed, ` +
		`${packages.length - published - failed} already up to date.`,
);

if (failed > 0) {
	console.error(
		'\nA publish failed. If it says two-factor authentication is required, the\n' +
			'token in $NPM_TOKEN is not a granular access token — npm no longer\n' +
			'accepts classic tokens for publishing. See AGENTS.md.',
	);
	process.exit(1);
}
