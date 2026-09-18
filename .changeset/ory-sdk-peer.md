---
'@nxgt/security': major
'@nxgt/shared-hono': major
'@nxgt/shared-graphql': major
---

Take the Ory layer from `@nxgt/ory-sdk` instead of `stx-sdk`.

The code that `evaluateRequirement`, `createOry`, `OryPrincipal` and
`OryUnavailable` come from has moved to the repository that owns the Ory stack
and publishes as [`@nxgt/ory-sdk`](https://www.npmjs.com/package/@nxgt/ory-sdk).
Nothing about the behaviour changes — same functions, same wire format, same
`OryUnavailable`-is-a-503 rule.

**This is breaking because the peer changed name.** Update your own manifest:

```diff
-"stx-sdk": ">=1.1.0"
+"@nxgt/ory-sdk": ">=0.1.0"
```

`@nxgt/security` swaps it outright — it only ever used `stx-sdk/ory`.
`@nxgt/shared-hono` and `@nxgt/shared-graphql` now declare **both**, because
they still import `stx-sdk/auth` for the policy and MCP helpers. An app that
uses neither Ory integration installs neither peer, as before.

Also removed: the `oryAuth` tests for tokens minted by the edge. The edge was
deleted from the platform in September 2026 and `createOry` no longer takes an
`edge:` option, so those five tests covered a branch that does not exist.
Nothing in `src/` referenced it.
