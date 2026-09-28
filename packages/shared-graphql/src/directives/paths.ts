import type { PermissionTerm } from '@nxgt/ory-sdk';

/**
 * Where a term's object id is read from a resolver's inputs.
 *
 * `parent` and `source` are one root under two names: `source` is what
 * graphql-js calls a resolver's first argument, `parent` is what the rest of
 * the ecosystem — and `@nxgt/janus-graphql` — calls it. Both are accepted so a
 * schema moving between the two packages keeps its paths.
 */
const PATH = /^(args|parent|source)(\.[A-Za-z0-9_]+)+$/;

/** The id a term reads when it names none. */
export const DEFAULT_ID_PATH = 'args.id';

/**
 * Validated when the schema is transformed, and not when a request arrives: a
 * path naming no root is a wiring mistake, and it should stop the server from
 * booting rather than 500 on the one query nobody tried.
 */
export function assertReadablePath(term: PermissionTerm, where: string) {
	if (!PATH.test(term.id)) {
		throw new TypeError(
			`${where}: \`id\` must be "args.<path>", "parent.<path>" or "source.<path>", got ${JSON.stringify(term.id)}`,
		);
	}
}

/**
 * `args.<name>` must name an argument the field declares. Graphql-js never
 * puts an undeclared argument on `args`, so a typo here resolves no object on
 * every request — refused at build instead, naming the arguments there are.
 */
export function assertDeclaredArgument(
	term: PermissionTerm,
	argumentNames: readonly string[],
	where: string,
) {
	const [root, name] = term.id.split('.');
	if (root !== 'args' || !name || argumentNames.includes(name)) return;
	const declared = argumentNames.length
		? argumentNames.join(', ')
		: 'no arguments';
	throw new TypeError(
		`${where}: \`id\` reads "${term.id}", but the field declares ${declared}`,
	);
}

/** Reads `args.x` / `parent.x.y` / `source.x.y` off a resolver's inputs. */
export function readPath(
	path: string,
	source: unknown,
	args: Record<string, unknown>,
): unknown {
	const [root, ...rest] = path.split('.');
	let value: unknown = root === 'args' ? args : source;
	for (const key of rest) {
		value = (value as Record<string, unknown> | null | undefined)?.[key];
	}
	return value;
}

/** The ids one term has to clear: one value, or every element of a list. */
export function objectIds(value: unknown): string[] {
	const values = Array.isArray(value) ? value : [value];
	return values.filter(
		(item): item is string => typeof item === 'string' && item.length > 0,
	);
}
