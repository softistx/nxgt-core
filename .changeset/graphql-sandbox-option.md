---
"@nxgt/shared-graphql": minor
---

`createYogaHono` takes `sandbox?: boolean`: the Apollo Sandbox page is served outside production by default, and not in production (`NODE_ENV=production`), where its route answers 404. `sandbox: true` serves it in every environment and `sandbox: false` in none. Page options (`{ endpoint, port, … }`) still configure it, and their new `enabled` decides whether it is served, with the same default. An app that serves the Sandbox in production sets `sandbox: true`, or `enabled: true` beside its options. `HonoYogaOptions` and `YogaHonoSandboxOptions` are exported.
