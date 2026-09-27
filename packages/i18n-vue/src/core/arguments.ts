import type { ArgumentKind, Message } from './catalogues';

/** What each kind of argument accepts — as the generated types declare it. */
const KINDS: Readonly<Record<ArgumentKind, (value: unknown) => boolean>> = {
	string: (value) => typeof value === 'string' || typeof value === 'number',
	number: (value) => typeof value === 'number',
	date: (value) => value instanceof Date || typeof value === 'number',
};

const kindOf = (value: unknown) =>
	value === null ? 'null' : value instanceof Date ? 'date' : typeof value;

/**
 * Checks `args` against `declared`, the fallback locale's message, which
 * declares every argument: arguments that are not an object, and a value of
 * the wrong kind, are a `TypeError`; an argument left out, and one the
 * message does not use, an `Error`. Each names `<where>` and the key, never a
 * value.
 */
export function checkArguments(
	where: string,
	key: string,
	declared: Message,
	args: unknown,
): void {
	if (typeof args !== 'object' || args === null || Array.isArray(args)) {
		throw new TypeError(
			`${where}: ${key} takes its arguments as an object, as { name: 'Ada' }`,
		);
	}
	for (const [name, kind] of declared.args) {
		if (!Object.hasOwn(args, name)) {
			throw new Error(`${where}: ${key} needs {${name}}`);
		}
		const value = (args as Record<string, unknown>)[name];
		if (!KINDS[kind](value)) {
			throw new TypeError(
				`${where}: ${key} is given {${name}} as a ${kindOf(value)} — the message uses it as a ${kind}`,
			);
		}
	}
	for (const name of Object.keys(args)) {
		if (!declared.args.has(name)) {
			throw new Error(`${where}: ${key} does not use {${name}}`);
		}
	}
}
