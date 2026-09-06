import type { Job } from 'bullmq';

/**
 * What an event records about whoever caused it.
 *
 * Deliberately not `Principal` from `@nxgt/shared`: a job queue has no
 * business knowing the shape of an authenticated caller, and importing it made
 * `@nxgt/shared-events` and `@nxgt/shared` depend on each other — a cycle a
 * workspace tolerates and published versions cannot resolve. Every consumer
 * reads `name` and nothing else (`job.data.user?.name ?? 'system'`), so this
 * is the whole contract; both repos' `Principal` shapes satisfy it.
 */
export type EventActor = {
	name?: string;
	sub?: string;
	username?: string;
};

export type ExtractDataType<DataTypeOrJob, Default> =
	DataTypeOrJob extends Job<infer D, any, any> ? D : Default;
export type ExtractResultType<DataTypeOrJob, Default> =
	DataTypeOrJob extends Job<any, infer R, any> ? R : Default;
export type ExtractNameType<DataTypeOrJob, Default extends string> =
	DataTypeOrJob extends Job<any, any, infer N> ? N : Default;

export type EventPayload<T> = {
	data: T;
	user?: EventActor | null;
};
