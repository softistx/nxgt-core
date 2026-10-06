---
'@nxgt/security': patch
'@nxgt/shared': patch
'@nxgt/shared-exceptions': patch
'@nxgt/shared-mongo': patch
---

Declarations changed when the repository's TypeScript config became strict (`exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`, `noImplicitOverride`, `noImplicitReturns`, `noUnused*`, `useDefineForClassFields`). Every change is a widening of an input type or a narrowing of an output that was always set; none breaks a consumer:

- `@nxgt/security`: `KetoRung.message`, `KetoDeps.evaluatePermissions` and `KetoDeps.subject` accept an explicit `undefined`.
- `@nxgt/shared`: `assign()` takes sources whose properties may be an explicit `undefined`, which it already skipped.
- `@nxgt/shared-exceptions`: `CustomException#debugMessage` is typed `string | null | undefined`.
- `@nxgt/shared-mongo`: every `VALIDATORS.*` result types `message` as a function, not `... | undefined`, since it was always set; the inferred schema-definition types of `audit.model` and `postal-address.model` lose a redundant `| undefined`.
