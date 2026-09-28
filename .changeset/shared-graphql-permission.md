---
'@nxgt/shared-graphql': minor
---

`@permission(name, type, id, onDeny, message)` — one Keto question per directive, repeated for AND — answered by `useKetoChecks` alongside `@check`, in declaration order across both; `@check` is deprecated in its favour and keeps working. `id` accepts `parent.<path>` as well as `args.<path>` and `source.<path>`.

More is refused when the schema is built, as a `TypeError` naming `Type.field`: an `args.<name>` the field does not declare, a namespace outside `useKetoChecks(ory, { namespaces })` when given, and a guard on an interface field, which no resolver runs through.

New: `requireUser(ctx)`, `can(ctx, { name, type, id })` (through the per-request memo; an outage throws, never answers `false`), the `OryGraphQLContext` type, `isOryUnavailable`, and the directive SDL as strings — `PERMISSION_DIRECTIVE_SDL`, `CHECK_DIRECTIVE_SDL`, `KETO_DIRECTIVES_SDL`.

`graphql` moves from `dependencies` to a peer, `^16.4.2 || ^17.0.0`, and the suite runs on both majors: on graphql 17 a `@check` term without an explicit `id` used to refuse the schema.

Fixes: `createFormatError` answers an Ory outage `SERVICE_UNAVAILABLE` rather than an internal error; both it and `createMaskError` recognise an `OryUnavailable` from a second copy of `@nxgt/ory-sdk`; and `createMaskError` masks a plain `Error` a resolver threw, as Yoga's default does, instead of passing its message to the client.
