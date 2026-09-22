# `code-reviewer` in self-learning

`softistx/self-learning` is one product in one repository: `apps/api` (GraphQL Yoga on Bun, Mongo, Redis) and `apps/ui` (React Router 8, Apollo, a **confidential OAuth2 client of Hydra**), plus a `packages/` reserved for the schema they will share. It left `nxgt-federation` on 2026-09-22 already migrated to Ory, so most of what can break here is identity: the server holds a client secret and a token set that must never reach the browser, and the UI is an SSR *shell* whose shape is deliberate and easy to "fix" into a regression. Read the root `AGENTS.md` in full first — it argues for every invariant below.

## Measure

```bash
git ls-files 'apps/*/src/**/*.ts' 'apps/*/app/**/*.ts*' | xargs wc -l | sort -n | tail -30
git ls-files 'apps/*/*.graphqls' 'apps/*/**/*.graphqls' | xargs wc -l | sort -n | tail
```

The green bar. CI runs the first four:

```bash
bun install
bun run check          # biome
bun run typecheck      # both workspaces; the UI's runs react-router typegen first
bun run build          # the UI's build is the SSR regression test
bun run --cwd apps/ui check:i18n
```

Do **not** run `bun run test` (87 specs, needs Mongo and Redis on `proxy`) or `bun run e2e` (needs a browser and a dev server). If a diff touches a service or a resolver, ask whether `test` was run; if it touches a route or the auth middleware, ask about `e2e`.

## Invariants

- **The token set never leaves the server.** `state`, the PKCE verifier and the whole `TokenSet` live in the signed httpOnly cookie built in `app/modules/auth/session.server.ts`. Any access token, refresh token or client secret that reaches a loader's return value, a `VITE_*` variable, `localStorage`, or a component prop is a finding. `grep -rn "accessToken\|clientSecret\|HYDRA_CLIENT_SECRET" apps/ui/app | grep -v '\.server\.'`
- **`/api/graphql` is the only hole in the wall, and it answers 401.** The resource route re-posts the browser's document with the Bearer attached; it must build **fresh** headers and never forward the session cookie upstream. And `requireAuth()` must keep exempting `/api/` — a redirect to another origin inside an XHR is answered by the CORS layer, not by a login screen, so the route has to answer 401 rather than 302. Measured: it returned 302 before the exemption. Report any change that drops `ANONYMOUS`'s `/api/` entry, or that adds a second path through which the browser can reach the API.
- **The API's URL is not a `VITE_` variable.** It is `SELF_LEARNING_API_URL`, read server-side. A `VITE_API_URL` appearing here means the browser is calling the API directly again, which is the shape this app was migrated *out of*. `grep -rn "VITE_" apps/ui`
- **The UI is an SSR shell on purpose.** `app/root.tsx` exports `clientLoader.hydrate = true` with a `HydrateFallback`; the route tree renders in the browser. A route that gains a server `loader` returning Apollo data is a finding: `preloadQuery` returns a `QueryRef` that cannot be serialised, so this is a crash, not a preference. Report any new server loader under `app/routes/` that touches Apollo, and any removal of the root `HydrateFallback`.
- **`MOCK_AUTH` must stay refusable.** `app/env.server.ts` has a `refine` that makes the schema **fail to parse** when `MOCK_AUTH` is set with `NODE_ENV=production`. Removing or weakening it is a finding; so is reading `MOCK_AUTH` anywhere other than `authMiddleware`. An authentication bypass is the one failure mode worth crashing over.
- **Identity comes from the principal, not from an argument.** A resolver or service that acts on behalf of the caller derives the id from `this.principal?.sub`. **This app has a documented exception** — its learner-facing mutations (`startQuizAttempt`, `submitAnswer`, `progress`, …) take a plain `userId: String!`, recorded in `apps/api/README.md` as an explicit non-goal. Do not report the existing ones; **do** report a *new* field that adds a client-supplied `userId`/`ownerId`, and report any of them losing its `@authenticated`.
- **Keto is read-only here, and there is no `@check`.** `apps/api/src/config/ory.ts` builds `createOry` with `kratosPublicUrl`, `ketoReadUrl` and `hydraAdminUrl` — no write client, no Kratos admin client. A diff that adds `createKetoWriteClient`, `createKratosClient` or `useKetoChecks` without a feature that needs it is a finding: it wires an unauthenticated write path for nobody.
- **`createMaskError(translate)` stays on `createYoga`.** Without it Yoga masks a `CustomException` and an `OryUnavailable` alike as "Unexpected error.", and a Kratos or Keto outage answers 500 instead of 503. It catches with `instanceof`, so report any change that moves a `@nxgt/shared-graphql` major without the imports that throw those classes moving in the same commit.
- **Kratos's own screens belong to kratos-ui, in `nxgt-ory`.** `ory_kratos_session` is host-only. A login, registration, recovery or settings **form** appearing in this repo is a finding; linking out to `${KRATOS_UI_URL}/settings` is the pattern.
- **Nothing publishes a port, and only the UI is routed.** `docker-compose.yaml` has no `ports:` in either profile, and `self-learning-api` has no traefik label. Report a `ports:` entry, a router for the API, or a `${TRAEFIK_ENABLE:-true}` replacing the literal `traefik.enable=true` — this machine's shell exports `false`, and the shell beats `.env` in compose interpolation.
- **`.dockerignore` is a secret boundary.** The build context is the repo root and the Dockerfile does `COPY apps ./apps`; `apps/ui/.env.local` holds the Hydra client secret. Report any change that drops `**/.env*` from `.dockerignore`, and any `ARG`-passed secret (a build arg is recorded in the image metadata).
- **`USER bun` in the `*-dev` targets.** Those containers write into the mounted host tree; as root the files land root-owned and the next host-side `typecheck` dies with `EACCES`. Report its removal.
- **`clearDatabase()` stays guarded** — `NODE_ENV=test` **and** a database name ending in `-test`. Both halves.

## Deliberate — do not report

- The **SSR shell** itself: no route loaders, `clientLoader` on the root, Apollo untouched. See the invariant above.
- The `userId` arguments on the existing learner-facing mutations (documented non-goal).
- `rxjs@^7.8.2` in `apps/ui` is **not** unused. It is a peer of `@apollo/client@4`, and without the pin `inquirer@7` wins the hoist with `rxjs@^6` and the client build fails with two dozen `[MISSING_EXPORT] "observeOn" is not exported by rxjs`.
- CI installs **without** `--frozen-lockfile`: both apps run codegen from `postinstall`.
- `packages/` holding only a `README.md`. It is a reservation, and the reason this product is one repository — see `nxgt-product`.
- The four e2e specs still `test.skip`'d: they were before the extraction.
