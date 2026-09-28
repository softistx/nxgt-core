import { MapperKind, mapSchema } from '@graphql-tools/utils';
import { evaluateRequirement, type PermissionTerm } from '@nxgt/ory-sdk';
import { ErrorCode } from '@nxgt/shared-exceptions';
import type { GraphQLFieldConfig, GraphQLSchema } from 'graphql';
import {
	type FieldPermission,
	objectIds,
	type ReadOptions,
	readPath,
	readPermissions,
} from '../directives';
import { refuseRemovedCheck } from '../directives/removed-check';
import { denial } from '../utils/errors/denial';
import { guardField, isGuarded } from './field-guard';
import type { KetoChecksContext } from './keto-checker';
import type { OryContext } from './ory-auth';

type FieldConfig = GraphQLFieldConfig<unknown, unknown>;

const MARK = '@nxgt/shared-graphql:keto-checks';

/**
 * Wraps every field carrying `@permission` so the permission is answered
 * before its resolver runs.
 *
 * Every requirement is read and validated here, when the schema is built: a
 * malformed path, an argument the field does not declare, an empty group, a
 * namespace outside `options.namespaces`, a guard on an interface field,
 * which no resolver ever runs through, and a `@check` — removed in 3.0 — each
 * throw a `TypeError` naming `Type.field`, so the server does not boot.
 *
 * Modelled on `applyGraphqlPolicy` in `@nxgt/security`. Exported on its own
 * because a schema transform is far easier to test than a plugin. A field it
 * already guarded is left as it is, and a schema with no field left to guard
 * is returned as it is — so it never wraps a field twice, and the plugin's
 * `onSchemaChange` settles.
 */
export function applyKetoChecks(
	schema: GraphQLSchema,
	options: ReadOptions = {},
): GraphQLSchema {
	let guardedNow = 0;
	const mapped = mapSchema(schema, {
		[MapperKind.INTERFACE_FIELD]: (fieldConfig, fieldName, typeName) => {
			refuseOnInterface(schema, fieldConfig, `${typeName}.${fieldName}`);
			return fieldConfig;
		},
		[MapperKind.OBJECT_FIELD]: (fieldConfig, fieldName, typeName) => {
			const where = `${typeName}.${fieldName}`;
			refuseRemovedCheck(schema, fieldConfig, where);
			const requirements = readPermissions(schema, fieldConfig, where, options);
			if (requirements.length === 0 || isGuarded(fieldConfig, MARK)) {
				return fieldConfig;
			}
			guardedNow += 1;
			return guarded(fieldConfig, requirements, where);
		},
	});
	return guardedNow > 0 ? mapped : schema;
}

/** No resolver runs on an interface's field, so a guard there guards nothing. */
function refuseOnInterface(
	schema: GraphQLSchema,
	fieldConfig: FieldConfig,
	where: string,
) {
	refuseRemovedCheck(schema, fieldConfig, where);
	if (readPermissions(schema, fieldConfig, where).length > 0) {
		throw new TypeError(
			`${where}: @permission on an interface field guards nothing — no resolver runs there. Put it on each implementing type's field`,
		);
	}
}

function guarded(
	fieldConfig: FieldConfig,
	requirements: FieldPermission[],
	where: string,
): FieldConfig {
	return guardField(fieldConfig, {
		mark: MARK,
		rank: 1,
		// Before the stream opens only when no term reads the event.
		onSubscribe: requirements.every(({ permissions }) =>
			permissions.every((group) =>
				group.every((term) => term.id.startsWith('args.')),
			),
		),
		check: async (source, args, context) => {
			const ctx = context as KetoChecksContext & OryContext;
			const subject = ctx.ory?.subject;
			if (!subject) throw denial(ErrorCode.Unauthenticated);

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
				if (!allowed) throw refusal(onDeny, message);
			}
		},
	});
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
function refusal(onDeny: FieldPermission['onDeny'], message?: string) {
	return denial(
		onDeny === 'FORBIDDEN' ? ErrorCode.Forbidden : ErrorCode.NotFound,
		message,
	);
}
