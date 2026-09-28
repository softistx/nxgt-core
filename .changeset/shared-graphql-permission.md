---
'@nxgt/shared-graphql': minor
---

`@permission(name, type, id, onDeny, message)` — one Keto question per directive, repeated for AND — answered by `useKetoChecks` alongside `@check`, in declaration order across both; `@check` is deprecated in its favour and keeps working. `id` accepts `parent.<path>` as well as `args.<path>` and `source.<path>`.

More is refused when the schema is built, as a `TypeError` naming `Type.field`: an `args.<name>` the field does not declare, a namespace outside `useKetoChecks(ory, { namespaces })` when given, and a guard on an interface field, which no resolver runs through. On a `@check` the undeclared argument and the interface field are logged as warnings instead, so every schema that booted on 2.0 still boots. `@permission` is read only when its declaration has `name` and `type`, so a schema's own `@permission` of another shape is left alone; `@permission` and `PermissionDenial` are now names this package's `graphql/` ships.

New: `requireUser(ctx)`, `can(ctx, { name, type, id })` (through the per-request memo; an outage throws, never answers `false`), the `OryGraphQLContext` type, `isOryUnavailable`, and the directive SDL as strings — `PERMISSION_DIRECTIVE_SDL`, `CHECK_DIRECTIVE_SDL`, `KETO_DIRECTIVES_SDL`.

`graphql` moves from `dependencies` to a peer, `^16.4.2 || ^17.0.0`, and the suite runs on both majors: on graphql 17 a `@check` term without an explicit `id` used to refuse the schema.

Fixes: `createFormatError` answers an Ory outage `SERVICE_UNAVAILABLE` rather than an internal error; both it and `createMaskError` recognise an `OryUnavailable` from a second copy of `@nxgt/ory-sdk`; and `createMaskError` masks a plain `Error` a resolver threw, as Yoga's default does, instead of passing its message to the client — a client that displayed those messages now sees `Unexpected error.`; throw a `CustomException` or a `GraphQLError` for a message meant for the caller.
