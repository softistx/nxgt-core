import type { Catalogue } from './types';

type Branch = Record<string, unknown>;

function isBranch(value: unknown): value is Branch {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Copies `source` into `target`, which is always an object this module made,
 * never one of the caller's: a branch in `source` is merged into a fresh
 * object, so the result shares nothing with its inputs.
 */
function mergeInto(target: Branch, source: Branch): Branch {
	for (const key of Object.keys(source)) {
		// A catalogue read from a database is data: `__proto__` must not
		// reach the result's prototype.
		if (key === '__proto__') continue;
		const value = source[key];
		if (value === undefined || value === null) continue;
		if (isBranch(value)) {
			const current = Object.hasOwn(target, key) ? target[key] : undefined;
			target[key] = mergeInto(isBranch(current) ? current : {}, value);
		} else {
			target[key] = value;
		}
	}
	return target;
}

/**
 * Merges catalogues deeply, the last one winning leaf by leaf:
 * `mergeCatalogues(packageDefaults, appOverrides, databaseOverrides)`.
 *
 * A spread replaces whole branches — `{ ...resources.en, validation }` drops
 * every package key under `validation` the app did not repeat. Here a branch
 * is merged key by key; a leaf (a message) replaces what was there, branch
 * included. `undefined` and `null` are skipped, so an override never erases
 * a message. The inputs are not changed.
 *
 * The result is typed as `base`: an override can add keys, which the type
 * does not list.
 */
export function mergeCatalogues<B extends Catalogue>(
	base: B,
	...overrides: readonly Catalogue[]
): B {
	const result: Branch = {};
	for (const catalogue of [base, ...overrides]) {
		if (!isBranch(catalogue)) {
			throw new TypeError(
				`@nxgt/i18n: mergeCatalogues takes catalogue objects, got ${catalogue === null ? 'null' : typeof catalogue}`,
			);
		}
		mergeInto(result, catalogue);
	}
	return result as B;
}
