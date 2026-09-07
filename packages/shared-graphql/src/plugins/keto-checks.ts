import { MapperKind, mapSchema } from '@graphql-tools/utils';
import { CustomException } from '@nxgt/shared-exceptions';
import DataLoader from 'dataloader';
import { defaultFieldResolver, type GraphQLSchema } from 'graphql';
import type { Plugin } from 'graphql-yoga';
import {
	evaluateRequirement,
	type Ory,
	type Permission,
	type PermissionTerm,
	type Subject,
	tuple,
} from 'stx-sdk/ory';
import {
	type CheckArgs,
	objectIds,
	readChecks,
	readPath,
} from '../directives/check';
import type { GraphQLBaseContext } from '../types';
import type { OryContext } from './ory-auth';

/**
 * The per-request answer cache, and the reason `@check` costs nothing on top
 * of the access layer that already asks Keto.
 *
 * `DataLoader` here does two things: it **batches** distinct questions into
 * one `POST /relation-tuples/batch/check`, and it **memoises** identical ones
 * for the life of the request. So a field guarded by `@check(view)` and a
 * service that then calls `require<M>Access` — which asks the same question —
 * pay for one round trip between them.
 *
 * The key is Keto's own notation, `Note:n1#view@idn-7`, so a cache hit is
 * legible in a log line.
 */
export type KetoChecker = (
	permission: Permission,
	subject: Subject,
) => Promise<boolean>;

export type KetoChecksContext = {
	ketoChecks?: KetoChecker;
};

export function createKetoChecks(ory: Ory): KetoChecker {
	const loader = new DataLoader<
		{ permission: Permission; subject: Subject },
		boolean,
		string
	>((questions) => ory.checkMany([...questions]), {
		cacheKeyFn: ({ permission, subject }) => tuple(permission, subject),
	});

	return (permission, subject) => loader.load({ permission, subject });
}

/**
 * Wraps every field carrying `@check` so the permission is answered before its
 * resolver runs.
 *
 * Modelled on `applyGraphqlPolicy` in `@nxgt/security` — same `mapSchema` over
 * `MapperKind.OBJECT_FIELD`, same `fieldConfig.resolve ?? defaultFieldResolver`.
 * Exported on its own because a schema transform is far easier to test than a
 * plugin, and `useKetoChecks` is a three-line wrapper over it.
 */
export function applyKetoChecks(schema: GraphQLSchema): GraphQLSchema {
	return mapSchema(schema, {
		[MapperKind.OBJECT_FIELD]: (fieldConfig, fieldName, typeName) => {
			const where = `${typeName}.${fieldName}`;
			const checks = readChecks(schema, fieldConfig, where);
			if (checks.length === 0) return fieldConfig;

			const resolve = fieldConfig.resolve ?? defaultFieldResolver;

			return {
				...fieldConfig,
				resolve: async (source, args, context, info) => {
					const ctx = context as KetoChecksContext & OryContext;
					const subject = ctx.ory?.subject;
					if (!subject) {
						throw CustomException.unauthenticated({
							message: 'errors.unauthenticated',
						});
					}

					const check = ctx.ketoChecks;
					if (!check) {
						throw new Error(
							`@check on ${where}: no checker on the context — useKetoChecks(ory) is not registered`,
						);
					}

					// In declaration order, each with its own denial: `view` first
					// answers 404 for a stranger, `edit` next answers 403 for a viewer.
					for (const { permissions, onDeny, message } of checks) {
						const allowed = await evaluateRequirement(
							permissions,
							(term) => objectsOf(term, source, args, where),
							check,
							subject,
						);
						if (!allowed) throw denial(onDeny, message);
					}

					return resolve(source, args, context, info);
				},
			};
		},
	});
}

/**
 * A term that resolves no object is a wiring mistake — a nullable argument
 * nobody passed, a `source` field that is not selected — and it must not read
 * as "allowed". `evaluateRequirement` throws on an empty list; this only makes
 * the message name the field.
 */
function objectsOf(
	term: PermissionTerm,
	source: unknown,
	args: Record<string, unknown>,
	where: string,
): string[] {
	const ids = objectIds(readPath(term.id, source, args));
	if (ids.length === 0) {
		throw new Error(`@check on ${where}: "${term.id}" resolved no object id`);
	}
	return ids;
}

/**
 * `message` is the field's own i18n key when it gave one. It exists so the
 * directive and the service layer can answer a refusal with the SAME words:
 * two different messages behind one 404 tell the caller which layer spoke, and
 * that is the difference NOT_FOUND is there to hide.
 */
function denial(onDeny: CheckArgs['onDeny'], message?: string) {
	return onDeny === 'FORBIDDEN'
		? CustomException.forbidden({
				message: message ?? 'errors.insufficient-permissions',
			})
		: CustomException.notFound({ message: message ?? 'errors.not-found' });
}

/**
 * Registers the whole thing: the schema transform, and the per-request checker
 * the transform — and the app's own access layer — read off the context.
 *
 * Goes after `useOryAuth(ory)`, which is what puts `ory.subject` there.
 *
 * `replaceSchema` inside `onSchemaChange` re-enters this hook with the new
 * schema, so transformed schemas are remembered and passed through. Without
 * the guard this loops until the stack gives out.
 *
 * `OryUnavailable` is deliberately not caught anywhere here: a Keto outage is
 * a 503 through `createMaskError`, never a denial.
 */
export function useKetoChecks(
	ory: Ory,
): Plugin<GraphQLBaseContext & OryContext & KetoChecksContext> {
	const transformed = new WeakSet<GraphQLSchema>();

	return {
		onSchemaChange: ({ schema, replaceSchema }) => {
			if (transformed.has(schema)) return;
			const next = applyKetoChecks(schema);
			transformed.add(next);
			replaceSchema(next);
		},
		onContextBuilding: ({ extendContext }) => {
			extendContext({ ketoChecks: createKetoChecks(ory) });
		},
	};
}
