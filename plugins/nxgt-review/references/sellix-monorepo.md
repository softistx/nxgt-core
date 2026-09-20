# `code-reviewer` in sellix-monorepo

A private Bun monorepo of apps: `oauth`, `storex`, `bookmarks` (the Ory-native reference apps), `gateway` and `services/*`. It contains no library code. The shared `@nxgt/*` packages and `stx-sdk` are installed from npmjs, so a bug in one of them is fixed upstream in nxgt-core, and a PR here can only bump its version range. Most of the dangerous defects here cause no error: an unstyled page, a toast that never closes, a route open to anyone, a wiped database. Look for what is missing from the diff as well as what is in it.

## Measure

List the source files by size (generated code and build output excluded):

```bash
git ls-files 'apps/**/*.ts' 'apps/**/*.tsx' 'scripts/*.ts' \
  | grep -vE '/(generated|build|dist)/|\.d\.ts$' \
  | xargs wc -l | sort -rn | head -40
git ls-files 'apps/**/*.ts' 'apps/**/*.tsx' | cut -d/ -f1-3 | sort | uniq -c | sort -rn
```

AGENTS.md defines no green bar. The root `package.json` scripts and the workflow reference use this one:

```bash
bun run typecheck      # scripts/ + every workspace
bun run check          # biome
# route specs: one file at a time, from inside the app, no server running
cd apps/oauth/oauth-api && NODE_ENV=test bun --env-file=.env.test test src/modules/users/users.routes.spec.ts
```

- **Safe to run anytime:** `typecheck` and `check`.
- **Spec files: only when nothing else is running.** Check with `pgrep -f 'bun test'`, and make sure no dev server is up. The specs share one server and one MongoDB, and `--hot` reloads the server during a run.
- **Before calling a spec failure a regression:** re-run the file with the change stashed. `POST /permissions > …existing name` already fails on `develop`.
- **Check each app's own `package.json`.** A script that exists in one app may be missing from another.

## Invariants

- **App code never imports from `'mongoose'`.** Any `from 'mongoose'` under `apps/` is a finding. Import `Types`, `ObjectId` and `Connection` from `@nxgt/shared-mongo`, and build ObjectIds with `objectIdString()` / `objectIdFromString()`, not `new mongoose.mongo.ObjectId(...)`. `tsc` passes either way, but Bun's isolated install may fail to resolve the direct import. Check with `git grep -nE "from ['\"]mongoose['\"]|mongoose\.mongo\.ObjectId" -- apps`.
- **Integrity keys use `Model.modelName`, never `Model.name`.** `Model.name` is `"model"` for every model, so all blockers end up under one key. Check with `git grep -n "registerBlocker\|validateDeletion" -- apps`, then read what each passes as `model`.
- **Rules files must cover every route, and every HTTP method.**
  - In `apps/oauth/oauth-api/rules.yaml`, `apps/storex/storex-api/rules.yaml` and `apps/bookmarks/bookmarks-api/rules.yaml`, a new route with no rule is a finding (each app's `src/modules/policies/coverage.spec.ts` also catches it).
  - A collection root that answers `QUERY` needs a `QUERY:` entry that mirrors its `GET` rule (or its `POST` rule if there is no `GET`). In `apps/gateway/security/auth.yaml`, which defaults to open, a missing entry serves the collection to anonymous callers.
  - Deleting the `public: true` entries for `/auth/*` or `/oauth/*` is a finding.
  - Order matters because the first match wins: `/files` must come before `/files/:id`.
- **Ory-native APIs never read an identity from a request header.** No gateway sits in front of them, so nothing strips inbound `X-User-*`.
  - Under `apps/bookmarks/`, using `currentUser()` or reading `X-User-*` is a finding.
  - `policyGuard` reads `ctx.get('X-Claims')`, never headers.
  - An Ory outage must return 503, never "anonymous" or "denied".
- **Keto and Kratos write/admin clients are imported in exactly one place.**
  - `stx-sdk/ory/tuples` may only be imported in `src/ory/tuples.ts`. `stx-sdk/ory/admin` may only be imported in `src/config/ory.ts` or the console's server module. Biome enforces both (`biome.json` `noRestrictedImports`), so widening that rule's `includes` is also a finding.
  - Looking up an email with a bare `kratosAdmin.GET('/admin/identities')` instead of `identities.findByEmail` is a finding: a Kratos outage then becomes a 404.
  - Hand-copied flow plumbing (`call`, `forward`, `carry`) is a finding.
- **Each app authorises objects one way: `ketoCheck()` on routes, or a `keto` list in its rules file.** An app that uses both is a finding. The one exception is `apps/bookmarks/bookmarks-api`.
- **An action read by a fetcher answers with data, never with `redirect()` on success.** Otherwise the loading toast (`duration: Infinity`) never closes.
  - For any change that opens `toasts.loading()`, check three exits: success, failure, and unmount before the request settles.
  - Waiting for `state === 'idle'` while the action still redirects does not fix it.
  - Hand-written toast handling where `useMutationCallbacks` would do is a finding.
- **Auth in the UIs comes only from `stx-sdk/oauth/react`.**
  - Re-creating `tokenContext`, `userContext` or `oauthStateContext` is a finding. They must be re-exported from `stx-sdk/oauth/react`, never re-created.
  - `auth` middleware anywhere other than the root route is a finding.
  - Local session, refresh, PKCE or guard code is a finding.
  - `vite.config.ts` must keep `optimizeDeps.exclude: ['stx-sdk']` and `resolve.dedupe: ['react','react-dom','react-router']`.
- **UI styling and icons are wired per app.** `app/app.css` must keep `@source "../node_modules/@nxgt/material/";`. Without it the page renders unstyled and nothing logs an error. Sprites live under the app's own `public/assets/icons/sprites/`.
- **Search bodies carry no `sort`.** `cursorPaginate` orders by `_id` only. Adding `sort` back without compound cursors is a finding. Search routes keep `.strict()`. `acceptQuery()` goes on the `QUERY` registration only, and `POST …/search` and `QUERY` share a single `createHandlers` chain.
- **Env and database safety.**
  - Never write out `MONGODB_URI` (it is composed from `$MONGO_*`), and never `export` it.
  - `${VAR:-…}` / `${VAR:?…}` belong only in files Compose reads. A bare `${VAR}` in `docker/shared.env` is a finding.
  - A new variable must update the root `.env.example` in the same change.
  - A variable moved to the system must get a Zod default in the same commit, unless it is a secret or Mongo credential that must never have a fallback.
  - A local `clearDatabase` copy, or loosening its `NODE_ENV=test` + `-test` check, is a finding.
- **Docker images carry no secrets and no `.env`.**
  - An `ARG` for `MONGODB_URI`, `JWT_SECRET`, `*_PASSWORD` or `DEFAULT_CLIENT_SECRET` is a finding, as is any `COPY` of a `.env`.
  - A new `VITE_*` needs three edits together: `env.ts`, the Dockerfile's `ARG`+`ENV` pair, and compose `build.args`.
  - SSR images copy the build output to `./build`. Flattening `build/` is a finding.

## Deliberate — do not report

- `bookmarks-api` using both `ketoCheck()` and a `keto` rules list. It is the test bed for comparing the two.
- `secured()` still on routes that the rules file also covers. It stays as a safety net during the migration.
- `/api/projects` in storex-api has no `secured()` and relies on `rules.yaml` alone.
- The UIs still send `POST …/search` rather than `QUERY` (workbox cannot route `QUERY`).
- `codegen` producing no generated-type diff after adding a `query:` operation. That is expected.
- `currentUser()` trusting `X-User-*` in `apps/services/*`. This is only acceptable because the gateway fronts them.
- Font Awesome Pro sprite sheets committed under each app's `public/`.
- `useMutationCallbacks` duplicated in each UI, and route-protection wording repeated across the three `rules.yaml` files.
- The legacy root `docker-compose.yml` and `docker/Dockerfile`, and `.dockerignore` not excluding `build/` / `dist/`. They stay until storex and kratos-ui migrate.
- The `set -e` loop in `docker/base.Dockerfile`.
- The `copy:env` script in `apps/oauth/oauth`: it is dead code, but it must stay out of Docker builds.

## Layering and packaging

- **No `packages/` directory and no changesets.** The root is `private: true`. All `@nxgt/*`, `@nxgt/material`, `@nxgt/map` and `stx-sdk` (`^1.1.0`) come from public npmjs with plain version ranges. Any `link:` in a manifest is a finding.
- **A fix to a shared package lands and is released in nxgt-core first.** Here it is only a range bump in the consuming app's `package.json`, in the same branch as the code that needs it. A PR that relies on an unreleased version is not reviewable yet. When behaviour and source disagree, check the installed version in `node_modules/@nxgt/…`.
- **Reusable UI belongs in `@nxgt/material`.** A component that would compile with only React, Tailwind and material's own primitives goes there: PR, release, then a range bump here. A second copy in a second app is a finding.
- **OpenAPI contract changes land with their codegen in the same slice.**
  - Specs declare `openapi: 3.2.0`, and each app pins `@redocly/cli` at `^2.48.0`.
  - If `stx-sdk` mirrors the bundle (`oauth`, `storex`, `data`, `locations`), it needs a resync and a release before a client app sees the change.
  - Route specs call `QUERY` through `asQueryMethod` from `@nxgt/shared-hono`.
- **Automation is `.ts` under `scripts/`, run by Bun with Bun Shell.** A new `.sh` file is a finding.
- **Docker: one image per app, compose file per app group** (`apps/oauth/docker-compose.yaml`, `apps/bookmarks/docker-compose.yaml`).
  - The build context is the repo root.
  - Containers listen on `APP_PORT` (default 3000).
  - Services join the external `proxy` network.
  - Traefik variables are named `HOST` / `TRAEFIK_*`, the same names as nxgt-docker and nxgt-ory.
- **The Ory stack lives in `nxgt-ory`.** This repo reaches it only through runtime URLs and the `proxy` network, never through imports.
- **Keep conventions in step with `nxgt-federation`.** Auth changes in `stx-sdk/oauth/react` affect seven apps across the two repos.
