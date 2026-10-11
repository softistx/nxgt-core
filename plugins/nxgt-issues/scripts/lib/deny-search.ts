/**
 * The search half of the deny-list (see `deny.ts` for the passes): blanks the
 * allowed terms, then looks for each term as written, folded and split at
 * camelCase seams, keeping private stems out of `node_modules/` paths.
 */

import type { DenyList } from './deny';
import { stems } from './deny-terms';
import { fold, normalize, SEPARATORS } from './fold';

/** Own terms of this many characters match inside words (`schoolzdb`). */
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
 * Upper→Upper+lower (`APIClient` → `API Client`), so that `useSchoolzApi()`
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

/** A term, its stems and, for `@scope/name`, its scope with and without `@`. */
const allowForms = (term: string): string[] => {
	const scope = /^@([^/\s]+)\//.exec(term.trim())?.[1];
	return [term, ...stems(term), ...(scope ? [`@${scope}`, scope] : [])];
};

/**
 * The text with every occurrence of an allowed term blanked, as written in
 * any case (`@acme/zorb-sdk`, `node_modules/@acme/zorb-sdk/`), so a private
 * name that folds onto it (`acme/zorb-sdk`) cannot match inside it. Prose that
 * names the private repository otherwise (`the zorb sdk repo`) still refuses,
 * and so does an `owner/name` form (`acme/zorblax-sdk` for an allowed
 * `zorblax-sdk`), outside `node_modules/`.
 */
function blankAllowed(text: string, allow: readonly string[]): string {
	let out = text;
	for (const term of allow) {
		if (fold(term).length < MIN_FOLDED_LENGTH) continue;
		const pattern = new RegExp(wholeWord(term).source, 'giu');
		out = out.replace(pattern, (match, offset: number, whole: string) => {
			const before = whole.slice(Math.max(0, offset - 40), offset);
			const owned = /[\w.-]\/$/.test(before) && !/node_modules\/$/.test(before);
			return owned ? match : ' '.repeat(match.length);
		});
	}
	return out;
}

const searchable = (raw: string) => {
	const decoded = normalize(raw);
	return { raw, decoded, spaced: splitWords(decoded) };
};

/** Deny-list terms present, as written or in a variant (see the module comment). */
export function findDenied(
	text: string,
	denyList: DenyList,
	allow: readonly string[] = [],
): string[] {
	// Allowing a package also allows its scope and stems, which a deny-list may hold.
	const allowed = new Set(allow.flatMap(allowForms).map(lower));
	const distinctive = new Set(denyList.distinctive.map(lower));
	const stemSet = new Set((denyList.stems ?? []).map(lower));
	const visible = blankAllowed(text, allow);
	const full = searchable(visible);
	const outsidePackages = searchable(visible.replace(PACKAGE_PATH, ' '));
	const hits: string[] = [];
	for (const term of unique(denyList.terms)) {
		if (allowed.has(term.toLowerCase())) continue;
		const { raw, decoded, spaced } = stemSet.has(lower(term))
			? outsidePackages
			: full;
		const folded = fold(term);
		const bounded = !(
			distinctive.has(lower(term)) && folded.length >= MIN_SUBSTRING_LENGTH
		);
		const found =
			folded.length >= MIN_FOLDED_LENGTH
				? wholeWord(term, bounded).test(raw) ||
					looseWord(folded, bounded).test(decoded) ||
					looseWord(folded, bounded).test(spaced)
				: wholeWord(term).test(raw) || wholeWord(term).test(decoded);
		if (found) hits.push(term);
	}
	return hits;
}
