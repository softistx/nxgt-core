import { MapperKind, mapSchema } from '@graphql-tools/utils';
import { evaluateRequirement, type PermissionTerm } from '@nxgt/ory-sdk';
import { CustomException } from '@nxgt/shared-exceptions';
import {
	defaultFieldResolver,
	type GraphQLFieldConfig,
	type GraphQLSchema,
} from 'graphql';
import {
	type CheckArgs,
	objectIds,
	type ReadOptions,
	readPath,
	readRequirements,
} from '../directives';
import type { KetoChecksContext } from './keto-checker';
import type { OryContext } from './ory-auth';

type FieldConfig = GraphQLFieldConfig<unknown, unknown>;

/**
 * Wraps every field carrying `@check` or `@permission` so the permission is
 * answered before its resolver runs.
 *
 * Every requirement is read and validated here, when the schema is built: a
 * malformed path, an argument the field does not declare, an empty group, a
 * namespace outside `options.namespaces` — and a guard on an interface field,
 * which no resolver ever runs through — each throw a `TypeError` naming
 * `Type.field`, so the server does not boot.
 *
 * Modelled on `applyGraphqlPolicy` in `@nxgt/security`. Exported on its own
 * because a schema transform is far easier to test than a plugin.
 */
export function applyKetoChecks(
	schema: GraphQLSchema,
	options: ReadOptions = {},
): GraphQLSchema {
	return mapSchema(schema, {
		[MapperKind.INTERFACE_FIELD]: (fieldConfig, fieldName, typeName) => {
			refuseOnInterface(schema, fieldConfig, `${typeName}.${fieldName}`);
			return fieldConfig;
		},
		[MapperKind.OBJECT_FIELD]: (fieldConfig, fieldName, typeName) => {
			const where = `${typeName}.${fieldName}`;
			const requirements = readRequirements(
				schema,
				fieldConfig,
				where,
				options,
			);
			if (requirements.length === 0) return fieldConfig;
			return guarded(fieldConfig, requirements, where);
		},
	});
}

function refuseOnInterface(
	schema: GraphQLSchema,
	fieldConfig: FieldConfig,
	where: string,
) {
	if (readRequirements(schema, fieldConfig, where).length === 0) return;
	throw new TypeError(
		`${where}: @check / @permission on an interface field guards nothing — no resolver runs there. Put it on each implementing type's field`,
	);
}

function guarded(
	fieldConfig: FieldConfig,
	requirements: CheckArgs[],
	where: string,
): FieldConfig {
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
					`${where}: no checker on the context — useKetoChecks(ory) is not registered`,
				);
			}

			// In declaration order, each with its own denial: `view` first
			// answers 404 for a stranger, `edit` next answers 403 for a viewer.
			for (const { permissions, onDeny, message } of requirements) {
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
}

/**
 * A term that resolves no object is a wiring mistake — a nullable argument
 * nobody passed, a `parent` field that is not selected — and it must not read
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
		throw new Error(`${where}: "${term.id}" resolved no object id`);
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
