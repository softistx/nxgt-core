---
"@nxgt/i18n-vue": minor
---

Accepts TypeScript 7 as well as 6: the `typescript` peer is now `^6.0.3 || ^7.0.0`, the same range in every `@nxgt/*` package, so the set installs with either and no peer conflict. The package does not use TypeScript at runtime; its built JavaScript and declarations are checked under both. Nothing changes under TypeScript 6. Checking `t()` in `.vue` templates still takes `vue-tsc`, which needs TypeScript 6; under TypeScript 7, `tsc` checks `t()` in `.ts` files.
