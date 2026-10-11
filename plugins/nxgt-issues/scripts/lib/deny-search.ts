/**
 * The search half of the deny-list (see `deny.ts` for the passes): blanks the
 * allowed terms, then looks for each term as written, folded and split at
 * camelCase seams, keeping private stems out of `node_modules/` paths.
 */

import type { DenyList } from './deny';
import { stems } from './deny-terms';
import { fold, normalize, SEPARATORS } from './fold';

/** Own terms of this many characters match inside words (`vexoradb`). */
const MIN_SUBSTRING_LENGTH = 5;

const unique = (terms: readonly string[]): string[] => [
	...new Set(terms.map((term) => term.trim()).filter(Boolean)),
];

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
 * Upper→Upper+lower (`APIClient` → `API Client`), so that `useVexoraApi()`
 * reads as the words it is made of.
 */
const splitWords = (text: string): string =>
	text
		.replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2')
		.replace(/(\p{L})(\p{N})/gu, '$1 $2')
		.replace(/(\p{N})(\p{L})/gu, '$1 $2')
		.replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, '$1 $2');

/** A path under `node_modules/`, up to the next space, quote or bracket. */
const PACKAGE_PATH = /node_modules[\\/][^\s'"()<>]*/g;

/**
 * A term, its stems and, for `@scope/name`, its scope with and without `@`;
 * a stem or scope that the deny-list holds as the application's own
 * distinctive term or a private stem is not allowed through.
 */
const allowForms = (term: string, held: ReadonlySet<string>): string[] => {
	const scope = /^@([^/\s]+)\//.exec(term.trim())?.[1];
	const parts = [...stems(term), ...(scope ? [`@${scope}`, scope] : [])];
	return [term, ...parts.filter((part) => !held.has(lower(part)))];
};

/**
 * The text with every occurrence of an allowed term blanked, as written in
 * any case (`@acme/zorb-sdk`, `node_modules/@acme/zorb-sdk/`), so a private
 * name that folds onto it (`acme/zorb-sdk`) cannot match inside it. An
 * occurrence joined to a word (`vexora-hono` for an allowed `hono`) or in an
 * `owner/name` form outside `node_modules/` stays.
 */
function blankAllowed(text: string, allow: readonly string[]): string {
	let out = text;
	for (const term of allow) {
		if (fold(term).length < MIN_FOLDED_LENGTH) continue;
		const pattern = new RegExp(wholeWord(term).source, 'giu');
		out = out.replace(pattern, (match, offset: number, whole: string) => {
			const before = whole.slice(Math.max(0, offset - 40), offset);
			const end = offset + match.length;
			const after = whole.slice(end, end + 2);
			const joined =
				/[\p{L}\p{N}][-_.]$/u.test(before) || /^[-_.][\p{L}\p{N}]/u.test(after);
			const owned =
				joined || (/[\w.-]\/$/.test(before) && !/node_modules\/$/.test(before));
			return owned ? match : ' '.repeat(match.length);
		});
	}
	return out;
}

interface Views {
	readonly raw: string;
	readonly decoded: string;
	readonly spaced: string;
}

const searchable = (raw: string): Views => {
	const decoded = normalize(raw);
	return { raw, decoded, spaced: splitWords(decoded) };
};

function matches(term: string, views: Views, distinctive: boolean): boolean {
	const { raw, decoded, spaced } = views;
	const folded = fold(term);
	const bounded = !(distinctive && folded.length >= MIN_SUBSTRING_LENGTH);
	return folded.length >= MIN_FOLDED_LENGTH
		? wholeWord(term, bounded).test(raw) ||
				looseWord(folded, bounded).test(decoded) ||
				looseWord(folded, bounded).test(spaced)
		: wholeWord(term).test(raw) || wholeWord(term).test(decoded);
}

/** The views of `text`, with private stems kept out of `node_modules/` paths. */
const viewsOf = (text: string) => ({
	all: searchable(text),
	outsidePackages: searchable(text.replace(PACKAGE_PATH, ' ')),
});

/**
 * Deny-list terms present, as written or in a variant (see the module comment).
 * A term found only once the allowed terms are put back counts unless it
 * matches inside an allowed term itself (the folding case): `the vexora hono
 * app` refuses for a private `vexora-hono` although `hono` is allowed.
 */
export function findDenied(
	text: string,
	denyList: DenyList,
	allow: readonly string[] = [],
): string[] {
	const distinctive = new Set(denyList.distinctive.map(lower));
	const stemSet = new Set((denyList.stems ?? []).map(lower));
	const held = new Set([...distinctive, ...stemSet]);
	// Allowing a package also allows its scope and stems, unless the deny-list holds them.
	const allowed = new Set(allow.flatMap((a) => allowForms(a, held)).map(lower));
	const visible = viewsOf(blankAllowed(text, allow));
	const original = viewsOf(text);
	const allowedViews = allow.map(searchable);
	const hits: string[] = [];
	for (const term of unique(denyList.terms)) {
		if (allowed.has(lower(term))) continue;
		const own = distinctive.has(lower(term));
		const pick = (views: ReturnType<typeof viewsOf>) =>
			stemSet.has(lower(term)) ? views.outsidePackages : views.all;
		const found =
			matches(term, pick(visible), own) ||
			(matches(term, pick(original), own) &&
				!allowedViews.some((views) => matches(term, views, own)));
		if (found) hits.push(term);
	}
	return hits;
}
