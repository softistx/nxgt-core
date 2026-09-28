import { getDirective } from '@graphql-tools/utils';
import type { PermissionRequirement, PermissionTerm } from '@nxgt/ory-sdk';
import type { GraphQLSchema } from 'graphql';
import { warnCheckMistake } from './deprecation';
import { DEFAULT_ID_PATH } from './paths';
import { type FieldNode, type ReadOptions, scopeOf } from './scope';
import { assertRequirementShape } from './validate';

/**
 * `@check` — the list-of-lists form of `@permission`, deprecated in its
 * favour and kept working.
 *
 * The declaration itself is SDL, in `graphql/directives/check.graphqls`, so it
 * reaches every consumer of `SHARED_SCHEMA_PATH`; `CHECK_DIRECTIVE_SDL` is the
 * same text as a string, held equal by a spec. This module only reads it.
 */
export const CHECK_DIRECTIVE_NAME = 'check';

export type CheckDenial = 'NOT_FOUND' | 'FORBIDDEN';

export type CheckArgs = {
	permissions: PermissionRequirement;
	onDeny: CheckDenial;
	/** i18n key; the shared `errors.*` one when the field does not say. */
	message?: string;
};

/**
 * Every `@check` on a field, in declaration order, validated.
 *
 * `@check` is repeatable, so this is a list and the order is load-bearing:
 * `view` then `edit` is what turns a denial into 404 for a stranger and 403
 * for a viewer.
 *
 * The `id` and `onDeny` defaults are applied here as well as in the SDL:
 * graphql 17 no longer hands an input field's default to `getDirective`, and a
 * term without an id would otherwise refuse the whole schema.
 */
export function readChecks(
	schema: GraphQLSchema,
	node: FieldNode,
	where: string,
	options: ReadOptions = {},
): CheckArgs[] {
	const found = getDirective(schema, node, CHECK_DIRECTIVE_NAME) ?? [];
	const scope = {
		...scopeOf(node, `@check on ${where}`, options),
		lenient: warnCheckMistake,
	};

	return found.map((raw) => {
		const permissions = withDefaultIds(raw.permissions);
		assertRequirementShape(permissions, scope);
		return {
			permissions,
			onDeny: (raw.onDeny ?? 'NOT_FOUND') as CheckDenial,
			message: raw.message ?? undefined,
		};
	});
}

function withDefaultIds(raw: unknown): PermissionRequirement {
	if (!Array.isArray(raw)) return raw as PermissionRequirement;
	return raw.map((group) =>
		Array.isArray(group)
			? group.map((term: PermissionTerm) =>
					term && typeof term === 'object'
						? { ...term, id: term.id ?? DEFAULT_ID_PATH }
						: term,
				)
			: group,
	);
}
