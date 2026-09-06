import {
	AUDIT_EVENT,
	type Audit,
	type AuditService,
	CommitType,
} from '@nxgt/shared-mongo';
import { withFilter } from 'graphql-subscriptions';

/**
 * Minimal structural shape of the app's pubsub instance. Kept structural so
 * this factory does not couple to a specific `graphql-yoga` `PubSub<...>`
 * instantiation.
 */
export type ChangeResolversPubSub = {
	subscribe: (event: string) => any;
};

/**
 * Minimal structural shape of the context every subgraph builds: an
 * `AuditService` under `services.audit`, plus the module's own CRUD service
 * exposing `findById`.
 */
export type ChangeResolversContext = {
	services: {
		audit: AuditService;
		[key: string]: any;
	};
};

export type CreateChangeResolversConfig = {
	/**
	 * Singular camelCase entity name used to build the resolver field names:
	 * `bed` -> `bedChanges`, `bedChangesById`, `bedChanged`.
	 */
	entity: string;
	/**
	 * Mongo collection name, i.e. `BedModel.collection.collectionName`.
	 */
	collection: string;
	/**
	 * Key of the module's CRUD service on `context.services`, i.e. `beds`.
	 */
	service: string;
	/**
	 * The app's pubsub instance, or a getter returning it. Prefer the getter
	 * form (`() => pubsub`) when the app can re-create its pubsub at runtime,
	 * so the subscription always resolves against the current instance.
	 */
	pubsub: ChangeResolversPubSub | (() => ChangeResolversPubSub);
};

export type ChangeResolvers = {
	Query: Record<string, any>;
	Subscription: Record<string, any>;
};

/**
 * Builds the audit change-stream resolver block that is otherwise repeated
 * verbatim in every module's `*.resolver.ts`: the two paginated `Changes`
 * queries and the `Changed` subscription.
 *
 * ```ts
 * const changes = createChangeResolvers({
 *   entity: 'bed',
 *   collection: BedModel.collection.collectionName,
 *   service: 'beds',
 *   pubsub: () => pubsub,
 * });
 *
 * export const beds: Resolvers = {
 *   Query: { bed: ..., beds: ..., ...changes.Query },
 *   Subscription: { ...changes.Subscription },
 * };
 * ```
 */
export function createChangeResolvers(
	config: CreateChangeResolversConfig,
): ChangeResolvers {
	const { entity, collection, service, pubsub } = config;

	const resolvePubSub = () =>
		typeof pubsub === 'function' ? pubsub() : pubsub;

	return {
		Query: {
			[`${entity}Changes`]: async (
				_parent: unknown,
				args: any,
				context: ChangeResolversContext,
			) =>
				context.services.audit.findChangesPaginatedByCollection(
					collection,
					args,
				),
			[`${entity}ChangesById`]: async (
				_parent: unknown,
				args: any,
				context: ChangeResolversContext,
			) =>
				context.services.audit.findChangesPaginatedByCollectionAndOid(
					args.id,
					collection,
					args,
				),
		},
		Subscription: {
			[`${entity}Changed`]: {
				resolve: async (
					payload: Audit,
					_args: any,
					context: ChangeResolversContext,
				) => ({
					id: context.services.audit.extractId(payload),
					data:
						payload.type !== CommitType.TERMINAL
							? await context.services[service].findById(payload.state._id)
							: null,
					type: payload.type,
				}),
				subscribe: withFilter(
					() => resolvePubSub().subscribe(AUDIT_EVENT),
					(payload: any, _variables: any, context?: ChangeResolversContext) =>
						context
							? context.services.audit.matches(payload, { collection })
							: false,
				),
			},
		},
	};
}
