/**
 * The build for every package in this workspace.
 *
 * Each package runs `bun run ../../build.ts` from its own directory. There is
 * one script rather than one per package because the eleven differ only in
 * their entry points, which they declare themselves under `nxgt.entrypoints`.
 *
 * Two outputs, from two tools:
 *
 *   - JavaScript, from `Bun.build` with `packages: 'external'`. A library must
 *     not bundle its dependencies: mongoose in particular is a singleton whose
 *     model registry breaks the moment two copies exist in one process, and
 *     `@nxgt/shared-mongo` re-exports it (see AGENTS.md).
 *   - Declarations, from `tsc --emitDeclarationOnly` against
 *     `tsconfig.build.json`, which excludes the `*.spec.ts` files that
 *     `tsconfig.json` still typechecks.
 *
 * Hand-written `.d.ts` files are copied, not emitted: tsc passes them through
 * untouched, so an ambient module augmentation like `shared-mongo`'s
 * `types/pagination.d.ts` would otherwise never reach `dist/` and the
 * `Model.paginate` it declares would vanish for every consumer.
 *
 * Every relative import in a declaration then gets its extension —
 * `'./engine'` becomes `'./engine.js'`, `'./auth'` becomes
 * `'./auth/index.js'`. The sources import without one, which `bundler`
 * resolution allows; a consumer on `moduleResolution: nodenext` refuses
 * every such import with TS2834, and sees none of the package's types.
 * `.js` is right even where the JavaScript was bundled away: under nodenext,
 * TypeScript looks for `engine.d.ts` beside the `engine.js` it is told of.
 */

import { readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { $ } from 'bun';
import ts from 'typescript';

const pkg = await Bun.file('package.json').json();
const name: string = pkg.name;
const entrypoints: string[] = pkg.nxgt?.entrypoints ?? ['src/index.ts'];

await $`rm -rf dist`.quiet();

const result = await Bun.build({
	entrypoints,
	outdir: 'dist',
	root: 'src',
	target: 'node',
	format: 'esm',
	packages: 'external',
	// Shared modules become ONE chunk every entry point imports, instead of being
	// inlined into each. Without it a package with several entry points hands an
	// app two copies of its own classes, and an `instanceof` across the two is
	// false — the same argument `packages: 'external'` makes just above for a
	// DEPENDENCY's classes, applied to our own. No package here duplicates one
	// today; this is what keeps that true as entry points are added. It cost
	// nxgt-ory nine routes answering 500 instead of 503, including three admin
	// screens written specifically to answer 503, through a green build.
	splitting: true,
	sourcemap: 'linked',
	naming: { entry: '[dir]/[name].[ext]', chunk: 'chunks/[name]-[hash].[ext]' },
});

if (!result.success) {
	console.error(`${name}: build failed`);
	for (const log of result.logs) console.error(log);
	process.exit(1);
}

await $`tsc -p tsconfig.build.json --emitDeclarationOnly`;

// Copy hand-written declarations, preserving their path under src/.
async function* walk(dir: string): AsyncGenerator<string> {
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) yield* walk(full);
		else yield full;
	}
}

let copied = 0;
for await (const file of walk('src')) {
	if (!file.endsWith('.d.ts')) continue;
	const target = join('dist', relative('src', file));
	// tsc got here first, which means a `.ts` next door has the same basename
	// and this copy would replace that module's real declarations with an
	// ambient file. Refuse rather than silently truncate the public API.
	if (await Bun.file(target).exists()) {
		console.error(
			`${name}: ${file} collides with the declarations tsc emitted for ` +
				`${target}. Rename it, or move it under src/types/.`,
		);
		process.exit(1);
	}
	await $`mkdir -p ${dirname(target)}`.quiet();
	await Bun.write(target, Bun.file(file));
	copied++;
}

// Extensions on every relative import of every declaration. Read with
// TypeScript's own scanner, which skips comments: a JSDoc example stays as
// written. A specifier that names no declaration fails the build, since it
// would fail every consumer.
let rewritten = 0;
for await (const file of walk('dist')) {
	if (!file.endsWith('.d.ts')) continue;
	const text = await Bun.file(file).text();
	const imports = ts
		.preProcessFile(text, true, true)
		.importedFiles.filter(
			({ fileName }) => fileName.startsWith('./') || fileName.startsWith('../'),
		)
		// An extension already written — `.js`, or a hand-written `.d.ts`
		// importing another — is left as it is.
		.filter(
			({ fileName }) => !/\.(?:d\.[cm]?ts|[cm]?[jt]s|json)$/.test(fileName),
		);
	if (imports.length === 0) continue;

	let next = text;
	// From the end, so each position is still where the scanner found it.
	for (const { fileName, pos } of [...imports].sort((a, b) => b.pos - a.pos)) {
		// `pos` is the opening quote in TypeScript 6, not the name: find the
		// name where it says, rather than trusting an offset.
		const at = text.indexOf(fileName, pos);
		if (at < 0 || at > pos + 1) {
			console.error(
				`${name}: cannot place ${fileName} in ${relative('.', file)}`,
			);
			process.exit(1);
		}
		const base = resolve(dirname(file), fileName);
		const target = (await Bun.file(`${base}.d.ts`).exists())
			? `${fileName}.js`
			: (await Bun.file(join(base, 'index.d.ts')).exists())
				? `${fileName.replace(/\/$/, '')}/index.js`
				: null;
		if (target === null) {
			console.error(
				`${name}: ${relative('.', file)} imports ${fileName}, which names no declaration in dist/`,
			);
			process.exit(1);
		}
		next = next.slice(0, at) + target + next.slice(at + fileName.length);
	}
	await Bun.write(file, next);
	rewritten++;
}

// A bin runs as a file: it keeps the `#!` line Bun.build carries over from
// its entry, and it must be executable, or `node_modules/.bin/<cmd>` fails.
const bins: Record<string, string> =
	typeof pkg.bin === 'string' ? { [name]: pkg.bin } : (pkg.bin ?? {});
for (const [command, target] of Object.entries(bins)) {
	const file = Bun.file(target);
	if (!(await file.exists()) || !(await file.text()).startsWith('#!')) {
		console.error(
			`${name}: bin ${command} points at ${target}, which is missing or has ` +
				'no #! line. Build it from an entry point that starts with one.',
		);
		process.exit(1);
	}
	await $`chmod 755 ${target}`.quiet();
}

console.log(
	`${name}: ${result.outputs.length} artifact(s)` +
		(copied ? `, ${copied} hand-written declaration(s) copied` : '') +
		(rewritten ? `, ${rewritten} declaration(s) given extensions` : ''),
);
