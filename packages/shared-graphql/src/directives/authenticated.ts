import { getDirective } from '@graphql-tools/utils';
import type { GraphQLSchema } from 'graphql';
import type { FieldNode } from './scope';

export const AUTHENTICATED_DIRECTIVE_NAME = 'authenticated';

/**
 * The kinds of caller `@authenticated(type:)` can name by default: Ory's
 * `OryPrincipal.kind` — a Kratos `session`, or an OAuth2 access `token`
 * (introspected by Hydra, whether a person's or a `client_credentials` one).
 */
export const CALLER_TYPES = ['session', 'token'] as const;

export type AuthenticatedOptions = {
	/**
	 * Every value a `type:` may name, when the caller's type is not Ory's
	 * `kind` — `TokenPrincipal.tokenType` behind a gateway, say. A `type`
	 * outside it is refused at build. `CALLER_TYPES` by default.
	 */
	types?: readonly string[];
};

/**
 * What the `@authenticated`s that apply to one field demand together: a
 * caller, and — when `types` is set — one of those types. Every directive
 * that applies must hold, so `types` is their intersection.
 */
export type CallerRequirement = { types?: readonly string[] };

/**
 * The `@authenticated` on a field, a type or an interface, read and
 * validated: `null` when there is none, `{}` for any caller, `{ types }` for
 * a caller of one of them.
 *
 * Federation declares `@authenticated` with no argument. A schema that
 * imports that declaration has no `type` to read, and every `@authenticated`
 * in it means "any caller" — the shape is accepted as it is.
 */
export function readAuthenticated(
	schema: GraphQLSchema,
	node: FieldNode,
	where: string,
	known: readonly string[],
): CallerRequirement | null {
	const [found] =
		getDirective(schema, node, AUTHENTICATED_DIRECTIVE_NAME) ?? [];
	if (!found) return null;
	const types = found.type as unknown;
	if (types === undefined || types === null) return {};
	if (!Array.isArray(types) || types.length === 0) {
		throw new TypeError(
			`@authenticated on ${where}: \`type: []\` admits no caller — name a type, or drop \`type\``,
		);
	}
	for (const type of types) {
		if (!known.includes(type)) {
			throw new TypeError(
				`@authenticated on ${where}: unknown type ${JSON.stringify(type)} — known: ${known.join(', ')}`,
			);
		}
	}
	return { types };
}

/**
 * Every requirement that applies to one field, AND-ed: a caller when any
 * applies, and the types all of them admit. Refused at build when they admit
 * no type in common — no request could pass.
 */
export function combineRequirements(
	found: readonly (CallerRequirement | null)[],
	where: string,
): CallerRequirement | null {
	const applying = found.filter((one): one is CallerRequirement => !!one);
	if (applying.length === 0) return null;
	let types: readonly string[] | undefined;
	for (const { types: these } of applying) {
		if (!these) continue;
		types = types ? types.filter((type) => these.includes(type)) : these;
	}
	if (types?.length === 0) {
		throw new TypeError(
			`@authenticated on ${where}: the field's, its type's and its interfaces' \`type\`s have none in common — no caller could pass`,
		);
	}
	return types ? { types } : {};
}
