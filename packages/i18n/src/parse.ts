import {
	type MessageFormatElement,
	parse,
	TYPE,
} from '@formatjs/icu-messageformat-parser';

/**
 * How a message uses an argument, as the ICU syntax names it: `{name}` is an
 * `argument`, `{n, number}` a `number`, `{n, plural, …}` a `plural`,
 * `{n, selectordinal, …}` a `selectordinal`, `<b>…</b>` a `tag` (formatted
 * by a function the caller passes under that name).
 */
export type ArgumentKind =
	| 'argument'
	| 'number'
	| 'date'
	| 'time'
	| 'select'
	| 'plural'
	| 'selectordinal'
	| 'tag';

/** One argument a message uses, and how. */
export type MessageArgument = { name: string; kind: ArgumentKind };

type Position = { offset: number; line: number; column: number };

/**
 * A message that is not valid ICU. `code` is the parser's
 * (`EXPECT_ARGUMENT_CLOSING_BRACE`, …), and `offset`, `line` and `column`
 * point at where it went wrong in `source`. A skeleton the parser locates
 * keeps its own code (`INVALID_NUMBER_SKELETON`, `EXPECT_DATE_TIME_SKELETON`);
 * one it refuses without saying where (`{d, date, ::YYYY}`) has the code
 * `INVALID_SKELETON` and no position. `cause` is the parser's own error.
 */
export class MessageSyntaxError extends SyntaxError {
	override readonly name = 'MessageSyntaxError';
	readonly offset: number | undefined;
	readonly line: number | undefined;
	readonly column: number | undefined;

	constructor(
		readonly code: string,
		readonly source: string,
		position: Position | undefined,
		cause: unknown,
	) {
		const where = position ? ` at ${position.line}:${position.column}` : '';
		super(`@nxgt/i18n: ${code}${where} in ${JSON.stringify(source)}`, {
			cause,
		});
		this.offset = position?.offset;
		this.line = position?.line;
		this.column = position?.column;
	}
}

function kindOf(element: MessageFormatElement): ArgumentKind | undefined {
	switch (element.type) {
		case TYPE.argument:
			return 'argument';
		case TYPE.number:
			return 'number';
		case TYPE.date:
			return 'date';
		case TYPE.time:
			return 'time';
		case TYPE.select:
			return 'select';
		case TYPE.plural:
			return element.pluralType === 'ordinal' ? 'selectordinal' : 'plural';
		case TYPE.tag:
			return 'tag';
		default:
			return undefined;
	}
}

function collect(
	elements: MessageFormatElement[],
	found: MessageArgument[],
): void {
	for (const element of elements) {
		const kind = kindOf(element);
		if (kind !== undefined && 'value' in element) {
			const name = element.value;
			if (!found.some((seen) => seen.name === name && seen.kind === kind)) {
				found.push({ name, kind });
			}
		}
		if (element.type === TYPE.select || element.type === TYPE.plural) {
			for (const option of Object.values(element.options)) {
				collect(option.value, found);
			}
		} else if (element.type === TYPE.tag) {
			collect(element.children, found);
		}
	}
}

/**
 * Parses an ICU message the way `translate` formats it, and answers the
 * arguments it uses, each `{ name, kind }` pair once, in the order they first
 * appear — inside plural and select branches and tags too. A name used two
 * ways appears twice, which is how a check finds it. Throws a
 * `MessageSyntaxError` for a message that does not parse.
 *
 * For a catalogue loaded from a database: check every message at load time
 * or in a spec, keep to the ICU subset the app allows, and compare the kinds
 * of one key across languages.
 */
export function parseMessage(message: string): MessageArgument[] {
	let elements: MessageFormatElement[];
	try {
		elements = parse(message);
	} catch (error) {
		// A syntax error carries its location; a refused skeleton is a plain
		// RangeError with a sentence for a message and no location.
		const { location } = error as { location?: { start: Position } };
		throw location
			? new MessageSyntaxError(
					(error as Error).message,
					message,
					location.start,
					error,
				)
			: new MessageSyntaxError('INVALID_SKELETON', message, undefined, error);
	}
	const found: MessageArgument[] = [];
	collect(elements, found);
	return found;
}
