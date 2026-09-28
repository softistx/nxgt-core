import { getDirective } from '@graphql-tools/utils';
import type { GraphQLSchema } from 'graphql';
import type { CheckArgs, CheckDenial } from './check';
import { DEFAULT_ID_PATH } from './paths';
import { type FieldNode, type ReadOptions, scopeOf } from './scope';
import { assertRequirementShape } from './validate';

/**
 * `@permission(name:, type:, id:, onDeny:, message:)` — one Keto question per
 * directive, the vocabulary `@nxgt/janus-graphql` uses. Declared in
 * `graphql/directives/permission.graphqls` and `PERMISSION_DIRECTIVE_SDL`.
 */
export const PERMISSION_DIRECTIVE_NAME = 'permission';

export type PermissionDenial = CheckDenial;

/** One `@permission` as written, after its defaults. */
export type PermissionArgs = {
	name: string;
	type: string;
	id: string;
	onDeny: PermissionDenial;
	message?: string;
};

/**
 * Every `@permission` on a field, in declaration order, validated, each as the
 * one-term requirement `@check` would spell `[[{ namespace: type, permit:
 * name, id }]]` — so the transform answers both through one path.
 */
export function readPermissions(
	schema: GraphQLSchema,
	node: FieldNode,
	where: string,
	options: ReadOptions = {},
): CheckArgs[] {
	if (!isOurs(schema)) return [];
	const found = getDirective(schema, node, PERMISSION_DIRECTIVE_NAME) ?? [];
	const scope = scopeOf(node, `@permission on ${where}`, options);

	return found.map((raw) => {
		const args = permissionArgs(raw);
		const permissions = [
			[{ namespace: args.type, permit: args.name, id: args.id }],
		];
		assertRequirementShape(permissions, scope);
		return { permissions, onDeny: args.onDeny, message: args.message };
	});
}

function permissionArgs(raw: Record<string, unknown>): PermissionArgs {
	return {
		name: raw.name as string,
		type: raw.type as string,
		id: (raw.id as string | null | undefined) ?? DEFAULT_ID_PATH,
		onDeny: (raw.onDeny ?? 'NOT_FOUND') as PermissionDenial,
		message: (raw.message as string | null | undefined) ?? undefined,
	};
}

/**
 * `@permission` is a common name. A schema that declares its own — without
 * `name` and `type` — keeps it: only the declaration this package ships (or
 * one of the same shape) is read as a Keto question.
 */
function isOurs(schema: GraphQLSchema): boolean {
	const declared = schema.getDirective(PERMISSION_DIRECTIVE_NAME);
	const names = declared?.args.map((arg) => arg.name) ?? [];
	return names.includes('name') && names.includes('type');
}
