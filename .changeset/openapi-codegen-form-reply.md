---
'@nxgt/openapi-codegen': patch
---

`ClientOperations` types a form reply's `data` as `FormData`, which is what a client reads from it. It was typed as the schema's object, whose fields a form only carries as text.
