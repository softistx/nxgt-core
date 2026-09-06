import {
	type Processor,
	Queue,
	QueueEvents,
	type QueueEventsOptions,
	type QueueOptions,
	Worker,
	type WorkerOptions,
} from 'bullmq';
import type {
	ExtractDataType,
	ExtractNameType,
	ExtractResultType,
} from './events.types';

export function createWorker<
	DataType = any,
	ResultType = any,
	NameType extends string = string,
>(
	name: string,
	processor:
		| string
		| URL
		| null
		| Processor<DataType, ResultType, NameType> = null,
	opts: WorkerOptions = { connection: { url: 'redis://localhost:6379' } },
) {
	return new Worker<DataType, ResultType, NameType>(name, processor, {
		...opts,
		removeOnComplete: opts.removeOnComplete ?? { count: 1000 },
		removeOnFail: opts.removeOnFail ?? { count: 5000 },
	});
}

export function createQueue<
	DataTypeOrJob = any,
	DefaultResultType = any,
	DefaultNameType extends string = string,
	DataType = ExtractDataType<DataTypeOrJob, DataTypeOrJob>,
	ResultType = ExtractResultType<DataTypeOrJob, DefaultResultType>,
	NameType extends string = ExtractNameType<DataTypeOrJob, DefaultNameType>,
>(name: string, opts?: QueueOptions) {
	return new Queue<
		DataTypeOrJob,
		DefaultResultType,
		DefaultNameType,
		DataType,
		ResultType,
		NameType
	>(name, opts);
}

export function createQueueEvents(name: string, opts?: QueueEventsOptions) {
	return new QueueEvents(name, opts);
}
