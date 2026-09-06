import type { LocaleKey } from '@nxgt/i18n';
import { CustomException } from '@nxgt/shared-exceptions';
import type {
	BlockerOption,
	CascadeOption,
	RegisterBlockerOptions,
	RegisterCascadeOptions,
} from './integrity.types';

export class IntegrityRegistry {
	private blockers = new Map<string, BlockerOption[]>();
	private cascades = new Map<string, CascadeOption[]>();

	/**
	 * Register a check that blocks deletion of a target model.
	 * Safe to call multiple times — deduplicated by `id`.
	 *
	 * @param options.id        - Unique identifier for this blocker
	 * @param options.model     - Mongoose model name to guard (e.g. `RoleModel.name`)
	 * @param options.errorCode - i18n key thrown when the blocker is triggered
	 * @param options.blocker   - Function returning the count of referencing documents
	 */
	registerBlocker(options: RegisterBlockerOptions) {
		const { id, model, errorCode, blocker } = options;
		const current = this.blockers.get(model) ?? [];
		if (current.some((it) => it.id === id)) return;
		current.push({ id, fn: blocker, errorCode });
		this.blockers.set(model, current);
	}

	/**
	 * Register a cascade cleanup executed **inside** the deletion transaction.
	 * Safe to call multiple times — deduplicated by `id`.
	 *
	 * @param options.id      - Unique identifier for this cascade
	 * @param options.model   - Mongoose model name of the parent being deleted
	 * @param options.cascade - Cleanup function (runs inside MongoDB transaction)
	 */
	registerCascade(options: RegisterCascadeOptions) {
		const { id, model, cascade } = options;
		const current = this.cascades.get(model) ?? [];
		if (current.some((it) => it.id === id)) return;
		current.push({ id, fn: cascade });
		this.cascades.set(model, current);
	}

	/**
	 * Run all registered blockers for a model in parallel and throw if any
	 * referencing documents are found. All failing constraints are collected
	 * before throwing so the caller sees the full picture at once.
	 */
	async validateDeletion(model: string, ids: string[]): Promise<void> {
		const collectionBlockers = this.blockers.get(model) ?? [];

		const results = await Promise.all(
			collectionBlockers.map(async ({ fn, errorCode }) => {
				const count = await fn(ids);
				return count > 0 ? errorCode : null;
			}),
		);

		const failures = results.filter(Boolean) as string[];
		if (failures.length > 0) {
			throw CustomException.conflict({
				message: failures[0] as LocaleKey,
				options: { ids, blockedBy: failures },
			});
		}
	}

	/**
	 * Execute all registered cascade handlers for a model in parallel.
	 * Called inside `runWithChangesListening` so everything runs within
	 * the same MongoDB transaction.
	 */
	async runCascades(model: string, ids: string[]): Promise<void> {
		const handlers = this.cascades.get(model) ?? [];
		await Promise.all(handlers.map(({ fn }) => fn(ids)));
	}
}

export const integrityRegistry = new IntegrityRegistry();
