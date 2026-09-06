/**
 * Sort building lives in `@nxgt/shared`, one layer down, because it is plain
 * object work with no Mongoose in it. Re-exported here because that is where
 * sellix-monorepo imported it from.
 *
 * `SortOrder` is deliberately not re-exported: Mongoose exports a type of that
 * name and this package re-exports Mongoose wholesale, so forwarding ours too
 * makes the root ambiguous and `tsc` drops both. Import `SortOrder` from
 * `@nxgt/shared`; `SortDirection` here is the same enum.
 */
export { buildSort, SortDirection, type SortField } from '@nxgt/shared/helpers';
