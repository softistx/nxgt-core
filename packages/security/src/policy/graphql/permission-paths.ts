import type { PermissionTerm } from '../permissions.types';
import type { GraphqlEvaluateInput } from './evaluator';

/**
 * Resolve the object ids one term names, off this field resolution.
 *
 * `args.` reads the field's arguments, `source.` its parent value — the same
 * two roots the `@check` directive uses, and for the same reason: a mutation
 * names its object in an argument, while a field on a returned type only
 * knows it through the object it hangs off. REST's `param.` / `query.` /
 * `json.` mean nothing here, and the schema refuses them.
 *
 * A value that is a LIST requires the permit on every element. A path that
 * resolves nothing throws — a term naming no object is a wiring mistake, and
 * answering `false` would dress it up as a policy decision. Same rule, same
 * reason, as `objectIds` in `@nxgt/shared-graphql`.
 */
export function objectsOfGraphqlTerm(
	term: PermissionTerm,
	input: Pick<GraphqlEvaluateInput, 'args' | 'source'>,
): string[] {
	const [root, ...path] = term.id.split('.');

	let value: unknown = root === 'args' ? (input.args ?? {}) : input.source;
	for (const key of path) {
		value = (value as Record<string, unknown> | null | undefined)?.[key];
	}

	const ids = (Array.isArray(value) ? value : [value]).filter(
		(item): item is string => typeof item === 'string' && item.length > 0,
	);
	if (ids.length === 0) {
		throw new Error(
			`Policy: Keto term "${term.namespace}#${term.permit}" read "${term.id}", which resolved no object id`,
		);
	}
	return ids;
}
