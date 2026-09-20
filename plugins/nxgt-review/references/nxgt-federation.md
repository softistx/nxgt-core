# `code-reviewer` in nxgt-federation

nxgt-federation is a Bun workspace. It holds Federation 2.6 subgraphs (`apps/services/{platform,health}`), the gateway (`apps/supergraph/`), standalone GraphQL APIs (`apps/<id>/<id>-api`), React Router UIs (`apps/<id>/<id>-ui`) and one MCP app (`apps/mcp/graphql-executor`). It has no `packages/`: every `@nxgt/*` library comes from npmjs, and auth comes from `stx-sdk`. The costly mistakes here fail silently: an env var that resolves to the wrong database, a context object created twice, a toast that never closes, Tailwind classes that never render. A reviewer has to look for missing lines as well as wrong ones.

## Measure

List source files by size. Generated code (`**/generated`) is gitignored, so `git ls-files` already leaves it out.

```bash
git ls-files 'apps/**/*.ts' 'apps/**/*.tsx' 'scripts/*.ts' \
  | grep -vE '/mocks/|\.spec\.ts$' | xargs wc -l | sort -rn | head -40
git ls-files 'apps/**/*.graphqls' | xargs wc -l | sort -rn | head -20
git ls-files '*.spec.ts' | wc -l   # specs are *.spec.ts, never *.test.ts
```

The green bar, as AGENTS.md states it:

```bash
bun run check        # Biome
bun run typecheck    # scripts/tsconfig.json, then every workspace
cd apps/supergraph && bun rover:compose   # GraphQL changes must compose
cd apps/<app> && NODE_ENV=test bun test src   # always from inside the app directory
cd apps/<id>/<id>-ui && bunx playwright test --project=chromium
```

- **Safe to run:** `check`, `typecheck` and `rover:compose`.
- **Ask first:** `bun test`. It writes to Mongo. Never run it from the repo root: Bun loads `.env.test` from the working directory, so a root run reaches whatever `MONGODB_URI` the shell supplies. That has been a production database.
- **Known flaky:** whole-app runs have cross-file interference, so establish a baseline before blaming a change. Running Playwright across all browser projects fails on an unmodified `develop`, so `--project=chromium` is the gate.

## Invariants

- **App code never imports from `mongoose`.** `Types`, `ObjectId`, `Connection` and the like come from `@nxgt/shared-mongo`. ObjectId strings are built with `objectIdString()` / `objectIdFromString()`, never `new mongoose.mongo.ObjectId`. Under Bun's isolated linker, a direct import depends on a hoist that is not guaranteed. Check with `grep -rnE "from ['\"]mongoose['\"]" apps --include=*.ts --exclude-dir=node_modules`, which should return nothing.
- **Integrity keys use `Model.modelName`, never `Model.name`.** Mongoose sets `.name` to `"model"` for every model, so one wrong key makes deleting anything run every blocker in the process. Any `registerBlocker` or `registerCascade` in a `*.integrity.ts` that uses `.name` is a finding.
- **`clearDatabase` comes only from `@nxgt/shared-mongo`.** Each `src/config/tests.config.ts` re-exports it. A local copy, or a weakened guard (it needs both `NODE_ENV=test` and a database name ending in `-test`), is a finding. That guard once stood between a test run and a production database.
- **`MONGODB_URI` is always built from its parts.** An app's `.env.*` writes `mongodb://$MONGO_USER:$MONGO_PASSWORD@$MONGO_HOSTS/<db>?...` and owns only `<db>`. Report any of these:
  - a literal host or credentials in that line
  - an `export MONGODB_URI` anywhere
  - a `src/env.ts` default that points at a `-test` database
- **Moving a variable to the system environment needs a working default in the same commit.** The app's Zod schema must still produce the dev value, except for values that must never fall back (`SESSION_SECRET`, the Mongo credentials). Two other findings belong here:
  - `${VAR:-x}` or `${VAR:?}` in any file Bun loads. Bun keeps the literal text.
  - a bare `${VAR}` in `docker/shared.env`. It becomes `''`, which slips past `.default()`.
- **Committed files hold no real secret.** Report any committed bare `<app>/.env`, a real value in `.env.development`/`.env.test`/`docker/shared.env`, or a `VITE_*` added to `docker/shared.env`.
- **UI auth comes only from `stx-sdk/oauth/react`.** Report any of these:
  - `tokenContext`, `userContext` or `oauthStateContext` created locally rather than re-exported. A second instance matches nothing, which means a lockout or a bypass.
  - the `auth` middleware on any route other than the root
  - `requireProfile()` placed under `routes/profile`
  - `export *` in `app/routes/profile/{profile,edit}.tsx`. React Router's route lexer sees nothing, so a submit answers 405.
  - a `vite.config.ts` without `optimizeDeps.exclude: ['stx-sdk']`, its `include` list and the `resolve.dedupe` entries
- **A `*-ui` `app/app.css` keeps the `@source "../node_modules/@nxgt/material/";` line.** Without it the app renders unstyled and nothing errors. A `sellix-ui` change that imports `leaflet/dist/leaflet.css` next to `@nxgt/map` is also a finding. Each app commits its own sprites under `public/assets/icons/sprites/`; the package does not ship them.
- **An action that a fetcher reads never answers with `redirect()` on success.** Report a hand-rolled `useFetcher` plus `toasts.loading()` where any exit (success, failure, unmount) leaves the loading toast open. Also report a missing shared toast `id` and a result type that is not a discriminated union. Prefer `useMutationCallbacks` or the Apollo wrapper.
- **A Playwright flow mocks every call it chains.** An unmocked request goes through MSW to the real oauth-api. The introspect mock must carry a named `user`, or `requireProfile()` redirects every spec.
- **Ory-native APIs follow `apps/notes/notes-api`.**
  - `stx-sdk/ory/tuples` is imported only from `src/ory/tuples.ts`, and that file is a single `createTuples({...})` call.
  - `stx-sdk/ory/admin` is imported only from `src/config/ory.ts`.
  - `useKetoChecks(ory)` comes after `useOryAuth` and before the services are built.
  - Services take the checker from the context, never the `ory` instance.
  - A `@check` guarding a field whose service answers a domain 404 uses the same `message:` key as that 404.
  - Share targets are resolved with `identities.findByEmail`, never a raw `GET /admin/identities`.
- **No dynamic `import()` of local modules or workspace packages.** A new `await import(...)` in a diff is a finding (older hits exist; report only new ones). The fix is a neutral third file, not a lazy import.
- **Module completeness.** A new module comes with:
  - `<name>.service.spec.ts` covering failure paths, which assert on `error.errorCode`, not `code`
  - a `deleteXxx(ids: [ID!]!): Void` mutation
  - `createdBy` / `lastModifiedBy` on the schema
  - an en/fr entry for every `errorCode`/`errorKey`, following `<moduleKey>.errors.<slug>`
- **Automation is a Bun `.ts` file under `scripts/`, using Bun Shell.** A new `.sh` file is a finding.

## Deliberate — do not report

- **Env files are per app** (`<app>/.env.development`, `.env.test`). A single root `.env` was tried and reverted.
- **`@check` and `requireXAccess` both stay.** The directive is the readable contract; the service can be reached from places the schema cannot. They share one DataLoader, so the second check is a cache hit.
- **Each app commits its own copy of the Font Awesome sprites.** The licence does not allow redistributing them in the package.
- **The five `tests.config.ts` files that re-export `clearDatabase`** are wrappers, not duplicates. Six exist today: under `platform`, `health`, `content-hub-api`, `self-learning-api`, `werewolf-api` and `notes-api`.
- **Names that differ from sellix's are deliberate:**
  - `TokenPrincipal`, not `Principal`
  - `CustomException.errorCode`, where `code` is the HTTP status
  - the GraphQL filter builders in `@nxgt/shared-mongo/filters`
- **Some guidance is mirrored on purpose in `sellix-monorepo`:** the toast and fetcher rule, and the env contract. Keep the copies in step; do not deduplicate them.
- **`.claude/skills/` and `.opencode/skills/` are symlinks to `.agents/skills/`.** Edits belong in `.agents/skills/`.

## Layering and packaging

- **Layouts:**
  - Subgraphs live in `apps/services/*` and are composed through `apps/supergraph/supergraph.yaml`.
  - New product apps use `apps/<id>/<id>-api` + `<id>-ui`.
  - The flat `apps/<name>` layout is legacy. Report it if a new app uses it.
- **Package origin:** there is no `packages/`. All `@nxgt/*` come from public npmjs by range, and there is no `link:` left in the repo; report one if it appears. A package fix is a release in nxgt-core first, then a range bump here.
- **After a range bump:**
  - A bump needs `bun run typecheck` to pass.
  - A bump to a version not yet on `registry.npmjs.org` is a finding.
  - Read the installed `node_modules/@nxgt/...`, not an nxgt-core checkout, which may be ahead.
- **No changesets here.** This repo publishes nothing, so nothing is released from it.
- **`stx-sdk` comes from npmjs (`^1.1.0`).** An SDK change lands and is verified in `stx-sdk` first, with `dist/` committed alongside, before any change to the four apps.
- **Subgraph services:**
  - They extend `MongoCrudService` and use `createYogaHono` from `@nxgt/shared-graphql`.
  - Resolvers are typed through GraphQL Codegen (`codegen.ts`, output to the gitignored `src/generated`).
  - Avoid `any`.
- **Branches:** every PR targets `develop`, and there is no integration branch. Slices must leave `develop` shippable. Commit messages follow `<type>: <Capitalized summary>`.
