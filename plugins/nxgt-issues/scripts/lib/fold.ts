/**
 * Normalization for the deny-list check: undo the ways a name can be written so
 * that a plain whole-word search misses it. `normalize` decodes the text to the
 * form a reader sees (NFKC, no HTML comments, entities decoded, markdown
 * backslash escapes removed, percent-encoding decoded, invisible characters dropped); `fold` goes on to
 * lower-case it and drop spaces, underscores, dots, slashes and every dash, which is how
 * `Secret App`, `secretApp`, `secret.app` and `secret_app` all become
 * `secretapp`.
 *
 * Out of scope: confusables across scripts (a Cyrillic `а` for a Latin `a`).
 * NFKC folds fullwidth and compatibility forms, not look-alikes; a skeleton
 * table would be the fix and is not worth its weight here. Also out of scope:
 * a name hidden by an encoding (base64, hex, rot13); only percent-encoding is
 * undone.
 */

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' ',
	shy: '',
	hyphen: '-',
	dash: '-',
	minus: '-',
	ndash: '-',
	mdash: '-',
	lowbar: '_',
	period: '.',
	sol: '/',
	commat: '@',
};

const codePoint = (value: number): string => {
	try {
		return String.fromCodePoint(value);
	} catch {
		return '';
	}
};

const decodeEntities = (text: string): string =>
	text
		.replace(/&#x([0-9a-f]+);?/gi, (_, hex: string) =>
			codePoint(Number.parseInt(hex, 16)),
		)
		.replace(/&#(\d+);?/g, (_, dec: string) => codePoint(Number(dec)))
		.replace(
			/&([a-z]+);/gi,
			(whole, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? whole,
		);

/** `%2D` and the like; a malformed run stays as written. */
const decodePercent = (run: string): string => {
	try {
		return decodeURIComponent(run);
	} catch {
		return run;
	}
};

/** Zero-width characters, the soft hyphen, the combining grapheme joiner, BOM. */
const INVISIBLE =
	/[\u00AD\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]|\u034F/g;

/** What a reader sees: the text with the markup and the invisible characters undone. */
export function normalize(text: string): string {
	return decodeEntities(
		decodeEntities(text.normalize('NFKC').replace(/<!--[\s\S]*?-->/g, '')),
	)
		.replace(/\\([!-/:-@[-`{-~])/g, '$1')
		.replace(/(?:%[0-9a-f]{2})+/gi, decodePercent)
		.normalize('NFKC')
		.replace(INVISIBLE, '');
}

/** The characters `fold` removes: whitespace, underscore, dot, slash, every dash. */
export const SEPARATORS = String.raw`[\s_./\p{Pd}−]`;
const SEPARATORS_G = new RegExp(`${SEPARATORS}+`, 'gu');

export const fold = (text: string): string =>
	normalize(text).toLowerCase().replace(SEPARATORS_G, '');
