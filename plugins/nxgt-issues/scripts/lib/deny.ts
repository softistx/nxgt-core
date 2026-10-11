/**
 * The deny-list: the terms that may never appear in a public filing, built from
 * what the session knows, and the search for them.
 *
 * `findDenied` looks twice. The original pass is a whole-word, case-insensitive
 * match of the term as written; `_` is a separator, so `SCHOOLZ_API_URL`
 * contains `schoolz-api`'s words but `mysecret-app` does not contain
 * `secret-app`. The folded pass (see `fold.ts`) matches the term's characters
 * with any run of spaces, dots, underscores or dashes (Unicode dashes included)
 * allowed between them (`/` too), on text with its HTML comments, entities,
 * markdown escapes, percent-encoding, invisible characters and compatibility
 * forms undone, and again on a copy with a space at every camelCase seam
 * (`useSchoolzApi()`, `MySecretApp`, `APIClient`, `v2Secret`); it keeps the word
 * boundary at both ends. A term shorter than 4 characters once folded
 * (`web`, `doe`) is searched on the original pass only, in the raw and the
 * decoded text: folded, it would refuse ordinary prose.
 */

import { isCommonWord } from './common-words';
import {
	domainTerms,
	GENERIC,
	MIN_LABEL_LENGTH,
	mainLabel,
	scopedParts,
	scopeOf,
	stems,
} from './deny-terms';

export interface DenyInputs {
	/** The application's repository, `owner/repo`. */
	readonly appRepo?: string | undefined;
	/** The application's package and workspace names. */
	readonly appPackages?: readonly string[];
	/** The working directory; its basename is denied. */
	readonly cwd?: string | undefined;
	/** `owner/repo` or bare names of every private repository of the owners. */
	readonly privateRepos?: readonly string[];
	readonly gitName?: string | undefined;
	readonly gitEmail?: string | undefined;
	readonly hostname?: string | undefined;
	/** The application's own domains, such as `api.schoolz.io`. */
	readonly appDomains?: readonly string[];
	readonly home?: string | undefined;
}

export const unique = (terms: readonly (string | undefined)[]): string[] => [
	...new Set(
		terms.map((term) => term?.trim()).filter((term): term is string => !!term),
	),
];

const basename = (path: string): string =>
	path
		.replace(/[\\/]+$/, '')
		.split(/[\\/]/)
		.pop() ?? '';

/** The hostname, and its first label when it has 4+ characters. */
const hostTerms = (hostname: string | undefined): string[] => {
	const first = hostname?.trim().split('.')[0] ?? '';
	return [hostname ?? '', first.length >= MIN_LABEL_LENGTH ? first : ''];
};

/** The name, each of its parts, and the "Last, First" order. */
const nameTerms = (name: string | undefined): string[] => {
	const parts = (name ?? '').split(/[\s,]+/).filter(Boolean);
	if (parts.length < 2) return parts;
	const [first, ...rest] = parts;
	const last = rest.join(' ');
	return [name ?? '', ...parts, `${last}, ${first}`, `${last} ${first}`];
};

/**
 * The deny-list: every term, and the subset that is the application's own
 * distinctive vocabulary (matched inside words). Plain data, so it survives a
 * JSON round-trip (a cache) and a copy with nothing lost; `findDenied` takes
 * nothing else, so a bare array of terms cannot be passed by accident.
 */
export interface DenyList {
	readonly terms: readonly string[];
	readonly distinctive: readonly string[];
	/**
	 * Stems of private repositories: searched outside `node_modules/` paths
	 * only, since a public package path is not private.
	 */
	readonly stems?: readonly string[];
}

export const EMPTY_DENY_LIST: DenyList = Object.freeze({
	terms: [],
	distinctive: [],
});

/** Own terms of this many characters match inside words (`schoolzdb`). */
const MIN_SUBSTRING_LENGTH = 5;

const lower = (term: string): string => term.toLowerCase();

/**
 * The terms that may never appear in a filing, from what the session knows.
 * The application's own distinctive terms (stems of its repository and
 * packages, its scope, the main label of its domains), 5+ characters, are
 * matched without a word boundary by `findDenied`; they are listed in the
 * `distinctive` list of the result. Private repositories are denied by
 * full name and by their distinctive stems (`zorblax` from `zorblax-api`), whole
 * words only, outside `node_modules/` paths; a stem that is a common word
 * (`common-words.ts`: `compose`, `rest`, `react`) is never denied alone.
 */
export function buildDenyList(inputs: DenyInputs): DenyList {
	const repoName = inputs.appRepo?.split('/')[1];
	const packages = inputs.appPackages ?? [];
	const names = (inputs.privateRepos ?? []).map((entry) =>
		entry.includes('/') ? (entry.split('/')[1] ?? entry) : entry,
	);
	const privateStems = unique(
		names
			.flatMap((name) => stems(name))
			.filter((stem) => !isCommonWord(stem, GENERIC)),
	);
	// A single-word name that is a common word (`plugins`) is denied as `owner/name` only.
	const bareNames = names.filter(
		(name) => /[-_.]/.test(name) || !isCommonWord(name, GENERIC),
	);
	const owned = (inputs.privateRepos ?? []).filter((entry) =>
		entry.includes('/'),
	);
	const privates = [...owned, ...bareNames, ...privateStems];
	const distinctiveStems = (name: string | undefined) =>
		stems(name).filter((stem) => !isCommonWord(stem, GENERIC));
	const own = [
		...distinctiveStems(repoName),
		...packages.flatMap(distinctiveStems),
		...packages
			.map(scopeOf)
			.filter((scope) => (scope?.length ?? 0) >= MIN_LABEL_LENGTH),
		...(inputs.appDomains ?? []).map(mainLabel),
	].filter((term): term is string => !!term);
	const terms = unique([
		inputs.appRepo,
		repoName,
		...packages,
		// The scope always; a name part or stem only when it is not a common word.
		...packages.flatMap((pkg) =>
			scopedParts(pkg).filter(
				(part) =>
					part.startsWith('@') ||
					part === scopeOf(pkg) ||
					!isCommonWord(part, GENERIC),
			),
		),
		inputs.cwd ? basename(inputs.cwd) : undefined,
		...privates,
		...nameTerms(inputs.gitName),
		inputs.gitEmail,
		...hostTerms(inputs.hostname),
		...(inputs.appDomains ?? []).flatMap(domainTerms),
		inputs.home,
		...own,
	]);
	return Object.freeze({
		terms,
		distinctive: unique(
			own.filter((term) => term.length >= MIN_SUBSTRING_LENGTH).map(lower),
		),
		stems: privateStems.filter((stem) => !own.includes(stem)).map(lower),
	});
}

export { findDenied } from './deny-search';
