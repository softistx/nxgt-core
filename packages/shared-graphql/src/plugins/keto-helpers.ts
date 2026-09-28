import type { Permission } from '@nxgt/ory-sdk';
import type { TokenPrincipal } from '@nxgt/shared';
import { CustomException } from '@nxgt/shared-exceptions';
import type { GraphQLBaseContext } from '../types';
import type { KetoChecksContext } from './keto-checker';
import type { OryContext } from './ory-auth';

/**
 * The context `useOryAuth(ory)` and `useKetoChecks(ory)` build together —
 * what a resolver of an Ory-native API receives.
 *
 *     createYoga<{}, OryGraphQLContext>({ plugins: [useOryAuth(ory), useKetoChecks(ory)] })
 */
export type OryGraphQLContext = GraphQLBaseContext &
	OryContext &
	KetoChecksContext;

/** The question `can` asks, in `@permission`'s words. */
export type CanQuestion = {
	/** The permit, e.g. `view`. */
	name: string;
	/** The Keto namespace, e.g. `Note`. */
	type: string;
	/** The object id itself — a value, not a path. */
	id: string;
};

/**
 * The caller, or an `UNAUTHENTICATED` refusal (401 through `createMaskError`).
 * An absent caller is not an error to swallow in a resolver that needs one.
 */
export function requireUser(context: {
	user?: TokenPrincipal | null;
}): TokenPrincipal {
	if (!context.user) {
		throw CustomException.unauthenticated({
			message: 'errors.unauthenticated',
		});
	}
	return context.user;
}

/**
 * Asks Keto what `@permission` would, from a resolver — through the same
 * per-request memo, so a question the directive already asked is free.
 *
 * `true` or `false` is Keto's answer. Everything else throws: no caller is
 * `UNAUTHENTICATED`, a missing `useKetoChecks` is a wiring error, and an
 * outage is `OryUnavailable` (a 503) — never a `false` a caller could take
 * for a denial.
 */
export async function can(
	context: OryContext & KetoChecksContext,
	question: CanQuestion,
): Promise<boolean> {
	const subject = context.ory?.subject;
	if (!subject) {
		throw CustomException.unauthenticated({
			message: 'errors.unauthenticated',
		});
	}
	if (!context.ketoChecks) {
		throw new Error(
			'can(): no checker on the context — useKetoChecks(ory) is not registered',
		);
	}
	const permission: Permission = {
		namespace: question.type,
		object: question.id,
		relation: question.name,
	};
	return context.ketoChecks(permission, subject);
}
