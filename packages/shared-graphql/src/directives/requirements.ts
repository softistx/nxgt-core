import type { DirectiveNode, GraphQLSchema } from 'graphql';
import { CHECK_DIRECTIVE_NAME, type CheckArgs, readChecks } from './check';
import { PERMISSION_DIRECTIVE_NAME, readPermissions } from './permission';
import type { FieldNode, ReadOptions } from './scope';

/**
 * Every `@check` and `@permission` on a field, validated, in the order they
 * are written — across the two names, so a field migrating one directive at a
 * time keeps its 404-then-403 ladder.
 *
 * `getDirective` answers per name, so the interleaving is read back off the
 * field's AST. A field built without one (a schema made in code) has no order
 * to keep across names, and gets its `@check`s first.
 */
export function readRequirements(
	schema: GraphQLSchema,
	node: FieldNode,
	where: string,
	options: ReadOptions = {},
): CheckArgs[] {
	const queues: Record<string, CheckArgs[]> = {
		[CHECK_DIRECTIVE_NAME]: readChecks(schema, node, where, options),
		[PERMISSION_DIRECTIVE_NAME]: readPermissions(schema, node, where, options),
	};
	const ordered: CheckArgs[] = [];
	for (const directive of directivesOf(node)) {
		const next = queues[directive.name.value]?.shift();
		if (next) ordered.push(next);
	}
	return [
		...ordered,
		...(queues[CHECK_DIRECTIVE_NAME] ?? []),
		...(queues[PERMISSION_DIRECTIVE_NAME] ?? []),
	];
}

function directivesOf(node: FieldNode): readonly DirectiveNode[] {
	const field = node as {
		astNode?: { directives?: readonly DirectiveNode[] } | null;
		directives?: readonly DirectiveNode[];
	};
	return field.astNode?.directives ?? field.directives ?? [];
}
