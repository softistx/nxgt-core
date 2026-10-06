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

/**
 * One transform's guard on one field: its mark, its rank (lower runs first),
 * its check, and whether the check can run before a subscription's stream is
 * opened — only when it reads nothing off an event (`parent.<path>`).
 */
export type FieldGuard = {
	mark: string;
	rank: number;
	check: FieldCheck;
	onSubscribe: boolean;
};

/**
 * The guards on a field, kept on its own `extensions` — which `mapSchema` and
 * `mergeSchemas` carry over with the field — with the resolvers they wrap
 * and the wrappers built from them.
 */
type Guarded = {
	guards: FieldGuard[];
	resolve: Resolver;
	subscribe?: Resolver | undefined;
	wrapped: { resolve: Resolver; subscribe?: Resolver | undefined };
};

const GUARDS = '@nxgt/shared-graphql:guards';

/**
 * The field's guards while its resolvers are still the wrappers they built.
 * A resolver replaced since — `addResolversToSchema`, a merge with
 * resolvers — keeps the field's `extensions` but not its guards, so the
 * record no longer counts.
 */
function intactGuards(config: FieldConfig): Guarded | undefined {
	const record = config.extensions?.[GUARDS] as Guarded | undefined;
	if (!record || record.wrapped.resolve !== config.resolve) return undefined;
	if (record.wrapped.subscribe !== config.subscribe) return undefined;
	return record;
}

/**
 * Whether the transform owning `mark` guards this field as it stands. A
 * merged schema's unguarded half, or a field whose resolver was replaced,
 * is not — so a transform run again wraps it, never one twice.
 */
export function isGuarded(config: FieldConfig, mark: string): boolean {
	return !!intactGuards(config)?.guards.some((guard) => guard.mark === mark);
}

/**
 * The field with `guard` added. Every guard runs by rank — `@authenticated`
 * before `@permission`, whichever transform ran first — before the resolver;
 * those with `onSubscribe` also run before `subscribe`, so a refused
 * subscription opens no stream.
 */
export function guardField(
	config: FieldConfig,
	guard: FieldGuard,
): FieldConfig {
	const previous = intactGuards(config);
	const base = previous
		? { resolve: previous.resolve, subscribe: previous.subscribe }
		: {
				resolve: config.resolve ?? defaultFieldResolver,
				subscribe: config.subscribe,
			};
	const guards = [...(previous?.guards ?? []), guard].sort(
		(a, b) => a.rank - b.rank,
	);
	const wrapped = {
		resolve: checked(guards, base.resolve),
		subscribe:
			base.subscribe &&
			checked(
				guards.filter((one) => one.onSubscribe),
				base.subscribe,
			),
	};
	return {
		...config,
		extensions: {
			...config.extensions,
			[GUARDS]: { guards, ...base, wrapped } satisfies Guarded,
		},
		resolve: wrapped.resolve,
		...(wrapped.subscribe ? { subscribe: wrapped.subscribe } : {}),
	};
}

function checked(guards: FieldGuard[], next: Resolver): Resolver {
	return async (source, args, context, info) => {
		for (const { check } of guards) await check(source, args, context);
		return next(source, args, context, info);
	};
}
