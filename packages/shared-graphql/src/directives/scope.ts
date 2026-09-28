import type { getDirective } from '@graphql-tools/utils';
import type { RequirementScope } from './validate';

/** A field definition or a field config — whatever `getDirective` reads. */
export type FieldNode = Parameters<typeof getDirective>[1];

/** What a schema may add to the build-time checks of `@permission`. */
export type ReadOptions = {
	/**
	 * The namespaces of the stack's OPL document. When given, a `type`
	 * outside it is refused at build.
	 */
	namespaces?: readonly string[];
};

/**
 * The scope a field's requirements are validated in: the message prefix, the
 * arguments the field declares — read from a field config's `args` map or a
 * definition node's `arguments` list — and the known namespaces.
 */
export function scopeOf(
	node: FieldNode,
	where: string,
	options: ReadOptions,
): RequirementScope {
	return {
		where,
		argumentNames: argumentNamesOf(node),
		namespaces: options.namespaces,
	};
}

function argumentNamesOf(node: FieldNode): string[] {
	const field = node as {
		args?: Record<string, unknown> | { name: string }[];
		arguments?: readonly { name: { value: string } }[];
	};
	if (Array.isArray(field.args)) return field.args.map((arg) => arg.name);
	if (field.args) return Object.keys(field.args);
	return field.arguments?.map((arg) => arg.name.value) ?? [];
}
