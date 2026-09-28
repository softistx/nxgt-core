import { getDirective } from '@graphql-tools/utils';
import type { GraphQLSchema } from 'graphql';
import type { FieldNode } from './scope';

/**
 * `@check`, the list-of-lists form, was removed in 3.0. This package no longer
 * ships its declaration, so a schema that still writes one either fails to
 * build (`Unknown directive "@check"`) or declares it itself — and then the
 * transform, which no longer reads it, would leave the field open in silence.
 *
 * So a field carrying a `@check` whose declaration has `permissions` — the
 * shape 2.x shipped — is refused when the schema is built, naming the field
 * and the rewrite. A `@check` of another shape is the schema's own and is left
 * alone, as a foreign `@permission` is.
 */
export function refuseRemovedCheck(
	schema: GraphQLSchema,
	node: FieldNode,
	where: string,
) {
	const declared = schema.getDirective('check');
	if (!declared?.args.some((arg) => arg.name === 'permissions')) return;
	if (!getDirective(schema, node, 'check')?.length) return;
	throw new TypeError(
		`@check on ${where}: @check was removed in @nxgt/shared-graphql 3.0 — write one @permission(name: "<permit>", type: "<namespace>") per term, and move an OR into the Keto model`,
	);
}
