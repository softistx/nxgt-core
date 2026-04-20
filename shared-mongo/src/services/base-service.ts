import type { Principal } from '@nxgt/shared';
import { cleanObject } from '@nxgt/shared/helpers';
import { CustomException } from '@nxgt/shared-exceptions';
import type { Mutex } from 'async-mutex';
import { runWithChangesListening } from '../audit';
import { integrityRegistry } from '../integrity';
import type { HydratedDocument, Model, QueryFilter } from '../mongoose';

type InferDocType<D extends HydratedDocument<any>> =
	D extends HydratedDocument<infer T> ? T : D;

export abstract class BaseService<
	D extends HydratedDocument<any>,
	CInput = any,
	UInput = any,
> {
	protected abstract model: Model<D>;

	/**
	 * Additional models to watch in the change stream (e.g. child models
	 * that are cascade-deleted alongside the parent).
	 */
	protected extraModels: Model<any>[] = [];

	protected abstract mutex: Mutex;

	constructor(readonly principal?: Principal | null) {}

	protected get changesOptions() {
		return {
			models: [this.model, ...this.extraModels],
			author: this.principal?.name || 'system',
			mutex: this.mutex,
		};
	}

	// ─── Query ────────────────────────────────────────────────────────────────

	async find(filter: QueryFilter<D> = {}): Promise<D[]> {
		return this.model.find(filter).exec() as Promise<D[]>;
	}

	async findById(id: string): Promise<D> {
		const entity = await this.model.findById(id).exec();
		if (!entity) {
			throw CustomException.notFound({
				message: `${this.model.collection.name}.errors.not-found`,
			});
		}
		return entity as D;
	}

	// ─── Writes ───────────────────────────────────────────────────────────────

	async create(input: CInput): Promise<D> {
		const entity = await runWithChangesListening(async () => {
			await this.beforeCreate(input);

			const data = await this.buildCreateData(input);

			return this.model.create({
				...data,
				createdBy: this.principal?.name,
				lastModifiedBy: this.principal?.name,
			} as any);
		}, this.changesOptions);

		return this.findById((entity as any).id);
	}

	async update(id: string, input: UInput): Promise<D> {
		return runWithChangesListening(async () => {
			const doc = await this.findById(id);
			await this.beforeUpdate(doc, input);
			const data = await this.buildUpdateData(doc, input);

			Object.assign(
				doc as any,
				cleanObject({
					...data,
					lastModifiedBy: this.principal?.name,
				}),
			);
			return (doc as any).save();
		}, this.changesOptions);
	}

	// ─── Deletion ─────────────────────────────────────────────────────────────

	/**
	 * Deletion flow:
	 *   1. `beforeDeleteMany` hook  — custom pre-checks (outside transaction)
	 *   2. `validateDeletion`       — all integrity blockers in parallel (outside transaction)
	 *   3. `runWithChangesListening`:
	 *        a. `runCascades`       — registered cascade handlers (inside transaction)
	 *        b. `model.deleteMany`  — parent documents deleted (inside transaction)
	 */
	async deleteMany(ids: string[]): Promise<void> {
		await runWithChangesListening(async () => {
			await this.beforeDeleteMany(ids);
			await integrityRegistry.validateDeletion(this.model.name, ids);

			await integrityRegistry.runCascades(this.model.name, ids);
			return this.model.deleteMany({ _id: { $in: ids } }).exec();
		}, this.changesOptions);
	}

	async delete(id: string): Promise<void> {
		await this.deleteMany([id]);
	}

	// ─── Hooks ────────────────────────────────────────────────────────────────

	/**
	 * Override to customize the data passed to `model.create()`.
	 * Default: spread input as-is.
	 */
	protected buildCreateData(
		input: CInput,
	): Promise<Partial<InferDocType<D>>> | Partial<InferDocType<D>> {
		return input as unknown as Partial<InferDocType<D>>;
	}

	/**
	 * Override to customize the fields applied to the document during update.
	 * Default: spread input as-is.
	 */
	protected buildUpdateData(
		_doc: D,
		input: UInput,
	): Promise<Partial<InferDocType<D>>> | Partial<InferDocType<D>> {
		return input as unknown as Partial<InferDocType<D>>;
	}

	/**
	 * Called before integrity validation and the deletion transaction.
	 * Override to add pre-delete checks (e.g. status guards).
	 */
	protected async beforeDeleteMany(_ids: string[]): Promise<void> {}

	/**
	 * Called inside the create transaction, before `model.create()`.
	 * Override to add pre-create guards (e.g. uniqueness or status checks).
	 * The raw input is passed in case the check depends on it.
	 */
	protected async beforeCreate(_input: CInput): Promise<void> {}

	/**
	 * Called inside the update transaction, after `findById`, before
	 * `buildUpdateData`. Override to add pre-update guards (e.g. status locks).
	 * Receives the already-fetched document — no extra DB round-trip needed.
	 */
	protected async beforeUpdate(_doc: D, _input: UInput): Promise<void> {}
}
