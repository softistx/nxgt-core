---
'@nxgt/shared-graphql': minor
'@nxgt/shared-hono': minor
---

Let a check word its refusal like the layer beneath it.

`@check` and `ketoCheck` take a `message` — the i18n key a denial carries —
falling back to the shared `errors.not-found` and
`errors.insufficient-permissions` as before.

This is not cosmetic. A field or route guarded by one of these is guarded
**twice**: once declaratively, and again by the `require<M>Access` its service
calls, because the service is reachable from places the schema is not. Both
answer 404 for a caller who may not see the object. If they word that 404
differently — "Could not find the requested resource." from the directive,
"Note not found." from the service — the wording alone tells the caller which
layer spoke, and therefore whether the object exists.

That is the exact distinction `NOT_FOUND` is there to hide, and it appeared the
first time a real API adopted the directive.
