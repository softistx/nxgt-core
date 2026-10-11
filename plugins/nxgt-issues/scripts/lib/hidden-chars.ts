/**
 * The characters that render as nothing, or as something other than what they
 * are, in one place: `fold.ts` drops them before it searches a filing,
 * `untrusted.ts` replaces them in text from GitHub. Format characters (zero
 * width, bidi marks and isolates, the Arabic letter mark, annotation anchors,
 * tag characters), private-use code points, lone surrogates, the Hangul
 * fillers and the Braille blank. The variation selectors and the combining
 * grapheme joiner are their own alternatives: they combine with the character
 * before them, which a single character class cannot hold.
 */
export const HIDDEN_SOURCE = String.raw`[\p{Cf}\p{Co}\p{Cs}\u2800\u115F\u1160\u3164\uFFA0]|\u034F|[\uFE00-\uFE0F]|[\u{E0100}-\u{E01EF}]`;
