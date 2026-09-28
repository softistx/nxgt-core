import { join } from 'node:path';
import { $ } from 'bun';
import type { Pkg } from './packages';

/**
 * The script run inside the install: bundles each entry the way a bundler
 * would and records every `node:*` or `hono/context-storage` it resolves.
 */
function browserProbe(entries: { subpath: string; file: string }[]): string {
	return `const entries = ${JSON.stringify(entries)};
let failed = 0;
for (const { subpath, file } of entries) {
	const hits = new Set();
	const guard = {
		name: 'browser-condition-guard',
		setup(build) {
			build.onResolve({ filter: /^node:/ }, (args) => {
				hits.add(args.path);
				return { path: args.path, namespace: 'guard-stub' };
			});
			build.onResolve({ filter: /^hono\\/context-storage$/ }, (args) => {
				hits.add(args.path);
				return { path: args.path, namespace: 'guard-stub' };
			});
			build.onLoad({ filter: /.*/, namespace: 'guard-stub' }, () => ({
				contents: 'export default {};',
				loader: 'js',
			}));
		},
	};
	let buildError = null;
	try {
		const result = await Bun.build({
			entrypoints: [file],
			conditions: ['browser', 'import'],
			target: 'browser',
			packages: 'bundle',
			plugins: [guard],
			write: false,
		});
		if (!result.success) {
			buildError = result.logs.map(String).join('; ');
		}
	} catch (e) {
		// A resolve hit is recorded before the stubbed module can fail to
		// build against it, so this still reports the hit below — but a
		// throw for any OTHER reason must fail too, or a broken browser
		// subpath silently reports "ok".
		buildError = e && e.message ? e.message : String(e);
	}
	if (hits.size > 0) {
		failed++;
		console.log("  FAIL    " + subpath.padEnd(40) + "reaches " + [...hits].join(', '));
	} else if (buildError) {
		failed++;
		console.log("  FAIL    " + subpath.padEnd(40) + buildError.split("\\n")[0]);
	} else {
		console.log("  ok      " + subpath.padEnd(40));
	}
}
process.exit(failed);
`;
}

/**
 * The `browser` condition never reaches Node; false if a browser subpath does.
 *
 * A subpath's `exports` map can declare a `browser` entry meant for a
 * bundler's client build (Vite, Nuxt) — today only `@nxgt/i18n`. Importing
 * it proved it loads under Bun's own resolution, which is `import`, never
 * `browser`. That leaves the one entry a consumer's bundler actually picks
 * unverified, and the failure mode is exactly the shape this package was
 * split in two to avoid: `hono/context-storage` pulls in `node:async_hooks`,
 * absent in a browser and dead weight in a client bundle that never runs
 * inside a Hono request.
 *
 * So each `browser` subpath is bundled the way a bundler would — resolved
 * with the `browser` and `import` conditions, target `browser` — through a
 * plugin that intercepts every `node:*` specifier and `hono/context-storage`
 * before Bun's own browser target can quietly shim it into an empty object.
 * Grepping the bundled output for `node:` would not catch this: under
 * `target: 'browser'` Bun replaces a Node built-in with a no-op rather than
 * leaving the import in place, so the text disappears from the artifact
 * while the mistake it hid does not.
 */
export async function browserSubpathsStayClear(
	workdir: string,
	packages: readonly Pkg[],
): Promise<boolean> {
	const browserSubpaths = packages.flatMap((p) => p.browserSubpaths);
	if (browserSubpaths.length === 0) return true;
	console.log(
		`\nChecking ${browserSubpaths.length} browser-conditioned subpath(s) ` +
			'never reach a Node built-in or hono/context-storage…\n',
	);
	const entries = browserSubpaths.map((subpath, i) => ({
		subpath,
		file: `browser-entry-${i}.mjs`,
	}));
	for (const { subpath, file } of entries) {
		await Bun.write(
			join(workdir, file),
			`export * from ${JSON.stringify(subpath)};\n`,
		);
	}
	await Bun.write(join(workdir, 'browser-probe.mjs'), browserProbe(entries));
	const result = await $`bun run browser-probe.mjs`.cwd(workdir).nothrow();
	if (result.exitCode !== 0) {
		console.error(
			`\n${result.exitCode} browser subpath(s) reach a Node ` +
				'built-in or hono/context-storage through the browser export\n' +
				'condition. A bundler resolving `browser` would ship that into a ' +
				'client bundle. See AGENTS.md.',
		);
		return false;
	}
	console.log(
		`\nAll ${browserSubpaths.length} browser subpath(s) stay clear of ` +
			'Node built-ins and hono/context-storage.',
	);
	return true;
}
