import { assertRequirement, type PermissionRequirement } from '@nxgt/ory-sdk';
import { assertDeclaredArgument, assertReadablePath } from './paths';

/**
 * What a requirement is checked against when the schema is built.
 *
 * `namespaces` is optional: without it any namespace is taken on trust. With
 * it — the namespaces of the stack's OPL document — a misspelt `type` stops
 * the server from booting instead of answering `false` for ever, which Keto
 * does, without an error, for a namespace it does not know.
 */
export type RequirementScope = {
	/** `@permission on Query.note` — the directive and the field, for the message. */
	where: string;
	argumentNames: readonly string[];
	namespaces?: readonly string[];
};

/**
 * Every mistake a requirement can carry that is visible without a request, as
 * a `TypeError` naming the field: an empty name or type, a path naming no
 * root, an argument the field does not declare, and a namespace the model
 * does not have.
 */
export function assertRequirementShape(
	permissions: PermissionRequirement,
	scope: RequirementScope,
) {
	const { where, argumentNames, namespaces } = scope;
	try {
		assertRequirement(permissions, where);
	} catch (error) {
		throw new TypeError((error as Error).message);
	}
	for (const group of permissions) {
		for (const term of group) {
			assertReadablePath(term, where);
			assertDeclaredArgument(term, argumentNames, where);
			if (namespaces && !namespaces.includes(term.namespace)) {
				throw new TypeError(
					`${where}: unknown namespace ${JSON.stringify(term.namespace)} — known: ${namespaces.join(', ')}`,
				);
			}
		}
	}
}
