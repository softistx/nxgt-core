---
'@nxgt/shared-graphql': patch
---

Ship `@types/graphql-upload` as a dependency. The built `dist/upload.d.ts` imports `graphql-upload/graphqlUploadExpress.mjs`, and `graphql-upload` 18 ships no types of its own, so the types were only a devDependency: a consumer with `skipLibCheck: false` got TS7016 and with `skipLibCheck: true` got the upload middleware as `any`.
