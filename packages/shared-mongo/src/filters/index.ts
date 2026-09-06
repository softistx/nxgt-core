/**
 * The generated-GraphQL filter DSL.
 *
 * A separate entry point (`@nxgt/shared-mongo/filters`) rather than part of the
 * package root, because it and the REST filter helpers in `../utils/filter.utils.ts`
 * share three names with incompatible meanings — most sharply
 * `buildArrayFilter`, whose default is an exact match on one side and `$in` on
 * the other. Merging them would silently change what a query matches. It also
 * carries its own `SortDirection` and `buildSort`, which mean something else
 * again from the ones in `@nxgt/shared`.
 *
 * Import from here when the filters come from a GraphQL input; import from the
 * package root when they come from REST query parameters.
 */
export * from './filter.utils';
