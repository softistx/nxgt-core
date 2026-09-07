---
'@nxgt/shared-hono': major
---

`useOry` is now `oryChecks`.

The middleware that mounts the per-request Keto answer cache was named after
the Yoga plugin it mirrors, `useKetoChecks`. That prefix is React's, and
Biome's `rules-of-hooks` fires on `useOry(ory)` in an app's `src/index.ts` —
in **every** consumer, since it is called at module scope where the app is
assembled. The first app to adopt it hit that immediately.

`use` is the Hono method you pass a middleware to, not part of a middleware's
name: this package's others are `oryAuth`, `secured`, `acceptQuery`. So:

```ts
app.use('*', oryAuth(ory), oryChecks(ory), servicesProvider());
```

which also reads as the pair it is. `useKetoChecks` in `@nxgt/shared-graphql`
keeps its name, because on the Yoga side `use*` genuinely is the plugin
convention.

Major, though `oryChecks` shipped four hours ago as `useOry` in 1.2.0 and has
no consumer on the registry yet. Renaming an export is a break whether or not
anyone has taken the break, and a version number that says otherwise is worse
than a major nobody needs.
