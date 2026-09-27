/**
 * `@nxgt/i18n-vue` accepts a message key's segments written in either of
 * `@nxgt/i18n`'s two conventions — `signIn` or `sign-in` — on either side: a
 * catalogue may be authored in one, a call to `t()` may use the other, and
 * they still find each other. This is for **key path segments only**: an
 * ICU argument name (`{firstName}`) is still camelCase-only, checked by
 * `catalogues.ts`'s own `ARGUMENT_NAME`.
 *
 * Matching is **exact, or exactly the other convention's spelling of the
 * same segment** — never a lossy case/hyphen fold. `coop` and `co-op` are two
 * different words that both pass `KEY_SEGMENT`; folding hyphens and case away
 * would make them indistinguishable and silently route a third spelling to
 * whichever won the collision. `otherSegment` computes the one spelling a
 * segment's other convention would produce — `signIn` -> `sign-in` and back
 * — never a whole equivalence class.
 */

/** `signIn` -> `sign-in`. Identity when there is no uppercase letter. */
function camelToKebab(segment: string): string {
	return segment.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/** `sign-in` -> `signIn`. Identity when there is no hyphen. */
function kebabToCamel(segment: string): string {
	return segment.replace(/-([a-z0-9])/g, (_match, letter: string) =>
		letter.toUpperCase(),
	);
}

/** The other convention's spelling of one segment — `[]` when there is none. */
function otherSegment(segment: string): string[] {
	const alt = segment.includes('-')
		? kebabToCamel(segment)
		: camelToKebab(segment);
	return alt === segment ? [] : [alt];
}

/**
 * Whether `a` and `b` are the same key segment: identical, or one is exactly
 * the other convention's spelling of the other. `coop` and `coOp` are not —
 * `coop` has no other convention (no uppercase, no hyphen) — so a catalogue
 * that has both `coop` and `co-op` is never confused with either from a
 * third spelling.
 */
export function sameSegment(a: string, b: string): boolean {
	return a === b || otherSegment(a).includes(b) || otherSegment(b).includes(a);
}

/**
 * Every dotted key that means the same thing as `key` once cases fold — `key`
 * itself, plus each segment's other convention. A catalogue key written
 * `signIn` also yields `sign-in`, so the generated types complete and check
 * both spellings, not only the one the catalogue happens to use.
 */
export function keyVariants(key: string): string[] {
	const segments = key
		.split('.')
		.map((segment) => [segment, ...otherSegment(segment)]);
	let variants = [''];
	for (const options of segments) {
		variants = variants.flatMap((prefix) =>
			options.map((option) => (prefix === '' ? option : `${prefix}.${option}`)),
		);
	}
	return [...new Set(variants)];
}
