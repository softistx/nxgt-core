# `lay-out-a-product-repository` in content-hub

`softistx/content-hub` was created on 2026-09-22 out of `nxgt-federation`'s
`apps/content-hub/`, the same day and in the same shape as `self-learning`. 105
commits survived `git filter-repo`.

The layout is the skill's, rule for rule: private root manifest with `apps/*` and
`packages/*`, `@content-hub/api` and `@content-hub/ui`, one `biome.json`, one
`tsconfig.base.json`, a root `docker-compose.yaml` and `docker/Dockerfile` with
four targets, a `.dockerignore`, CI on `ubuntu-latest`, and a `packages/README.md`
reserving `@content-hub/schema`.

**Where it differs from `self-learning` is authentication, and every difference
follows from that one.** Read `references/self-learning.md` too: it is the worked
migration of an app exactly like this one.

## It was extracted with its debt intact, on purpose

Both apps still authenticate against `stx-sdk`'s OAuth server
(`sellix-monorepo`'s `oauth-api`), at `stx-sdk@^1.3.0`. An extraction and an auth
migration in one change would have been unreviewable, so the debt travelled. Its
`AGENTS.md` states it as four numbered consequences, which is the shape to copy
whenever a product arrives with debt:

1. **The access token is in the browser.** `stx-sdk/oauth/react`'s
   `createAuthModule` keeps it in storage and puts it on every request.
2. **The API must be public.** An SPA cannot reach a container name, so
   `content-hub-api` has a traefik router **and** a `CORS_ORIGINS` allow-list —
   where `self-learning`'s API has neither.
3. **The UI's backend addresses are baked into its image.** `ssr: false` means
   Vite inlines every `VITE_*` at build time, so the `ui` target takes six build
   arguments and there is **one image per deployment**.
4. **`@nxgt/shared-graphql` is pinned at `^1.2.2`**, which imports
   `OryUnavailable` from `stx-sdk/ory`. Moving to 2.x means moving to
   `@nxgt/ory-sdk` in the same commit: the class is caught with `instanceof`, so
   two copies are two classes and a Kratos or Keto outage answers 500 instead of
   503 — with a green build and green types.

Consequence 2 is the one to read before adding a service anywhere: **whether an
API needs a hostname is decided by where its token lives**, not by taste.

## Extraction details worth knowing

- **The UI already had its own compose file, Dockerfile and `.dockerignore`** under
  `apps/ui/`. A root trio was written before that was noticed; the app-level three
  were then deleted and everything they recorded was carried into the root files
  and `AGENTS.md`, in a commit that says so. `git ls-files | grep -E 'docker|compose'`
  before writing anything is the lesson.
- `apps/ui/package.json` starts with `bunx --bun react-router-serve
  ./build/server/index.js`, **not** a static file server. `ssr: false` still emits
  a server build, and that server does deep-link routing; a static server 404s
  everything but `/`.
- `apps/ui/vite.config.ts` needed `server.allowedHosts` (Vite 8 answers `403
  Blocked request` for an unknown `Host`) and `server.hmr.clientPort` (the HMR
  websocket arrives through traefik on the entrypoint's port).
- `rxjs@^7.8.2` is declared here for the same reason as in `self-learning` — see
  `extract-a-product-from-a-monorepo` §3.
- The dev UI service carries `mem_limit: 2g` and `cpus: 2.0`, carried over from the
  app-level compose file it replaced.
- The hostname variables accept the old `CONTENT_HUB_*_HOSTNAME` names as nested
  fallbacks (`${UI_HOSTNAME:-${CONTENT_HUB_UI_HOSTNAME:-…}}`), so a machine that
  was already running this app keeps working untouched.

## Still open

The Ory migration, and `@content-hub/schema`. Do the migration first: consequence
4 means the `@nxgt/shared-graphql` bump is part of it, and the schema package
would otherwise be written twice.
