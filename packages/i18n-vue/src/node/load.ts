import { type Dirent, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
	type Catalogue,
	type Catalogues,
	checkCatalogues,
	isKeySegment,
	layerCatalogues,
	type Messages,
} from '../core/catalogues';
import { isObject, LOCALE } from '../core/guards';

/** Where the catalogues of a project are, for the Vite plugin and the Nuxt module. */
export interface CatalogueSource {
	/** Every locale of the project, as BCP 47 tags: `['en', 'fr']`. */
	readonly locales: readonly string[];
	/** The reference every other locale is checked against, and the types are written from. Default the first locale. */
	readonly fallbackLocale?: string;
	/**
	 * The folder of `<locale>.json` catalogues, from the project's root, and of
	 * `<locale>/**\/*.json` — a file's path under it is a key prefix:
	 * `en/mails.json` is `mails.*`, `en/auth/sign-in.json` is `auth.sign-in.*`.
	 * Default `locales`. Not with `messages`.
	 */
	readonly dir?: string;
	/**
	 * A module whose default export is the resources object (`{ en: {...},
	 * fr: {...} }`) or a function that returns it — `messages`, not files, as
	 * the project's own catalogues. From the project's root. Not with `dir`.
	 */
	readonly messages?: string;
	/**
	 * Catalogues under the project's own, as a package ships them. Each is
	 * merged key by key under the next, and the project's own resources over
	 * all of them.
	 */
	readonly catalogues?: readonly Catalogues[];
}

/** The catalogues of a project, merged and checked. */
export interface LoadedCatalogues {
	readonly locales: readonly string[];
	readonly fallbackLocale: string;
	/** The merged catalogues, by locale — what the app formats with. */
	readonly catalogues: Record<string, Catalogue>;
	/** Every checked message, by locale then by dotted key. */
	readonly messages: ReadonlyMap<string, Messages>;
	/** The fallback locale's messages, which declare every argument. */
	readonly reference: Messages;
	/** Every file the loader read, absolute — watch each for a change. */
	readonly files: readonly string[];
	/** Every folder the loader read, absolute — watch each for a new file too. */
	readonly folders: readonly string[];
}

/** Refuses options that are not a {@link CatalogueSource}, with a `TypeError` starting `<name>:`. */
export function checkCatalogueSource(
	name: string,
	options: unknown,
): asserts options is CatalogueSource {
	if (!isObject(options)) {
		throw new TypeError(
			`${name}: options must be an object, as { locales: ['en', 'fr'] }`,
		);
	}
	const { locales } = options;
	if (!Array.isArray(locales) || locales.length === 0) {
		throw new TypeError(
			`${name}: locales must hold at least one locale, as ['en', 'fr']`,
		);
	}
	for (const locale of locales) {
		if (typeof locale !== 'string' || !LOCALE.test(locale)) {
			throw new TypeError(
				`${name}: locales holds something that is not a locale — write each as a BCP 47 tag, as en or pt-BR`,
			);
		}
	}
	if (new Set(locales).size !== locales.length) {
		throw new TypeError(`${name}: locales holds the same locale twice`);
	}
	if (
		options['fallbackLocale'] !== undefined &&
		!locales.includes(options['fallbackLocale'])
	) {
		throw new TypeError(`${name}: fallbackLocale must be one of locales`);
	}
	const { dir } = options;
	if (dir !== undefined && (typeof dir !== 'string' || dir === '')) {
		throw new TypeError(`${name}: dir must be a folder of the project`);
	}
	const { messages } = options;
	if (
		messages !== undefined &&
		(typeof messages !== 'string' || messages === '')
	) {
		throw new TypeError(
			`${name}: messages must be a module path, as './i18n/messages.ts'`,
		);
	}
	if (dir !== undefined && messages !== undefined) {
		throw new TypeError(
			`${name}: dir and messages cannot both be set — messages replaces the folder`,
		);
	}
	const { catalogues } = options;
	if (
		catalogues !== undefined &&
		(!Array.isArray(catalogues) ||
			!catalogues.every(
				(source) => isObject(source) && Object.values(source).every(isObject),
			))
	) {
		throw new TypeError(
			`${name}: catalogues must be a list of catalogues by locale, as [{ en: {...}, fr: {...} }]`,
		);
	}
}

/** One source's catalogues, and the files and folders read to answer them. */
export interface ReadCatalogues {
	readonly catalogues: Record<string, Catalogue>;
	readonly files: readonly string[];
	readonly folders: readonly string[];
}

/** `key` prefixed with `path`, dotted — `path` empty answers `key` itself. */
function dotted(path: string, key: string): string {
	return path === '' ? key : `${path}.${key}`;
}

function collision(
	locale: string,
	key: string,
	prior: string | undefined,
	origin: string,
): Error {
	return new Error(
		`i18n: ${locale}: ${key} is defined by both ${prior ?? 'the project'} and ${origin}`,
	);
}

/**
 * Records `origin` as the owner of every path `catalogue` defines, leaves
 * and objects alike, and seals every object node it defines — the flat
 * file's own nesting is sealed exactly like a folder file's terminal
 * placement, so a folder file cannot graft a sibling into it either.
 */
function recordOwners(
	catalogue: Catalogue,
	path: string,
	origin: string,
	owners: Map<string, string>,
	sealed: Set<string>,
): void {
	for (const [segment, value] of Object.entries(catalogue)) {
		const key = dotted(path, segment);
		owners.set(key, origin);
		if (isObject(value)) {
			sealed.add(key);
			recordOwners(value, key, origin, owners, sealed);
		}
	}
}

/**
 * Places `content` — a whole file's catalogue — at `segments` under `tree`,
 * creating the intermediate objects a folder path needs. **Throws**, naming
 * both origins, the moment `segments` reaches a key another source already
 * defined, or descends into a path a file already placed whole — the file's
 * own prefix is its alone: nothing else may add a sibling inside it, even
 * where the exact leaf name does not itself collide. `sealed` is exactly the
 * set of paths a file placed this way; a plain object an intermediate
 * segment created, or one the flat file's own nesting contributed, stays
 * open for another file to extend.
 */
function place(
	tree: Record<string, unknown>,
	segments: readonly string[],
	content: Catalogue,
	origin: string,
	locale: string,
	owners: Map<string, string>,
	sealed: Set<string>,
): void {
	let cursor = tree;
	let path = '';
	for (const segment of segments.slice(0, -1)) {
		path = dotted(path, segment);
		const existing = Object.hasOwn(cursor, segment)
			? cursor[segment]
			: undefined;
		if (existing === undefined) {
			const child: Record<string, unknown> = {};
			cursor[segment] = child;
			owners.set(path, origin);
			cursor = child;
		} else if (isObject(existing) && !sealed.has(path)) {
			cursor = existing as Record<string, unknown>;
		} else {
			throw collision(locale, path, owners.get(path), origin);
		}
	}
	const last = segments[segments.length - 1] as string;
	const finalPath = dotted(path, last);
	if (Object.hasOwn(cursor, last)) {
		throw collision(locale, finalPath, owners.get(finalPath), origin);
	}
	cursor[last] = content;
	owners.set(finalPath, origin);
	sealed.add(finalPath);
}

/**
 * Every `.json` file under `dir`, recursively, as `/`-separated paths from
 * `dir` — sorted on the full path, so `mails.json` (a message) is processed
 * before `mails/welcome.json` (a folder), whatever the filesystem's own
 * directory order, and so processing order is stable across runs.
 */
function collectJsonFiles(dir: string): string[] {
	const out: string[] = [];
	const walk = (current: string, prefix: string) => {
		let entries: Dirent[];
		try {
			entries = readdirSync(current, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
			if (entry.isDirectory()) walk(join(current, entry.name), rel);
			else if (entry.isFile() && entry.name.endsWith('.json')) out.push(rel);
		}
	};
	walk(dir, '');
	return out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** `auth/sign-in.json` -> `['auth', 'sign-in']`. */
function segmentsOf(relFile: string): string[] {
	const parts = relFile.split('/');
	const last = parts[parts.length - 1] as string;
	parts[parts.length - 1] = last.slice(0, -'.json'.length);
	return parts;
}

/**
 * Reads `<dir>/<locale>.json` and `<dir>/<locale>/**\/*.json` for each
 * locale, and merges them: a folder file's path is a key prefix, and its
 * whole content is placed there. A missing catalogue (neither the file nor
 * the folder), a file that is not JSON or not an object, a bad path segment,
 * a key two sources both define, and a file one locale has that the fallback
 * locale does not (or the other way round) all **throw**, naming the file.
 */
export function readCatalogues(
	dir: string,
	dirName: string,
	locales: readonly string[],
	fallbackLocale: string,
): ReadCatalogues {
	const files: string[] = [];
	const folders: string[] = [dir];
	const folderFilesByLocale = new Map<string, string[]>();
	for (const locale of locales) {
		folderFilesByLocale.set(locale, collectJsonFiles(join(dir, locale)));
	}
	const fallbackFiles = new Set(folderFilesByLocale.get(fallbackLocale));
	for (const locale of locales) {
		if (locale === fallbackLocale) continue;
		const localeFiles = new Set(folderFilesByLocale.get(locale));
		for (const rel of [...fallbackFiles].sort()) {
			if (!localeFiles.has(rel)) {
				throw new Error(
					`i18n: ${dirName}/${locale}/${rel} is missing — ${dirName}/${fallbackLocale}/${rel} exists`,
				);
			}
		}
		for (const rel of [...localeFiles].sort()) {
			if (!fallbackFiles.has(rel)) {
				throw new Error(
					`i18n: ${dirName}/${locale}/${rel} exists, and ${dirName}/${fallbackLocale}/${rel} does not — every locale has the same files`,
				);
			}
		}
	}
	const out: Record<string, Catalogue> = {};
	for (const locale of locales) {
		const flatFile = join(dir, `${locale}.json`);
		const flatName = `${dirName}/${locale}.json`;
		const relFiles = folderFilesByLocale.get(locale) ?? [];
		const flatExists = existsSync(flatFile);
		if (!flatExists && relFiles.length === 0) {
			throw new Error(
				`i18n: ${flatName} is missing — every locale has a catalogue`,
			);
		}
		const owners = new Map<string, string>();
		const sealed = new Set<string>();
		let tree: Record<string, unknown> = {};
		if (flatExists) {
			files.push(flatFile);
			let parsed: unknown;
			try {
				parsed = JSON.parse(readFileSync(flatFile, 'utf8'));
			} catch {
				throw new Error(`i18n: ${flatName} is not valid JSON`);
			}
			if (!isObject(parsed)) {
				throw new Error(`i18n: ${flatName} must be an object of messages`);
			}
			tree = { ...parsed };
			recordOwners(parsed as Catalogue, '', flatName, owners, sealed);
		}
		if (relFiles.length > 0) {
			const localeDir = join(dir, locale);
			folders.push(localeDir);
			for (const rel of relFiles) {
				const name = `${dirName}/${locale}/${rel}`;
				const segments = segmentsOf(rel);
				for (const segment of segments) {
					if (!isKeySegment(segment)) {
						throw new Error(
							`i18n: ${name}: ${segment} is not camelCase or kebab-case — a file path segment is a key segment too, as mails or sign-in`,
						);
					}
				}
				const file = join(localeDir, rel);
				files.push(file);
				let parsed: unknown;
				try {
					parsed = JSON.parse(readFileSync(file, 'utf8'));
				} catch {
					throw new Error(`i18n: ${name} is not valid JSON`);
				}
				if (!isObject(parsed)) {
					throw new Error(`i18n: ${name} must be an object of messages`);
				}
				place(
					tree,
					segments,
					parsed as Catalogue,
					name,
					locale,
					owners,
					sealed,
				);
				// Every key the file's own content defines, not only its root, so
				// a later file's prefix reaching inside it is caught too.
				recordOwners(
					parsed as Catalogue,
					segments.join('.'),
					name,
					owners,
					sealed,
				);
			}
		}
		out[locale] = tree as Catalogue;
	}
	return { catalogues: out, files, folders };
}

/**
 * Runs `messages` — a module whose default export is the resources object
 * or a function that returns it — and answers it as a {@link ReadCatalogues},
 * so `loadCatalogues` treats it exactly like a folder's. **Throws** naming
 * `path` when the module has no default export, the export (or what it
 * answers) is not a resources object, or a locale of `locales` is missing
 * from it.
 */
export async function loadMessages(
	root: string,
	path: string,
	locales: readonly string[],
): Promise<ReadCatalogues> {
	const file = resolve(root, path);
	let loaded: unknown;
	try {
		loaded = await import(pathToFileURL(file).href);
	} catch (cause) {
		const reason = cause instanceof Error ? cause.message : String(cause);
		throw new Error(`i18n: ${path} could not be loaded (${reason})`, {
			cause,
		});
	}
	if (!isObject(loaded) || !('default' in loaded)) {
		throw new Error(
			`i18n: ${path} has no default export — export the resources object, or a function that returns it`,
		);
	}
	let resources = loaded['default'];
	if (typeof resources === 'function') {
		try {
			resources = await resources();
		} catch (cause) {
			const reason = cause instanceof Error ? cause.message : String(cause);
			throw new Error(
				`i18n: ${path}'s default export could not be run (${reason})`,
				{ cause },
			);
		}
	}
	if (!isObject(resources) || !Object.values(resources).every(isObject)) {
		throw new Error(
			`i18n: ${path}'s default export must be a resources object ({ en: {...}, fr: {...} }) or a function that returns one`,
		);
	}
	const catalogues: Record<string, Catalogue> = {};
	for (const locale of locales) {
		if (!Object.hasOwn(resources, locale)) {
			throw new Error(`i18n: ${path} is missing the ${locale} locale`);
		}
		catalogues[locale] = resources[locale] as Catalogue;
	}
	return { catalogues, files: [file], folders: [] };
}

/**
 * Reads the project's own catalogues — `messages` if set, `dir` otherwise —
 * merges the packages' under them, and checks the result. A missing or
 * broken file, a bad module, and a catalogue that cannot be right **throw**,
 * naming the locale and the key.
 */
export async function loadCatalogues(
	root: string,
	source: CatalogueSource,
): Promise<LoadedCatalogues> {
	const { locales } = source;
	const fallbackLocale = source.fallbackLocale ?? (locales[0] as string);
	const own =
		source.messages !== undefined
			? await loadMessages(root, source.messages, locales)
			: readCatalogues(
					resolve(root, source.dir ?? 'locales'),
					source.dir ?? 'locales',
					locales,
					fallbackLocale,
				);
	const catalogues = layerCatalogues(source.catalogues ?? [], own.catalogues);
	const messages = checkCatalogues(catalogues, locales, fallbackLocale);
	return {
		locales,
		fallbackLocale,
		catalogues,
		messages,
		reference: messages.get(fallbackLocale) as Messages,
		files: own.files,
		folders: own.folders,
	};
}
