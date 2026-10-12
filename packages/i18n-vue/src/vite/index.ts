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
	type LoadedCatalogues,
	loadCatalogues,
} from '../node/load';
import { typesSource, writeTypes } from '../node/types-source';
import {
	isVirtual,
	resolveVirtual,
	servedIds,
	virtualModuleSource,
	virtualTypesFile,
	virtualTypesSource,
} from './virtual';

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
	/**
	 * Serve the catalogues as modules, the fallback locale's inline and every
	 * other locale's loaded on demand: `virtual:@nxgt/i18n-vue/catalogues`
	 * exports `fallbackLocale`, `locales`, `catalogues` and `loaders`, ready
	 * for `createI18n`. Their types go beside `out`, in
	 * `<out>.catalogues.d.ts`. Default `false`: nothing is served, and only
	 * `out` is written.
	 */
	readonly lazy?: boolean;
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
 *
 * With `lazy: true` it also serves the catalogues as modules — the
 * `loaders` record `createI18n` takes, so only the fallback locale ships in
 * the entry chunk. In `vite dev`, a change that checks invalidates them and
 * reloads the page; a broken one keeps them, like the types.
 *
 * ```ts
 * import { catalogues, fallbackLocale, loaders } from 'virtual:@nxgt/i18n-vue/catalogues';
 *
 * createApp(App).use(createI18n({ catalogues, loaders, fallbackLocale }));
 * ```
 */
export function i18nTypes(options: I18nTypesOptions): Plugin {
	checkCatalogueSource('i18nTypes', options);
	const out = options.out ?? TYPES_FILE;
	if (typeof out !== 'string' || !out.endsWith('.d.ts')) {
		throw new TypeError(
			'i18nTypes: out must be the path of a .d.ts file, as src/generated/i18n.d.ts',
		);
	}
	const { lazy } = options;
	if (lazy !== undefined && typeof lazy !== 'boolean') {
		throw new TypeError(
			'i18nTypes: lazy must be true or false, as i18nTypes({ locales, lazy: true })',
		);
	}
	let root = process.cwd();
	/** The catalogues the served modules hold: the last that loaded and checked. */
	let served: LoadedCatalogues | undefined;
	const generate = async () => {
		const loaded = await loadCatalogues(root, options);
		writeTypes(
			resolve(root, out),
			out,
			typesSource(loaded.reference, loaded.fallbackLocale, {
				locales: loaded.locales,
			}),
		);
		if (lazy === true) {
			const file = virtualTypesFile(out);
			writeTypes(
				resolve(root, file),
				file,
				virtualTypesSource(loaded.fallbackLocale),
			);
			served = loaded;
		}
		return loaded;
	};
	return {
		name: '@nxgt/i18n-vue:types',
		...(lazy === true
			? {
					resolveId(id: string) {
						return resolveVirtual(id, options.locales);
					},
					async load(id: string) {
						if (!isVirtual(id)) return undefined;
						return virtualModuleSource(id, served ?? (await generate()));
					},
				}
			: {}),
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
					// The served modules keep the last good catalogues, as the types do.
					server.config.logger.error(
						error instanceof Error ? error.message : String(error),
					);
					return;
				}
				if (lazy !== true) return;
				for (const id of servedIds(options.locales)) {
					const module = server.moduleGraph.getModuleById(id);
					if (module !== undefined) server.moduleGraph.invalidateModule(module);
				}
				server.ws.send({ type: 'full-reload' });
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
