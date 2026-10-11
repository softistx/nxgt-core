---
"@nxgt/shared-graphql": minor
---

`createYogaHono` takes `sandbox?: boolean`: the Apollo Sandbox page is served by default only when `NODE_ENV` is explicitly `development` or `test` (read when `createYogaHono` is called); with `NODE_ENV` unset, `production` or anything else its route answers 404. A dev setup with `NODE_ENV` unset must set `NODE_ENV=development` or pass `sandbox: true`. `sandbox: true` serves it in every environment and `sandbox: false` in none. Page options (`{ endpoint, port, … }`) still configure it, and their new `enabled` decides whether it is served, with the same default. `HonoYogaOptions` and `YogaHonoSandboxOptions` are exported. Yoga's own GraphiQL at `/graphql` is not controlled by `createYogaHono`: pass `createYoga({ graphiql: false })` to turn it off.
