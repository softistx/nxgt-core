import { assertRequirement, type PermissionRequirement } from '@nxgt/ory-sdk';
import { assertDeclaredArgument, assertReadablePath } from './paths';

/**
 * What a requirement is checked against when the schema is built.
 *
 * `namespaces` is optional: without it any namespace is taken on trust, as
 * before. With it — the namespaces of the stack's OPL document — a misspelt
 * `type` stops the server from booting instead of answering `false` for ever,
 * which Keto does, without an error, for a namespace it does not know.
 */
export type RequirementScope = {
	/** `@check on Query.note` — the directive and the field, for the message. */
	where: string;
	argumentNames: readonly string[];
	namespaces?: readonly string[];
	/**
	 * Set for `@check` alone: a mistake it used to let boot — an argument the
	 * field does not declare — is reported here instead of thrown, so a 2.x
	 * schema that booted still boots. It becomes a refusal in the next major.
	 */
	lenient?: (message: string) => void;
};

/**
 * Every mistake a requirement can carry that is visible without a request, as
 * a `TypeError` naming the field: an empty requirement or group (`[[]]` admits
 * everyone), a path naming no root, an argument the field does not declare,
 * and a namespace the model does not have.
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
			declaredOrReported(term, argumentNames, scope);
			if (namespaces && !namespaces.includes(term.namespace)) {
				throw new TypeError(
					`${where}: unknown namespace ${JSON.stringify(term.namespace)} — known: ${namespaces.join(', ')}`,
				);
			}
		}
	}
}

function declaredOrReported(
	term: PermissionRequirement[number][number],
	argumentNames: readonly string[],
	scope: RequirementScope,
) {
	if (!scope.lenient) {
		assertDeclaredArgument(term, argumentNames, scope.where);
		return;
	}
	try {
		assertDeclaredArgument(term, argumentNames, scope.where);
	} catch (error) {
		scope.lenient((error as Error).message);
	}
}
