---
'@nxgt/shared-mongo': patch
---

Type-check cleanly with `skipLibCheck: false`. The three `Model` augmentations (pagination, soft delete, `ensureExists`/`requireById`) now repeat only mongoose's type parameter names, leaving defaults and heritage to mongoose, and no longer redeclare `schema`. This removes the TS2428 "All declarations of 'Model' must have identical type parameters" and TS2717 "Property 'schema' must be of type …" errors a consumer saw from `dist/types/*.d.ts` and `mongoose/types/models.d.ts`. Every augmented member keeps the same type; `Model#schema` is mongoose's own declaration, which was already the one in effect.
