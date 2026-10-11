/**
 * The deny-list: the terms that may never appear in a public filing, built from
 * what the session knows, and the search for them.
 *
 * `findDenied` looks twice. The original pass is a whole-word, case-insensitive
 * match of the term as written; `_` is a separator, so `SCHOOLZ_API_URL`
 * contains `schoolz-api`'s words but `mysecret-app` does not contain
 * `secret-app`. The folded pass (see `fold.ts`) matches the term's characters
 * with any run of spaces, dots, underscores or dashes (Unicode dashes included)
 * allowed between them, on text with its HTML comments, entities, markdown
 * escapes, invisible characters and compatibility forms undone; it keeps the
 * word boundary at both ends. A term shorter than 4 characters once folded
 * (`web`, `doe`) is searched on the original pass only, in the raw and the
 * decoded text: folded, it would refuse ordinary prose.
 */

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

/** `@scope/name` also denies `name` and `@scope`. */
const scopedParts = (pkg: string): string[] => {
	const match = /^(@[^/\s]+)\/([^/\s]+)$/.exec(pkg.trim());
	return match?.[1] && match[2] ? [match[1], match[2]] : [];
};

/** The name, each of its parts, and the "Last, First" order. */
const nameTerms = (name: string | undefined): string[] => {
	const parts = (name ?? '').split(/[\s,]+/).filter(Boolean);
	if (parts.length < 2) return parts;
	const [first, ...rest] = parts;
	const last = rest.join(' ');
	return [name ?? '', ...parts, `${last}, ${first}`, `${last} ${first}`];
};

/** The terms that may never appear in a filing, from what the session knows. */
export function buildDenyList(inputs: DenyInputs): string[] {
	const repoName = inputs.appRepo?.split('/')[1];
	const packages = inputs.appPackages ?? [];
	const privates = (inputs.privateRepos ?? []).flatMap((entry) =>
		entry.includes('/') ? [entry, entry.split('/')[1]] : [entry],
	);
	return unique([
		inputs.appRepo,
		repoName,
		...packages,
		...packages.flatMap(scopedParts),
		inputs.cwd ? basename(inputs.cwd) : undefined,
		...privates,
		...nameTerms(inputs.gitName),
		inputs.gitEmail,
		inputs.hostname,
		inputs.home,
	]);
}

const escapeRegExp = (text: string): string =>
	text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const BOUNDARY_BEFORE = String.raw`(?<![\p{L}\p{N}])`;
const BOUNDARY_AFTER = String.raw`(?![\p{L}\p{N}])`;

const wholeWord = (term: string): RegExp =>
	new RegExp(`${BOUNDARY_BEFORE}${escapeRegExp(term)}${BOUNDARY_AFTER}`, 'iu');

/** The term's folded characters, any separators allowed between them. */
const looseWord = (folded: string): RegExp =>
	new RegExp(
		`${BOUNDARY_BEFORE}${[...folded].map(escapeRegExp).join(`${SEPARATORS}*`)}${BOUNDARY_AFTER}`,
		'iu',
	);

const MIN_FOLDED_LENGTH = 4;

/** Deny-list terms present, as written or in a variant (see the module comment). */
export function findDenied(
	text: string,
	denyList: readonly string[],
	allow: readonly string[] = [],
): string[] {
	const allowed = new Set(allow.map((term) => term.toLowerCase()));
	const decoded = normalize(text);
	const hits: string[] = [];
	for (const term of unique(denyList)) {
		if (allowed.has(term.toLowerCase())) continue;
		const folded = fold(term);
		const found =
			folded.length >= MIN_FOLDED_LENGTH
				? wholeWord(term).test(text) || looseWord(folded).test(decoded)
				: wholeWord(term).test(text) || wholeWord(term).test(decoded);
		if (found) hits.push(term);
	}
	return hits;
}
