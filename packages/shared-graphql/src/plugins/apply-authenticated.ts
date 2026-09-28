import { MapperKind, mapSchema } from '@graphql-tools/utils';
import { ErrorCode } from '@nxgt/shared-exceptions';
import {
	defaultFieldResolver,
	type GraphQLFieldConfig,
	type GraphQLSchema,
	isObjectType,
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
import type { OryContext } from './ory-auth';
import { isMarked, withMark } from './schema-mark';

type FieldConfig = GraphQLFieldConfig<unknown, unknown>;

const MARK = '@nxgt/shared-graphql:authenticated';

/**
 * Wraps every object field that an `@authenticated` applies to — on the field,
 * on its type, on one of its type's interfaces or on that interface's field —
 * so the caller is checked before its resolver runs: none is
 * `UNAUTHENTICATED` (401), one of a type no `type:` names is `FORBIDDEN`
 * (403). Every one that applies must hold.
 *
 * Read and validated when the schema is built: `type: []`, a type outside
 * `options.types` (`session`, `token` by default) and restrictions with no
 * type in common each throw a `TypeError` naming `Type.field`.
 *
 * The caller is `context.user`, which `useOryAuth` and `useAuth` set; its
 * type is `context.ory.kind`, or `context.user.tokenType` without Ory.
 */
export function applyAuthenticated(
	schema: GraphQLSchema,
	options: AuthenticatedOptions = {},
): GraphQLSchema {
	if (isMarked(schema, MARK)) return schema;
	const known = options.types ?? CALLER_TYPES;
	const mapped = mapSchema(schema, {
		[MapperKind.OBJECT_FIELD]: (fieldConfig, fieldName, typeName) => {
			const requirement = requirementOf(
				schema,
				fieldConfig,
				fieldName,
				typeName,
				known,
			);
			return requirement ? guarded(fieldConfig, requirement) : fieldConfig;
		},
	});
	return withMark(mapped, MARK);
}

function requirementOf(
	schema: GraphQLSchema,
	fieldConfig: FieldConfig,
	fieldName: string,
	typeName: string,
	known: readonly string[],
): CallerRequirement | null {
	const where = `${typeName}.${fieldName}`;
	const type = schema.getType(typeName);
	const interfaces = isObjectType(type) ? type.getInterfaces() : [];
	return combineRequirements(
		[
			readAuthenticated(schema, fieldConfig, where, known),
			type ? readAuthenticated(schema, type, typeName, known) : null,
			...interfaces.flatMap((iface) => {
				const field = iface.getFields()[fieldName];
				return [
					readAuthenticated(schema, iface, iface.name, known),
					field
						? readAuthenticated(
								schema,
								field,
								`${iface.name}.${fieldName}`,
								known,
							)
						: null,
				];
			}),
		],
		where,
	);
}

function guarded(
	fieldConfig: FieldConfig,
	{ types }: CallerRequirement,
): FieldConfig {
	const resolve = fieldConfig.resolve ?? defaultFieldResolver;
	return {
		...fieldConfig,
		resolve: (source, args, context, info) => {
			const ctx = (context ?? {}) as PrincipalContext & OryContext;
			if (!ctx.user) throw denial(ErrorCode.Unauthenticated);
			if (types && !types.includes(callerTypeOf(ctx) ?? '')) {
				throw denial(ErrorCode.Forbidden);
			}
			return resolve(source, args, context, info);
		},
	};
}

function callerTypeOf(ctx: PrincipalContext & OryContext): string | undefined {
	return ctx.ory?.kind ?? ctx.user?.tokenType;
}
