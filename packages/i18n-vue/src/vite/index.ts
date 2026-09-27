/**
 * `@nxgt/i18n-vue/vite` — the build side, for Node: the Vite plugin that
 * checks the catalogues and writes the types of `t`, and the pieces it is
 * made of, for a build that is not Vite.
 */

import { relative, resolve } from 'node:path';
import type { Plugin } from 'vite';
import {
	type CatalogueSource,
	checkCatalogueSource,
	loadCatalogues,
} from '../node/load';
import { typesSource, writeTypes } from '../node/types-source';

export {
	type CatalogueSource,
	checkCatalogueSource,
	type LoadedCatalogues,
	loadCatalogues,
	loadMessages,
	type ReadCatalogues,
	readCatalogues,
} from '../node/load';
export {
	type TypesSourceOptions,
	typesSource,
	writeIfChanged,
	writeTypes,
} from '../node/types-source';

/** What `i18nTypes` takes: where the catalogues are, and where the types go. */
export interface I18nTypesOptions extends CatalogueSource {
	/** The declaration file written, from the project's root. Default `src/generated/i18n.d.ts`. */
	readonly out?: string;
}

/** Where the types go by default, under the project. */
export const TYPES_FILE = 'src/generated/i18n.d.ts';

/**
 * The Vite plugin that types `t`: it reads `<dir>/<locale>.json`, checks the
 * catalogues, and writes `src/generated/i18n.d.ts` — at every start and
 * build, and in `vite dev` each time a catalogue changes.
 *
 * ```ts
 * // vite.config.ts
 * import vue from '@vitejs/plugin-vue';
 * import { i18nTypes } from '@nxgt/i18n-vue/vite';
 *
 * export default defineConfig({ plugins: [vue(), i18nTypes({ locales: ['en', 'fr'] })] });
 * ```
 *
 * A catalogue that cannot be right **fails the build**, naming the locale and
 * the key. In `vite dev`, a change that breaks one is reported and the types
 * are kept; the app's `createI18n` refuses the catalogue itself.
 */
export function i18nTypes(options: I18nTypesOptions): Plugin {
	checkCatalogueSource('i18nTypes', options);
	const out = options.out ?? TYPES_FILE;
	if (typeof out !== 'string' || !out.endsWith('.d.ts')) {
		throw new TypeError(
			'i18nTypes: out must be the path of a .d.ts file, as src/generated/i18n.d.ts',
		);
	}
	let root = process.cwd();
	const generate = async () => {
		const loaded = await loadCatalogues(root, options);
		writeTypes(
			resolve(root, out),
			out,
			typesSource(loaded.reference, loaded.fallbackLocale, {
				locales: loaded.locales,
			}),
		);
	};
	return {
		name: '@nxgt/i18n-vue:types',
		configResolved(config) {
			root = config.root;
		},
		async buildStart() {
			await generate();
		},
		configureServer(server) {
			const regenerate = async () => {
				try {
					await generate();
				} catch (error) {
					server.config.logger.error(
						error instanceof Error ? error.message : String(error),
					);
				}
			};
			// `messages`: only its own file is watched — not what it imports.
			// See docs/guide/catalogues.md#splitting-catalogues.
			if (options.messages !== undefined) {
				const file = resolve(root, options.messages);
				server.watcher.add(file);
				server.watcher.on('change', (changed) => {
					if (changed === file) void regenerate();
				});
				return;
			}
			// `dir`: every `.json` under it, at any depth — a folder file's path
			// is a key prefix, so a change anywhere below counts. Watching `dir`
			// itself, not only its current files, also catches a new one.
			const dir = resolve(root, options.dir ?? 'locales');
			server.watcher.add(dir);
			const onFsEvent = (file: string) => {
				const path = relative(dir, file);
				if (path.startsWith('..') || !path.endsWith('.json')) return;
				void regenerate();
			};
			server.watcher.on('add', onFsEvent);
			server.watcher.on('change', onFsEvent);
		},
	};
}
