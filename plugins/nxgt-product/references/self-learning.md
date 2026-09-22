# `lay-out-a-product-repository` in self-learning

**This is the worked example.** `softistx/self-learning` was created on
2026-09-22 out of `nxgt-federation`'s `apps/self-learning/`, and it is the
repository to copy from for every rule in the skill. It went out **already
migrated to Ory** (federation PR #215), so it is also the reference for what the
migration of an Apollo SPA to a confidential OAuth2 client looks like when it is
finished.

135 commits survived `git filter-repo`. `git log apps/api` predates the
repository.

## What the layout does

- Root manifest `private`, workspaces `apps/*` and `packages/*`, `--filter '*'`
  for `dev`/`build`/`codegen`/`typecheck`, `--cwd apps/api test` and
  `--cwd apps/ui e2e` for the two that live in one app each.
- `overrides` pins `graphql: ~16.14.2` and `typescript: ~6.0.3`. Workspaces are
  `@self-learning/api` and `@self-learning/ui`.
- `packages/` holds only a `README.md`, reserving `@self-learning/schema` for the
  `.graphqls` files `apps/api/src/**` owns and `apps/ui/app/graphql/schema.graphqls`
  copies today. Read it before proposing anything about that duplication.
- `docker-compose.yaml`: four services (api and ui × `prod` and `dev` profiles),
  `name: ${STACK_PREFIX:+${STACK_PREFIX}-}self-learning`, no published port, and
  **only the UI has a traefik router**.
- `docker/Dockerfile`: `oven/bun:1`, `base` → `api`, `ui`, `api-dev`, `ui-dev`,
  one `bun install --frozen-lockfile`, `USER bun` last in each target.
- CI on `ubuntu-latest`: install (no `--frozen-lockfile`, both apps codegen from
  `postinstall`), biome, typecheck, build, `check:i18n`.

## The identity shape, which is why the API has no router

`apps/ui` is a **confidential OAuth2 client of Hydra** — shape (b) of
`nxgt-ory-app`'s `create-ory-native-ui`. `state`, the PKCE verifier and the whole
token set live in a signed httpOnly cookie. `apps/api` resolves the caller with
`@nxgt/ory-sdk`'s `useOryAuth`, reaching Kratos, Keto (read side only) and Hydra
**by container name**, because `nxgt-ory` publishes no port.

The browser never learns the API's address: it posts GraphQL to the UI's own
`/api/graphql`, a resource route that re-posts the document with the visitor's
Bearer attached. That is why the variable is `SELF_LEARNING_API_URL` and not
`VITE_API_URL`, and why `self-learning-api` has no hostname at all.

Kratos's identity screens are **kratos-ui's, in `nxgt-ory`**.
`ory_kratos_session` is host-only, so the app holding it owns login, registration
and settings; the user menu here links out to its `/settings`.

## The UI is an SSR *shell* — do not "finish" the migration

`apps/ui/app/root.tsx` exports `clientLoader.hydrate = true` with a
`HydrateFallback`. The server renders the document shell; the whole route tree
renders in the browser, with Apollo's cache, `useQuery` and `preloadQuery` exactly
as they were when this app was an SPA. The server exists for three things a
browser must not do: hold the client secret, hold the token set, and put the
Bearer on a request.

Giving routes server loaders breaks it: `preloadQuery` returns a `QueryRef` that
cannot be serialised. The shell is the design, and it is what made a large Apollo
app migratable without touching a single call site.

Two measured details that came with it:

- **Bun's `react-dom/server` has no `renderToPipeableStream`.** React Router's
  default Node server entry 500s every document request. `app/entry.server.tsx`
  uses `renderToReadableStream`.
- **`requireAuth()` exempts `/api/`, and that is not a convenience.** A redirect to
  another origin inside an XHR is answered by the CORS layer, not by a login
  screen, so the GraphQL resource route must answer **401**. Measured against the
  built server: it returned 302 before the exemption.

## `MOCK_AUTH` and the checks CI cannot run

`MOCK_AUTH` makes `authMiddleware` invent a signed-in visitor, because the
Playwright suite mocks the network **inside the browser** (`@msw/playwright`) and
cannot answer a question the server asks. `app/env.server.ts` **refuses to parse**
if it is set with `NODE_ENV=production` — keep that refine.

`smoke.spec.ts` asserts the greeting text, which covers server session → root
loader → hydrated client in one line, so the other specs fail loudly rather than
mysteriously when the seam breaks. `bun run test` (87 specs, Mongo and Redis on
`proxy`) and `bun run e2e` (a browser) are both local-only and named as such in
`AGENTS.md`.

## Still open

`@self-learning/schema` is reserved, not written: the schema is still two files
that must agree. And `apps/api`'s own README still describes the app as it was
under `apps/self-learning/` in places — worth fixing when you are next in it.
