import { MapperKind, mapSchema } from '@graphql-tools/utils';
import { ErrorCode } from '@nxgt/shared-exceptions';
import {
	type GraphQLFieldConfig,
	type GraphQLSchema,
	getNamedType,
	isEnumType,
	isObjectType,
	isScalarType,
} from 'graphql';
import {
	type AuthenticatedOptions,
	CALLER_TYPES,
	type CallerRequirement,
	combineRequirements,
	readAuthenticated,
} from '../directives/authenticated';
import type { PrincipalContext } from '../types';
import { denial } from '../utils/errors/denial';
import { guardField, isGuarded } from './field-guard';
import type { OryContext } from './ory-auth';

type FieldConfig = GraphQLFieldConfig<unknown, unknown>;

const MARK = '@nxgt/shared-graphql:authenticated';

/**
 * Wraps every object field that an `@authenticated` applies to — on the field,
 * on its type, on one of its type's interfaces or on that interface's field,
 * or on the scalar or enum it returns — so the caller is checked before its
 * resolver (and a subscription's `subscribe`) runs: none is
 * `UNAUTHENTICATED` (401), one of a type no `type:` names is `FORBIDDEN`
 * (403). Every one that applies must hold.
 *
 * Read and validated when the schema is built: `type: []`, a type outside
 * `options.types` (`session`, `token` by default) and restrictions with no
 * type in common each throw a `TypeError` naming `Type.field`.
 *
 * The caller is `context.user`, which `useOryAuth` and `useAuth` set; its
 * type is `context.ory.kind`, or `context.user.tokenType` without Ory. A field
 * already guarded is left alone, and a schema with none left to guard is
 * returned as it is, so the plugin's `onSchemaChange` settles.
 */
export function applyAuthenticated(
	schema: GraphQLSchema,
	options: AuthenticatedOptions = {},
): GraphQLSchema {
	const known = options.types ?? CALLER_TYPES;
	let guardedNow = 0;
	const mapped = mapSchema(schema, {
		[MapperKind.OBJECT_FIELD]: (fieldConfig, fieldName, typeName) => {
			const where = `${typeName}.${fieldName}`;
			const requirement = requirementOf(schema, fieldConfig, where, known);
			if (!requirement || isGuarded(fieldConfig, MARK)) return fieldConfig;
			guardedNow += 1;
			return guarded(fieldConfig, requirement);
		},
	});
	return guardedNow > 0 ? mapped : schema;
}

/** Every `@authenticated` that applies to `Type.field`, combined. */
function requirementOf(
	schema: GraphQLSchema,
	fieldConfig: FieldConfig,
	where: string,
	known: readonly string[],
): CallerRequirement | null {
	const [typeName = '', fieldName = ''] = where.split('.');
	const type = schema.getType(typeName);
	const interfaces = isObjectType(type) ? type.getInterfaces() : [];
	const read = (node: Parameters<typeof readAuthenticated>[1], at: string) =>
		readAuthenticated(schema, node, at, known);
	return combineRequirements(
		[
			read(fieldConfig, where),
			type ? read(type, typeName) : null,
			...interfaces.flatMap((iface) => {
				const field = iface.getFields()[fieldName];
				return [
					read(iface, iface.name),
					field ? read(field, `${iface.name}.${fieldName}`) : null,
				];
			}),
			leafRequirement(schema, fieldConfig, read),
		],
		where,
	);
}

/**
 * A scalar or an enum has no resolver of its own, so its `@authenticated`
 * guards every field that returns it — the reading federation's router gives
 * the same declaration.
 */
function leafRequirement(
	schema: GraphQLSchema,
	fieldConfig: FieldConfig,
	read: (
		node: Parameters<typeof readAuthenticated>[1],
		at: string,
	) => CallerRequirement | null,
): CallerRequirement | null {
	const leaf = schema.getType(getNamedType(fieldConfig.type).name);
	if (!leaf || !(isScalarType(leaf) || isEnumType(leaf))) return null;
	return read(leaf, leaf.name);
}

function guarded(
	fieldConfig: FieldConfig,
	{ types }: CallerRequirement,
): FieldConfig {
	return guardField(fieldConfig, {
		mark: MARK,
		rank: 0,
		onSubscribe: true,
		check: (_source, _args, context) => {
			const ctx = (context ?? {}) as PrincipalContext & OryContext;
			if (!ctx.user) throw denial(ErrorCode.Unauthenticated);
			if (types && !types.includes(callerTypeOf(ctx) ?? '')) {
				throw denial(ErrorCode.Forbidden);
			}
		},
	});
}

function callerTypeOf(ctx: PrincipalContext & OryContext): string | undefined {
	return ctx.ory?.kind ?? ctx.user?.tokenType;
}
