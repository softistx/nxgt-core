---
'@nxgt/shared-mongo': patch
---

Fix the soft-delete type augmentation referring to a global `mongodb.` namespace that was never imported. A consumer with `skipLibCheck: false` got TS2833 and TS2503, and with `skipLibCheck: true` those types silently became `any`. It now imports `mongo` from mongoose as a type, and uses mongoose's own `QueryOptions` where it named the non-existent `MongooseQueryOptions`.
