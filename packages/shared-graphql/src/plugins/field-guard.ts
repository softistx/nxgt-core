import {
	defaultFieldResolver,
	type GraphQLFieldConfig,
	type GraphQLFieldResolver,
} from 'graphql';

type FieldConfig = GraphQLFieldConfig<unknown, unknown>;
type Resolver = GraphQLFieldResolver<unknown, unknown>;

/** What a guard asks before a field runs; it throws to refuse. */
export type FieldCheck = (
	source: unknown,
	args: Record<string, unknown>,
	context: unknown,
) => void | Promise<void>;

/** One transform's guard: its mark, its rank (lower runs first), its check. */
export type FieldGuard = { mark: string; rank: number; check: FieldCheck };

/**
 * The guards on a field, kept on its own `extensions` — which `mapSchema` and
 * `mergeSchemas` carry over with the field — beside the resolvers they wrap
 * and the wrappers built from them.
 */
type Guarded = {
	guards: FieldGuard[];
	resolve: Resolver;
	subscribe?: Resolver;
	wrapped: Resolver;
};

const GUARDS = '@nxgt/shared-graphql:guards';

function guardedOf(config: FieldConfig): Guarded | undefined {
	return config.extensions?.[GUARDS] as Guarded | undefined;
}

/**
 * Whether the transform owning `mark` already guarded this field. A schema
 * merged from a guarded half and an unguarded one keeps the first half's
 * marks and none on the second, so a transform run again wraps exactly the
 * fields it has not wrapped yet — never one twice, never one not at all.
 */
export function isGuarded(config: FieldConfig, mark: string): boolean {
	return !!guardedOf(config)?.guards.some((guard) => guard.mark === mark);
}

/**
 * The field with `guard` added: every guard runs by rank — `@authenticated`
 * before `@permission`, whichever transform ran first — before the resolver,
 * and before `subscribe` when there is one, so a refused subscription opens no
 * stream. When the resolver was replaced since the last guard, the guards so
 * far are inside it, and the new one wraps it alone.
 */
export function guardField(
	config: FieldConfig,
	guard: FieldGuard,
): FieldConfig {
	const previous = guardedOf(config);
	const intact = previous && previous.wrapped === config.resolve;
	const base = intact
		? { resolve: previous.resolve, subscribe: previous.subscribe }
		: {
				resolve: config.resolve ?? defaultFieldResolver,
				subscribe: config.subscribe,
			};
	const guards = [...(intact ? previous.guards : []), guard].sort(
		(a, b) => a.rank - b.rank,
	);
	const checked =
		(next: Resolver): Resolver =>
		async (source, args, context, info) => {
			for (const { check } of guards) await check(source, args, context);
			return next(source, args, context, info);
		};
	const wrapped = checked(base.resolve);
	const record: Guarded = { guards, ...base, wrapped };
	return {
		...config,
		extensions: { ...config.extensions, [GUARDS]: record },
		resolve: wrapped,
		...(base.subscribe && { subscribe: checked(base.subscribe) }),
	};
}
