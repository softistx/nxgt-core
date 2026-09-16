# `code-reviewer` in nxgt-ory

nxgt-ory runs Kratos, Keto and Hydra, which handle identity, permissions and OAuth2 for the whole platform. It also holds `kratos/` (kratos-ui), the app for the self-service screens, the Hydra challenge routes and the operator console at `/admin`. Most of what can break is not in TypeScript: the files under `config/` are a cross-repo API with no compiler, three admin listeners have no authentication, and the stack runs two ways (compose and Helm) that must stay in step. Read `kratos/AGENTS.md` as well before reviewing anything under `kratos/`; for that directory it takes precedence.

## Measure

List the source files by size:

```bash
git ls-files 'kratos/app/*.ts' 'kratos/app/*.tsx' 'kratos/scripts/*.ts' 'scripts/*.ts' 'config/*' \
  | xargs wc -l | sort -n | tail -40
git ls-files 'charts/nxgt-ory/*' | xargs wc -l | sort -n | tail -20
```

The green bar. CI runs only the first three:

```bash
bun run check        # biome; CI runs `biome ci`
bun run typecheck
bun run build
bun run verify:chart # needs helm only: no cluster, no stack
```

The reviewer may run all four above. Do **not** run `bun run test` (it needs a live Keto) or `cd kratos && bun run e2e` (it needs the whole stack), and do not run `bun run setup`, `docker:*` or `helm:install`. If a diff touches permissions or a flow, ask whether test and e2e were run locally against `bun run setup`.

## Invariants

- **Nothing sits in front of an API.** Oathkeeper and `edge/` were both removed. Report any gateway, path-based access rule or reverse-proxy auth layer that a diff brings back. APIs authenticate themselves in process: `oryAuth`/`ketoCheck` for REST, `useOryAuth`/`useKetoChecks`/`@check` for GraphQL. The `config/edge.*` files that may still sit on disk are untracked leftovers, and nothing reads them.
- **Never trust an identity header.** Any code that reads `X-User-*`, `X-Roles` or `X-Claims` from a request is a finding. The only exception is inside `oryAuth()`, and only under `NODE_ENV=test`. `grep -rnE "x-user-|x-roles|x-claims" -i kratos/app`
- **Unavailable is 503, never 403 and never anonymous.** Report any code that catches `OryUnavailable` and turns it into a denial, a 401/403 or an anonymous session.
- **Access denials on objects stay 404.** A change that makes an object lookup answer 403 lets callers probe which ids exist by watching status codes. Report it.
- **The three unauthenticated listeners never reach a browser.** These are Kratos admin `4434`, Keto write `4467` and Hydra admin `4445`. Each of these is a finding: a traefik label or IngressRoute for one, a `VITE_` variable holding one, or a client/loader call to one. `grep -rnE "4434|4467|4445" kratos/app charts docker-compose.yaml .env.example`
- **The admin imports are fenced.** `stx-sdk/ory/tuples` and `stx-sdk/ory/admin` are refused everywhere except the exemption list in `biome.json`'s first override. Today that list has five entries: `permissions.server.ts`, `identities.server.ts`, `clients.server.ts`, `scripts/grant-admin.ts` and `scripts/clients.ts`. A new exemption is a finding unless the commit explains it. So is a route that holds one of these clients outside the console guard.
- **Compose and chart change together.** Report a change to `docker-compose.yaml` with no matching change under `charts/nxgt-ory/`, and the reverse. Also report a change that only compose can express, because the direction is compose → Helm. A new "do this differently in production" comment must also land in `charts/nxgt-ory/values-prod.example.yaml`. Neither side keeps its own copy of `config/`: the chart injects those files with `--set-file`.
- **`config/` is a cross-repo API.** Adding a Keto namespace (`config/keto.namespaces.ts`), an `allowed_return_urls` entry (`config/kratos.yaml`), an identity-schema trait or an OAuth2 client (`kratos/scripts/clients.seed.ts`) has to land here first. Route paths must mirror the `ui_url`s in `kratos.yaml` and `hydra.yaml`. Report a mismatch, and report a diff that changes the OPL with no sign that the syntax check was run: `curl -X POST localhost:4469/opl/syntax/check --data-binary @config/keto.namespaces.ts`.
- **Static IPs and the shared host are hand-kept registries.** Pinning a new `proxy` address with no line added to `nxgt-docker/AGENTS.md` is a finding. `.134-.139` are reserved for future Ory services. A traefik router on `kratosix.$HOST` without an explicit `priority` (this repo uses 1, bookmarks-ui uses 10) is a finding.
- **The cookie rule.** `call()` from `stx-sdk/ory/flows` is the only place a Kratos call is unwrapped, and every `redirect()`/`data()` built from one passes `{ headers }`. A dropped `headers` loses the rotated CSRF cookie and leaves a form that answers 403 forever. See `kratos/AGENTS.md`.
- **`NODE_ENV` is read at bundle time.** Report any `build:server`/`start` script in `kratos/package.json` that loses its `NODE_ENV=production` prefix, and any `.env.test` or `-m test` in `playwright.config.ts`.
- **Scripts are TypeScript run by Bun, using Bun Shell.** A new `.sh` file, or a script that parses `.env` with shell tools, is a finding. Images with different contents may not share a Docker tag. Report a Dockerfile that is not `FROM oven/bun:1.4.2` directly, or any return of `docker/base.Dockerfile`, `scripts/docker-base.ts` or `GH_TOKEN` in the image build.

## Deliberate — do not report

- `biome.json`'s last override turns Biome off for `config/**`. The "unused" classes in `config/keto.namespaces.ts` are the OPL document itself.
- The `// @ts-nocheck` in `config/keto.namespaces.ts`, and its two editor errors (`related` has no initializer; `members` refers to itself). Keto's parser is only a subset of TypeScript, so `declare related` or `related!` would stop the stack from booting.
- The root `package.json` `overrides` pins for `zod` (held at 4.4.3 because 4.5.4 exhausts `tsc`'s heap), `react-hook-form` and `@tanstack/*`. They keep a single copy of the peers that `@nxgt/material` and `stx-sdk` share with the app.
- The Font Awesome Pro sprite sheets committed under `kratos/public/assets/icons/sprites/`. The repo is private and the licence allows this use.
- The `@source "../node_modules/@nxgt/material/";` line in `kratos/app/app.css`. It is required, and nothing errors when it is missing.
- `flow.server.ts`, `context.ts`, the traits helpers and `urls.server.ts` stay in `kratos/app/modules/kratos/` instead of moving to `stx-sdk`. The SDK refuses to hold them on purpose.
- Each app restates access checks in its `<module>.access.ts`, called from the service, even though the route guards already exist. This is on purpose: a job or a second caller is guarded too.
- Compose and Helm both exist, at parity and on the same ports. That is a staged replacement, not a fork.
- CI does not run `bun test`, e2e or `verify:chart`. The first two need a live stack, and the runner has no helm yet.
- The `admin-screen-pattern` skill is not Ory-specific, on purpose.

## Layering and packaging

- There is one private workspace (`nxgt-ory`, `private: true`) with a single app, `kratos/` (`kratos-ui`, also private). Nothing is published: there are no changesets and no release flow.
- `stx-sdk` (`^1.1.0`) and `@nxgt/material` (`^1.0.0`) resolve from public npmjs with no token. A `link:` dependency or a registry credential for either is a regression. Ignore the stale `link:` wording in AGENTS.md's "Related repositories" table: its invariant sections say both packages have been on npmjs since 2026-09-07.
- In the app, only `stx-sdk/kratos` and `stx-sdk/ory/*` are used. `stx-sdk/oauth/react` and `stx-sdk/oauth/react/server` must not be imported: the app has exactly one identity system. stx-sdk code is imported only from `.server.ts` modules and as types; report a client-side import.
- Server-only code lives in `*.server.ts`. Report any admin/tuples client, or any `serverEnv` read, that reaches client code.
- Consumers (`sellix-monorepo`, `nxgt-federation`) reach this stack only by URL on the `proxy` network. Report any import or path reference into those repos.
- The `@nxgt/shared-mongo` `Types`/`ObjectId` import rule is not stated in this repo's docs. This repo has no Mongo code to apply it to.
- Commit format is `<type>: <Capitalized summary>`, with type one of `feat`, `fix`, `update`, `chore` or `docs`.
