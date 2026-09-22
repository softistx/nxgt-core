# `code-reviewer` in content-hub

`softistx/content-hub` is one product in one repository: `apps/api` (GraphQL Yoga on Bun, Mongo, MinIO) and `apps/ui` (React Router 8 as an **SPA**, `ssr: false`, Apollo), plus a `packages/` reserved for the schema they will share. It left `nxgt-federation` on 2026-09-22 **without** its auth migration, and that is the single most important thing to hold while reviewing: four of its decisions exist only because the access token is still in the browser. Read the root `AGENTS.md` first — it states the debt as four numbered consequences, and they are what you check against.

Its sibling `softistx/self-learning` is the same product shape **after** the migration; `references/self-learning.md` is the list of invariants this repository will inherit.

## Measure

```bash
git ls-files 'apps/*/src/**/*.ts' 'apps/*/app/**/*.ts*' | xargs wc -l | sort -n | tail -30
```

The green bar. CI runs the first four:

```bash
bun install
bun run check          # biome
bun run typecheck      # both workspaces
bun run build          # the UI's client build; there is no SSR bundle here
bun run --cwd apps/api test   # only if Mongo, Redis and MinIO are on `proxy`
```

Do **not** run `bun run e2e` (a browser, a dev server and an MSW-mocked OAuth server). If a diff touches a service or a resolver, ask whether `test` was run.

## Invariants

- **The debt does not grow.** `stx-sdk@^1.3.0` is the current auth on both sides, and that is accepted. What is a finding is *new* code that deepens it: another `createAuthModule` call site, another module importing `stx-sdk/oauth`, a second introspection code path. There is exactly one — `apps/api/src/graphql/plugins/auth.ts`, which exports `resolveBearerPrincipal` so a REST route can reuse it. Report a route that introspects inline instead.
- **`@nxgt/shared-graphql` is pinned at `^1.2.2` and must move in one commit with the Ory migration.** 1.x imports `OryUnavailable` from `stx-sdk/ory`; 2.x imports it from `@nxgt/ory-sdk`. The class is caught with `instanceof`, so two copies are two classes and a Kratos or Keto outage answers 500 instead of 503 — with a green build and green types. A diff that bumps it alone is a finding, whatever its message says.
- **`VITE_*` values are baked into the image.** `ssr: false` means Vite inlines them at build time, which is why `docker/Dockerfile`'s `ui` target takes six build arguments and there is one image per deployment. Report a new backend URL read at runtime in the browser (it will be `undefined`), and report a **secret** appearing as a `VITE_*` or as a build `ARG` — a build arg is recorded in the image metadata and `docker history` prints it.
- **The API is public because an SPA cannot reach a container name.** It therefore has a traefik router **and** a `CORS_ORIGINS` allow-list, and the two must stay in step: a new hostname for the UI with no matching `CORS_ORIGINS` entry is a finding, and so is `CORS_ORIGINS: '*'`.
- **Identity comes from the principal, never from a client-supplied argument.** `this.principal?.uid`/`.sub` inside the service, `@authenticated` on the field, and an ownership check before mutating an existing record. A new `userId`/`ownerId` input on a mutation is a finding — unlike its sibling, this repository has no documented exception.
- **Media goes through a presigned URL, and the raw key is what is stored.** `filename` is the only input; the MIME type is derived server-side with `Bun.file(name).type`; the bucket handle is a module-level lazy singleton (`createLazyStorage`), never a field on a per-request service. A resolved presigned GET URL that gets **persisted** is a finding: it expires, and the result is a broken image with no error anywhere.
- **Nothing publishes a port.** No `ports:` in either profile. Report one, and report `${TRAEFIK_ENABLE:-true}` replacing the literal `traefik.enable=true` — this machine's shell exports `false` and the shell beats `.env` in compose interpolation.
- **`.dockerignore` is a secret boundary.** The build context is the repository root and the Dockerfile does `COPY apps ./apps`. Report any change that drops `**/.env*`.
- **`USER bun` in the `*-dev` targets** — those containers write into the mounted host tree, and as root the files land root-owned, after which a host-side `typecheck` dies with `EACCES`.
- **`clearDatabase()` stays guarded** — `NODE_ENV=test` **and** a database name ending in `-test`.
- **Kratos's identity screens are not this repository's, once it migrates.** Today `apps/ui/app/routes/auth/{sign-in,sign-up}` render real forms against `stx-sdk`'s OAuth server; that is the pre-migration state. Report a *new* credential form, and note in the report that the existing ones are what the migration removes.

## Deliberate — do not report

- **The whole `stx-sdk` auth layer**, the browser-held token, the public API, the six `VITE_*` build args and the `^1.2.2` pin. All four are written down in `AGENTS.md` as numbered consequences with the migration named. Report only what makes them worse.
- `rxjs@^7.8.2` in `apps/ui` is **not** unused: it is a peer of `@apollo/client@4`, and without the pin `inquirer@7` wins the hoist with `rxjs@^6` and the client build fails.
- `"start": "bunx --bun react-router-serve ./build/server/index.js"` for an `ssr: false` app is correct: SPA mode still emits a server build, and that server does deep-link routing where a static file server 404s everything but `/`.
- `server.allowedHosts` and `server.hmr.clientPort` in `vite.config.ts`: Vite 8 answers `403 Blocked request` for an unknown `Host`, and the HMR websocket arrives through traefik on the entrypoint's port.
- The hostname variables accepting old `CONTENT_HUB_*_HOSTNAME` names as nested fallbacks — a machine already running this app keeps working untouched.
- `mem_limit: 2g` / `cpus: 2.0` on the dev UI service, carried over from the app-level compose file the root one replaced.
- `packages/` holding only a `README.md`: it is the reservation, and the reason this product is one repository.
