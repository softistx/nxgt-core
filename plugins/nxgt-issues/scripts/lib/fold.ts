/**
 * Normalization for the deny-list check: undo the ways a name can be written so
 * that a plain whole-word search misses it. `normalize` decodes the text to the
 * form a reader sees (NFKC, no HTML comments, entities decoded, markdown
 * backslash escapes removed, percent-encoding decoded (until stable, at most three rounds), invisible characters dropped); `fold` goes on to
 * lower-case it and drop spaces, underscores, dots, slashes and every dash, which is how
 * `Secret App`, `secretApp`, `secret.app` and `secret_app` all become
 * `secretapp`.
 *
 * Out of scope: confusables across scripts (a Cyrillic `а` for a Latin `a`).
 * NFKC folds fullwidth and compatibility forms, not look-alikes; a skeleton
 * table would be the fix and is not worth its weight here. Also out of scope:
 * a name hidden by an encoding (base64, hex, rot13); only percent-encoding is
 * undone, and only three layers deep.
 */

import { HIDDEN_SOURCE } from './hidden-chars';

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

const tryDecode = (run: string): string => {
	try {
		return decodeURIComponent(run);
	} catch {
		return run;
	}
};

/** One well-formed UTF-8 escape sequence of one to four bytes. */
const UTF8_ESCAPE =
	/%[0-7][0-9a-f]|%[c-d][0-9a-f]%[89ab][0-9a-f]|%e[0-9a-f](?:%[89ab][0-9a-f]){2}|%f[0-7](?:%[89ab][0-9a-f]){3}/gi;

/**
 * `%2D` and the like. A run with a malformed byte (`%72%80`) would stay
 * wholly encoded and hide a name, so then each valid sequence is decoded on
 * its own and the malformed bytes stay as written.
 */
const decodePercent = (run: string): string => {
	try {
		return decodeURIComponent(run);
	} catch {
		return run.replace(UTF8_ESCAPE, tryDecode);
	}
};

/**
 * Rounds of percent-decoding, each followed by one entity pass: `%252D` and
 * `%25252D` are one separator hidden twice and thrice, `%26%23116%3B` is an
 * entity hidden in percent-encoding and `&#37;74` a percent sign hidden in an
 * entity. The loop stops as soon as the text is stable.
 */
const DECODE_ROUNDS = 3;

const decodeLayers = (text: string): string => {
	let current = text;
	for (let round = 0; round < DECODE_ROUNDS; round++) {
		const next = decodeEntities(
			current.replace(/(?:%[0-9a-f]{2})+/gi, decodePercent),
		);
		if (next === current) break;
		current = next;
	}
	return current;
};

/** Everything `hidden-chars.ts` lists: invisible, and no part of what a reader sees. */
const INVISIBLE = new RegExp(HIDDEN_SOURCE, 'gu');

/** What a reader sees: the text with the markup and the invisible characters undone. */
export function normalize(text: string): string {
	const unescaped = decodeEntities(
		decodeEntities(text.normalize('NFKC').replace(/<!--[\s\S]*?-->/g, '')),
	).replace(/\\([!-/:-@[-`{-~])/g, '$1');
	return decodeLayers(unescaped).normalize('NFKC').replace(INVISIBLE, '');
}

/** The characters `fold` removes: whitespace, underscore, dot, slash, every dash. */
export const SEPARATORS = String.raw`[\s_./\p{Pd}−]`;
const SEPARATORS_G = new RegExp(`${SEPARATORS}+`, 'gu');

export const fold = (text: string): string =>
	normalize(text).toLowerCase().replace(SEPARATORS_G, '');
