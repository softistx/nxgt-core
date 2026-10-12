/**
 * Builds a Nuxt fixture with `nuxt build`, as a consumer does — it installs
 * `@nxgt/i18n-vue/nuxt` from `dist/`, so `bun run build` first — and starts
 * the server it outputs on a free port. Shared by the specs of the module.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

const nuxt = join(import.meta.dir, '../node_modules/nuxt/bin/nuxt.mjs');

export interface BuiltNuxtApp {
	/** `http://127.0.0.1:<port>`, answering. */
	readonly origin: string;
	/** What `nuxt build` printed. */
	readonly buildLog: string;
	/**
	 * Where `nuxt build` wrote `.nuxt/`: `node_modules/.cache/nuxt/.nuxt` when
	 * a `.nuxt/` was already there — `nuxt prepare`'s, from the typecheck —
	 * and `.nuxt/` otherwise, as `@nuxt/kit` decides.
	 */
	readonly buildDir: string;
	/** Stops the server. */
	readonly stop: () => void;
}

export async function buildAndServe(app: string): Promise<BuiltNuxtApp> {
	await Bun.$`bun run ${join(app, 'link.ts')}`.quiet();
	// Decided before the build, as @nuxt/kit decides it.
	const cached = join(app, 'node_modules/.cache/nuxt/.nuxt');
	const buildDir = existsSync(join(app, '.nuxt')) ? cached : join(app, '.nuxt');
	const build = await Bun.$`node ${nuxt} build`.cwd(app).quiet().nothrow();
	const buildLog = `${build.stdout}${build.stderr}`;
	if (build.exitCode !== 0) throw new Error(`nuxt build failed:\n${buildLog}`);
	const port = 30_000 + Math.floor(Math.random() * 20_000);
	const origin = `http://127.0.0.1:${port}`;
	const server = Bun.spawn(['node', join(app, '.output/server/index.mjs')], {
		env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' },
		stdout: 'ignore',
		stderr: 'ignore',
	});
	const stop = () => server.kill();
	for (let attempt = 0; attempt < 100; attempt++) {
		if (
			await fetch(origin).then(
				() => true,
				() => false,
			)
		)
			return { origin, buildLog, buildDir, stop };
		await Bun.sleep(100);
	}
	stop();
	throw new Error('the built Nuxt server did not answer');
}
