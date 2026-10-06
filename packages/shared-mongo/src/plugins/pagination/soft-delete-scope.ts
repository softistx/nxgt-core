/**
 * The deprecated spelling of `'WithDeleted'`. It is still accepted and the
 * paginators read it as `'WithDeleted'`; it will be removed in a major release.
 *
 * TypeScript reports a deprecation on this type's name only: a `'WidthDeleted'`
 * literal passed as `deleted` is accepted, not flagged by editors.
 *
 * @deprecated Use `'WithDeleted'`.
 */
export type WidthDeleted = 'WidthDeleted';

/**
 * Which documents a paginator reads on a schema using the soft-delete plugin:
 * omitted for those not deleted, `'Deleted'` for the deleted ones only,
 * `'WithDeleted'` for all of them. `'WidthDeleted'` is the deprecated spelling
 * of `'WithDeleted'` (see {@link WidthDeleted}).
 */
export type SoftDeleteScope = 'Deleted' | 'WithDeleted' | WidthDeleted;

/**
 * The suffix of the soft-delete statics a paginator reads through —
 * `find${suffix}`, `countDocuments${suffix}`. The deprecated `'WidthDeleted'`
 * maps to `'WithDeleted'`: taken literally it named `findWidthDeleted`, which
 * does not exist, and the paginator fell back to `find` — excluding exactly
 * the deleted documents it was asked to include.
 */
export function softDeleteSuffix(
	deleted: SoftDeleteScope | undefined,
): '' | 'Deleted' | 'WithDeleted' {
	return deleted === 'WidthDeleted' ? 'WithDeleted' : (deleted ?? '');
}
