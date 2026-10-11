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

import {
	domainTerms,
	MIN_LABEL_LENGTH,
	mainLabel,
	scopedParts,
	scopeOf,
	stems,
} from './deny-terms';
import { fold, normalize, SEPARATORS } from './fold';

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
}

export const EMPTY_DENY_LIST: DenyList = Object.freeze({
	terms: [],
	distinctive: [],
});

/** Own terms of this many characters match inside words (`schoolzdb`). */
const MIN_SUBSTRING_LENGTH = 5;

/**
 * The terms that may never appear in a filing, from what the session knows.
 * The application's own distinctive terms (stems of its repository and
 * packages, its scope, the main label of its domains), 5+ characters, are
 * matched without a word boundary by `findDenied`; they are listed in the
 * `distinctive` list of the result. Private repositories are
 * denied by full name only, not by stem.
 */
export function buildDenyList(inputs: DenyInputs): DenyList {
	const repoName = inputs.appRepo?.split('/')[1];
	const packages = inputs.appPackages ?? [];
	const privates = (inputs.privateRepos ?? []).flatMap((entry) =>
		entry.includes('/') ? [entry, entry.split('/')[1]] : [entry],
	);
	const own = [
		...stems(repoName),
		...packages.flatMap((pkg) => stems(pkg)),
		...packages
			.map(scopeOf)
			.filter((scope) => (scope?.length ?? 0) >= MIN_LABEL_LENGTH),
		...(inputs.appDomains ?? []).map(mainLabel),
	].filter((term): term is string => !!term);
	const terms = unique([
		inputs.appRepo,
		repoName,
		...packages,
		...packages.flatMap(scopedParts),
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
	});
}

const lower = (term: string): string => term.toLowerCase();

const escapeRegExp = (text: string): string =>
	text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const BOUNDARY_BEFORE = String.raw`(?<![\p{L}\p{N}])`;
const BOUNDARY_AFTER = String.raw`(?![\p{L}\p{N}])`;

const wholeWord = (term: string, bounded = true): RegExp =>
	new RegExp(
		bounded
			? `${BOUNDARY_BEFORE}${escapeRegExp(term)}${BOUNDARY_AFTER}`
			: escapeRegExp(term),
		'iu',
	);

/** The term's folded characters, any separators allowed between them. */
const looseWord = (folded: string, bounded = true): RegExp => {
	const body = [...folded].map(escapeRegExp).join(`${SEPARATORS}*`);
	return new RegExp(
		bounded ? `${BOUNDARY_BEFORE}${body}${BOUNDARY_AFTER}` : body,
		'iu',
	);
};

const MIN_FOLDED_LENGTH = 4;

/**
 * A separator at each camelCase seam: lower→Upper, letter↔digit, and
 * Upper→Upper+lower (`APIClient` → `API Client`), so that `useSchoolzApi()`
 * reads as the words it is made of.
 */
const splitWords = (text: string): string =>
	text
		.replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2')
		.replace(/(\p{L})(\p{N})/gu, '$1 $2')
		.replace(/(\p{N})(\p{L})/gu, '$1 $2')
		.replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, '$1 $2');

/** Deny-list terms present, as written or in a variant (see the module comment). */
export function findDenied(
	text: string,
	denyList: DenyList,
	allow: readonly string[] = [],
): string[] {
	// Allowing a package also allows its scope and stems, which a deny-list may hold.
	const allowed = new Set(
		allow
			.flatMap((term) => [term, ...scopedParts(term)])
			.map((term) => term.toLowerCase()),
	);
	const decoded = normalize(text);
	const spaced = splitWords(decoded);
	const distinctive = new Set(denyList.distinctive.map(lower));
	const hits: string[] = [];
	for (const term of unique(denyList.terms)) {
		if (allowed.has(term.toLowerCase())) continue;
		const folded = fold(term);
		const bounded = !(
			distinctive.has(lower(term)) && folded.length >= MIN_SUBSTRING_LENGTH
		);
		const found =
			folded.length >= MIN_FOLDED_LENGTH
				? wholeWord(term, bounded).test(text) ||
					looseWord(folded, bounded).test(decoded) ||
					looseWord(folded, bounded).test(spaced)
				: wholeWord(term).test(text) || wholeWord(term).test(decoded);
		if (found) hits.push(term);
	}
	return hits;
}
