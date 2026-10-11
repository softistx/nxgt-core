/**
 * Runs `vue-tsc` with the arguments given, where it can run.
 *
 * `vue-tsc` 3 drives TypeScript's compiler API, which TypeScript 7's npm
 * package does not ship: where `typescript` resolves to 7 it dies on
 * `Package subpath './lib/tsc' is not defined by "exports"` before checking
 * anything (measured on vue-tsc 3.3.13 and TypeScript 7.0.2). That is CI's
 * "Newest peers" job since this package accepts TypeScript 7. There, this
 * runs `tsc` with the same arguments instead, which still checks every `.ts`
 * file — `test/types/refusals.ts`'s refusals included — and says that the
 * `.vue` files went unchecked. CI's main job runs TypeScript 6, where
 * `vue-tsc` checks them.
 *
 *   bun run test/vue-tsc.ts --noEmit -p test/types/tsconfig.json
 */
import { dirname } from 'node:path';

const args = process.argv.slice(2);

/** The `typescript` vue-tsc itself loads, resolved from its own folder. */
const vueTsc = dirname(Bun.resolveSync('vue-tsc/package.json', process.cwd()));
const typescript = await import(Bun.resolveSync('typescript', vueTsc));
const api = (typescript.default ?? typescript) as {
	version?: string;
	factory?: unknown;
};

let command = 'vue-tsc';
if (api.factory === undefined) {
	command = 'tsc';
	console.warn(
		`vue-tsc needs TypeScript's compiler API, which TypeScript ${api.version} ` +
			'does not ship: running tsc instead, so the .vue files go unchecked here. ' +
			'They are checked where typescript resolves to 6.',
	);
}

const run = Bun.spawn([command, ...args], {
	stdio: ['inherit', 'inherit', 'inherit'],
});
process.exit(await run.exited);
