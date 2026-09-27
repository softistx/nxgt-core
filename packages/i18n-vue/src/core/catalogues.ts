import {
	type MessageFormatElement,
	parse,
	TYPE,
} from '@formatjs/icu-messageformat-parser';
import { isObject } from './guards';

/**
 * A catalogue as written: nested objects whose leaves are ICU messages, the
 * conventions of `@nxgt/i18n`. A key is kebab-case or camelCase, either one:
 *
 * ```json
 * { "verify-email": { "subject": "Confirm your e-mail address" } }
 * ```
 */
export interface Catalogue {
	readonly [key: string]: string | Catalogue;
}

/** A catalogue per locale: `{ en: {...}, fr: {...} }`. */
export type Catalogues = Readonly<Record<string, Catalogue>>;

/**
 * What an argument is, from the way a message uses it: `{n, number}` and
 * `{n, plural, …}` a number, `{at, date}` a date, anything else a string.
 */
export type ArgumentKind = 'string' | 'number' | 'date';

/** One message, checked, with the kind of each argument it uses. */
export interface Message {
	readonly text: string;
	readonly args: ReadonlyMap<string, ArgumentKind>;
	/** The arguments a `{x, select, …}` chooses on: a placeholder would always choose `other`. */
	readonly selects: ReadonlySet<string>;
}

/** Every message of one locale, by dotted key: `verifyEmail.subject`. */
export type Messages = ReadonlyMap<string, Message>;

/** An ICU argument name: `{firstName}`. Always camelCase, whichever convention the key around it uses. */
const ARGUMENT_NAME = /^[a-z][a-zA-Z0-9]*$/;

/**
 * One segment of a message key: camelCase (`signIn`), kebab-case
 * (`sign-in`), or a single lowercase word (both at once). The convention is
 * kebab-case, the one `@nxgt/i18n` uses; camelCase is still accepted, for
 * catalogues written before this was decided. Key path segments only — an
 * ICU argument name is `ARGUMENT_NAME`.
 */
const KEY_SEGMENT = /^[a-z][a-zA-Z0-9]*$|^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/;

/** `over` merged into `under` key by key: an object is merged, anything else replaces. */
function mergeCatalogue(under: Catalogue, over: Catalogue): Catalogue {
	const out: Record<string, string | Catalogue> = { ...under };
	for (const [key, value] of Object.entries(over)) {
		const below = Object.hasOwn(out, key) ? out[key] : undefined;
		// Defined, not assigned: `out.__proto__ = …` would set the prototype and
		// hide the key from the check that refuses it.
		Object.defineProperty(out, key, {
			value:
				isObject(below) && isObject(value)
					? mergeCatalogue(below, value)
					: value,
			enumerable: true,
			writable: true,
			configurable: true,
		});
	}
	return out;
}

/**
 * Each of `project`'s locales, with `sources` merged under it in order: a
 * source's locale the project does not have is left out.
 */
export function layerCatalogues(
	sources: readonly Catalogues[],
	project: Record<string, Catalogue>,
): Record<string, Catalogue> {
	const out: Record<string, Catalogue> = {};
	for (const [locale, catalogue] of Object.entries(project)) {
		out[locale] = [...sources.map((source) => source[locale]), catalogue]
			.filter((layer): layer is Catalogue => layer !== undefined)
			.reduce(mergeCatalogue, {});
	}
	return out;
}

function flatten(
	catalogue: unknown,
	locale: string,
	prefix: string,
	into: Map<string, string>,
): void {
	if (!isObject(catalogue)) {
		throw new Error(
			`i18n: ${locale}: ${prefix || 'the catalogue'} must be an object of messages`,
		);
	}
	for (const [segment, value] of Object.entries(catalogue)) {
		const key = prefix === '' ? segment : `${prefix}.${segment}`;
		if (!KEY_SEGMENT.test(segment)) {
			throw new Error(
				`i18n: ${locale}: ${key} is not camelCase or kebab-case — every segment of a key is one or the other, and nested rather than dotted, as verifyEmail.title or verify-email.title`,
			);
		}
		if (typeof value === 'string') into.set(key, value);
		else if (isObject(value)) flatten(value, locale, key, into);
		else {
			throw new Error(
				`i18n: ${locale}: ${key} must be a message (a string) or an object of messages`,
			);
		}
	}
}

function collect(
	elements: readonly MessageFormatElement[],
	uses: Map<string, Set<ArgumentKind | 'plain' | 'select'>>,
): void {
	const use = (name: string, kind: ArgumentKind | 'plain' | 'select') =>
		uses.set(name, (uses.get(name) ?? new Set()).add(kind));
	for (const element of elements) {
		if (element.type === TYPE.argument) use(element.value, 'plain');
		else if (element.type === TYPE.number) use(element.value, 'number');
		else if (element.type === TYPE.date || element.type === TYPE.time) {
			use(element.value, 'date');
		} else if (element.type === TYPE.select || element.type === TYPE.plural) {
			use(element.value, element.type === TYPE.plural ? 'number' : 'select');
			for (const option of Object.values(element.options)) {
				collect(option.value, uses);
			}
		} else if (element.type === TYPE.tag) collect(element.children, uses);
	}
}

/**
 * Parses a message and types its arguments. The parser's own error is not
 * kept as the cause: it carries the text of the message, and a build failure
 * names a key, never a text.
 */
function analyse(text: string, locale: string, key: string): Message {
	let ast: MessageFormatElement[];
	try {
		ast = parse(text, { ignoreTag: true, shouldParseSkeletons: true });
	} catch (cause) {
		const reason = cause instanceof Error ? cause.message : 'refused';
		throw new Error(
			`i18n: ${locale}: ${key} is not a valid ICU message (${reason})`,
		);
	}
	const uses = new Map<string, Set<ArgumentKind | 'plain' | 'select'>>();
	collect(ast, uses);
	const args = new Map<string, ArgumentKind>();
	const selects = new Set<string>();
	for (const [name, kinds] of uses) {
		if (!ARGUMENT_NAME.test(name)) {
			throw new Error(
				`i18n: ${locale}: ${key} uses {${name}}, which is not camelCase — an argument is a camelCase name, as {firstName}`,
			);
		}
		if (kinds.has('select')) selects.add(name);
		const typed = [
			...new Set(
				[...kinds]
					.filter((kind) => kind !== 'plain')
					.map((kind) => (kind === 'select' ? 'string' : kind)),
			),
		];
		if (typed.length > 1) {
			throw new Error(
				`i18n: ${locale}: ${key} uses {${name}} as ${typed.join(' and as ')}`,
			);
		}
		args.set(name, (typed[0] as ArgumentKind | undefined) ?? 'string');
	}
	return { text, args, selects };
}

/**
 * Checks `locale` against the fallback locale: the same keys, and no
 * argument the fallback does not declare, or declares as another kind. A
 * translation may leave an argument out.
 */
function compare(
	locale: string,
	messages: Messages,
	fallbackLocale: string,
	reference: Messages,
): void {
	for (const key of [...reference.keys()].sort()) {
		if (!messages.has(key)) {
			throw new Error(
				`i18n: ${locale}: ${key} is missing — ${fallbackLocale}, the fallback locale, has it`,
			);
		}
	}
	for (const key of [...messages.keys()].sort()) {
		const declared = reference.get(key);
		if (declared === undefined) {
			throw new Error(
				`i18n: ${locale}: ${key} is not a key of ${fallbackLocale}, the fallback locale`,
			);
		}
		for (const [name, kind] of (messages.get(key) as Message).args) {
			const expected = declared.args.get(name);
			if (expected === undefined) {
				throw new Error(
					`i18n: ${locale}: ${key} uses {${name}}, which ${fallbackLocale} does not declare`,
				);
			}
			if (expected !== kind) {
				throw new Error(
					`i18n: ${locale}: ${key} uses {${name}} as ${kind}, and ${fallbackLocale} declares it as ${expected}`,
				);
			}
		}
	}
}

/**
 * Checks the catalogues of every locale and answers their messages. A
 * catalogue that is not objects of camelCase or kebab-case keys, a message
 * that does not parse, and a locale that differs from the fallback locale in
 * its keys or its arguments **throw**, naming the locale and the key.
 */
export function checkCatalogues(
	catalogues: Catalogues,
	locales: readonly string[],
	fallbackLocale: string,
): ReadonlyMap<string, Messages> {
	const out = new Map<string, Messages>();
	for (const locale of locales) {
		const flat = new Map<string, string>();
		flatten(catalogues[locale], locale, '', flat);
		out.set(
			locale,
			new Map(
				[...flat].map(([key, text]) => [key, analyse(text, locale, key)]),
			),
		);
	}
	const reference = out.get(fallbackLocale) as Messages;
	for (const locale of locales) {
		if (locale !== fallbackLocale) {
			compare(locale, out.get(locale) as Messages, fallbackLocale, reference);
		}
	}
	return out;
}
