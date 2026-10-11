/**
 * The characters that render as nothing, or as something other than what they
 * are, in one place: `fold.ts` drops them before it searches a filing,
 * `untrusted.ts` replaces them in text from GitHub. Format characters (zero
 * width, bidi marks and isolates, the Arabic letter mark, annotation anchors,
 * tag characters), private-use code points, lone surrogates, every
 * Default_Ignorable_Code_Point (the variation selectors, the combining
 * grapheme joiner, the Hangul fillers, the Khmer and Mongolian marks no Cf
 * covers) and the Braille blank.
 */
// \p{DI} already holds U+034F, U+115F/1160, U+3164, U+FFA0 and every variation selector.
export const HIDDEN_SOURCE = String.raw`[\p{Cf}\p{Co}\p{Cs}\p{DI}\u2800]`;
