import { delay } from '@nxgt/shared/helpers';
import { Mutex } from 'async-mutex';
import { diff } from 'just-diff';
import { omit } from 'lodash';
import { mongoose } from '../mongoose';
import { MONGO_UTILS } from '../utils';
import { AuditModel } from './audit.model';
import type { ChangeListeningOptions } from './audit.types';

const mutex = new Mutex();

/**
 * Processes MongoDB change streams and creates audit logs based on changes.
 * @param {mongoose.mongo.ChangeStream<any, any>} changeStream - The MongoDB change stream.
 * @param {Object} options - Configuration options for the audit process.
 * @param {string[]} [options.omitFields] - Fields to omit when comparing states.
 * @param {UserPrincipal} [options.user] - The user making the changes.
 */
export function auditChanges(
	changeStream: mongoose.mongo.ChangeStream<any, any>,
	options: { omitFields?: string[]; author?: string },
) {
	options.omitFields = options.omitFields ?? [
		'_id',
		'id',
		'version',
		'createdDate',
		'lastModifiedDate',
		'createdBy',
		'lastModifiedBy',
		'__v',
	];
	changeStream.on('change', async (data) => {
		const globalId = `${data.ns.coll}/${data.documentKey._id.toHexString()}`;

		const previousSnapshot = await AuditModel.findOne({
			globalId,
		})
			.sort({ version: -1 })
			.exec();

		const stateBeforeChange = previousSnapshot?.state;

		if (['delete', 'update', 'replace'].includes(data.operationType)) {
			const doc = await mongoose.connection.db
				?.collection(data.ns.coll)
				.findOne({ _id: { $eq: data.documentKey._id } });
			const state = doc ? { ...doc, id: doc._id.toHexString() } : undefined;
			const changes =
				data.operationType === 'delete'
					? []
					: diff(
							omit(stateBeforeChange, options.omitFields ?? []),
							omit(state, options.omitFields ?? []),
						);
			await AuditModel.create({
				type: data.operationType === 'delete' ? 'TERMINAL' : 'UPDATE',
				author: options.author,
				changes,
				properties: changes.flatMap((change) => change.path.toString()),
				state: state ??
					previousSnapshot?.state ?? {
						_id: data.documentKey._id,
						id: data.documentKey._id.toHexString(),
					},
				version: (previousSnapshot?.version ?? 0) + 1,
				globalId,
			});
		} else {
			const state = data.fullDocument
				? {
						...data.fullDocument,
						id: data.fullDocument._id.toHexString(),
					}
				: undefined;

			const changes = diff({}, omit(state, options.omitFields ?? []));
			await AuditModel.create({
				type: 'INITIAL',
				author: options.author,
				changes,
				version: 0,
				properties: changes.flatMap((change) => change.path.toString()),
				state,
				globalId,
			});
		}
	});
}

/**
 * Executes a given asynchronous block of code while listening for changes in specified MongoDB models.
 * Automatically closes all change streams after execution.
 *
 * @template T
 * @param {() => Promise<T>} bloc - An asynchronous function to execute while monitoring changes.
 * @param {Object} options - Configuration options for the change listener.
 * @param {string} [options.author] - The author initiating the change listener (used for auditing purposes).
 * @param {string[]} [options.omitFields] - Fields to omit from the auditing process.
 * @param {mongoose.Model<any>[]} options.models - The Mongoose models to watch for changes.
 * @param {Mutex} [options.mutex] - An optional mutex to ensure exclusive access during execution.
 *
 * @returns {Promise<T>} - Resolves with the result of the executed block of code.
 *
 * @throws {Error} - Propagates any errors from the `bloc` function or other internal operations.
 */
export function runWithChangesListening<T>(
	bloc: () => Promise<T>,
	options: ChangeListeningOptions,
): Promise<T> {
	return (options.mutex ?? mutex).runExclusive(async () => {
		const changeStreams = options.models.map((model) =>
			model.watch(MONGO_UTILS.auditPipeline),
		);
		changeStreams.forEach((changeStream) => {
			auditChanges(changeStream, omit(options, 'models'));
		});
		try {
			return mongoose.connection.transaction(
				async () => {
					return await bloc();
				},
				{ readPreference: 'primary' },
			);
		} finally {
			await delay(1);
			for (const changeStream of changeStreams) {
				await changeStream.close();
			}
		}
	});
}

export const AUDIT_EVENT = 'AUDIT_EVENT';
