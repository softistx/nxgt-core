import { getDirective } from '@graphql-tools/utils';
import type { GraphQLSchema } from 'graphql';
import {
	assertRequirement,
	type PermissionRequirement,
	type PermissionTerm,
} from 'stx-sdk/ory';

/**
 * `@check` — the Ory-native counterpart to `@policy`.
 *
 * The declaration itself is SDL, in `graphql/directives/check.graphqls`, so it
 * reaches every consumer of `SHARED_SCHEMA_PATH`. This module only reads it.
 * Keeping the two in one place would mean two copies of the same grammar, and
 * the copy nobody edits is the one that goes wrong.
 */
export const CHECK_DIRECTIVE_NAME = 'check';

export type CheckDenial = 'NOT_FOUND' | 'FORBIDDEN';

export type CheckArgs = {
	permissions: PermissionRequirement;
	onDeny: CheckDenial;
};

/**
 * Every `@check` on a field, in declaration order.
 *
 * `@check` is repeatable, so this is a list and the order is load-bearing:
 * `view` then `edit` is what turns a denial into 404 for a stranger and 403
 * for a viewer. `getDirective` reads the arguments against the schema's own
 * definition, which is what applies the `id` and `onDeny` defaults — the AST
 * node carries only what was written.
 */
export function readChecks(
	schema: GraphQLSchema,
	node: Parameters<typeof getDirective>[1],
	where: string,
): CheckArgs[] {
	const found = getDirective(schema, node, CHECK_DIRECTIVE_NAME) ?? [];

	return found.map((raw) => {
		const permissions = (raw.permissions ?? []) as PermissionRequirement;
		assertRequirement(permissions, `@check on ${where}`);
		for (const group of permissions) {
			for (const term of group) assertReadablePath(term, where);
		}
		return {
			permissions,
			onDeny: (raw.onDeny ?? 'NOT_FOUND') as CheckDenial,
		};
	});
}

/**
 * Validated here, when the schema is transformed, and not when a request
 * arrives: a path naming neither root is a wiring mistake, and it should stop
 * the server from booting rather than 500 on the one query nobody tried.
 */
export function assertReadablePath(term: PermissionTerm, where: string) {
	if (!/^(args|source)(\.[A-Za-z0-9_]+)+$/.test(term.id)) {
		throw new Error(
			`@check on ${where}: \`id\` must be "args.<path>" or "source.<path>", got ${JSON.stringify(term.id)}`,
		);
	}
}

/** Reads `args.x` / `source.x.y` off a resolver's inputs. */
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
