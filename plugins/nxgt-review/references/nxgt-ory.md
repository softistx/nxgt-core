# `code-reviewer` in nxgt-ory

nxgt-ory runs Kratos, Keto and Hydra, which handle identity, permissions and OAuth2 for the whole platform. It also holds `kratos/` (kratos-ui), the app for the self-service screens, the Hydra challenge routes and the operator console at `/admin`, and `packages/`, two public npm packages: `@nxgt/ory-sdk` (the Ory clients, the flow machine, the Keto checks) and `@nxgt/ory-react` (route guards and the UI built on them), published with changesets. Most of what can break is not in TypeScript: the files under `config/` are a cross-repo API with no compiler, three admin listeners have no authentication, and the stack runs two ways (compose and Helm) that must stay in step. Read `kratos/AGENTS.md` as well before reviewing anything under `kratos/`; for that directory it takes precedence.

## Measure

List the source files by size:

```bash
git ls-files 'kratos/app/*.ts' 'kratos/app/*.tsx' 'kratos/scripts/*.ts' 'scripts/*.ts' 'packages/*/src/*' 'config/*' \
  | xargs wc -l | sort -n | tail -40
git ls-files 'charts/nxgt-ory/*' | xargs wc -l | sort -n | tail -20
```

The green bar. CI runs the first five of these and `changeset:status`; the last two are for you:

```bash
bun run check              # biome; CI runs `biome ci`
bun run build              # packages first, then kratos; BEFORE typecheck, because the packages' exports point at dist/
bun run typecheck
bun run test:packages      # needs nothing
bun run verify:artifacts   # packs, installs and imports every exports subpath
bun run changeset:status   # skipped on changeset-release/develop
bun run verify:chart       # needs helm only: no cluster, no stack; CI does not run it
```

The reviewer may run all of the above. Do **not** run `bun run test` (it needs a live Keto), `ORY_LIVE=1 bun run test:packages` or `cd kratos && bun run e2e` (they need the whole stack), and do not run `bun run setup`, `docker:*`, `helm:install`, `changeset`, `changeset:version` or `changeset:publish`. If a diff touches permissions or a flow, ask whether test and e2e were run locally against `bun run setup`.

## Invariants

- **Nothing sits in front of an API.** Oathkeeper and `edge/` were both removed. Report any gateway, path-based access rule or reverse-proxy auth layer that a diff brings back. APIs authenticate themselves in process: `oryAuth`/`ketoCheck` for REST, `useOryAuth`/`useKetoChecks`/`@check` for GraphQL, both walking `evaluateRequirement` from `@nxgt/ory-sdk`. The `config/edge.*` files that may still sit on disk are untracked leftovers, and nothing reads them.
- **Never trust an identity header.** Any code that reads `X-User-*`, `X-Roles` or `X-Claims` from a request is a finding. The only exception is inside `oryAuth()`, and only under `NODE_ENV=test`. `grep -rnE "x-user-|x-roles|x-claims" -i kratos/app`
- **Unavailable is 503, never 403 and never anonymous.** Report any code that catches `OryUnavailable` and turns it into a denial, a 401/403 or an anonymous session.
- **Access denials on objects stay 404.** A change that makes an object lookup answer 403 lets callers probe which ids exist by watching status codes. Report it.
- **The three unauthenticated listeners never reach a browser.** These are Kratos admin `4434`, Keto write `4467` and Hydra admin `4445`. Each of these is a finding: a traefik label or IngressRoute for one, a `VITE_` variable holding one, or a client/loader call to one. `grep -rnE "4434|4467|4445" kratos/app charts docker-compose.yaml .env.example`
- **The admin imports are fenced.** `@nxgt/ory-sdk/tuples` and `@nxgt/ory-sdk/admin` are refused everywhere except the exemption list in `biome.json`'s first override. Today that list has five entries: `permissions.server.ts`, `identities.server.ts`, `clients.server.ts`, `scripts/grant-admin.ts` and `scripts/clients.ts`. AGENTS.md says "four files"; `biome.json` is the list, and the stale count is a documentation finding to report once. A new exemption is a finding unless the commit explains it. So is a route that holds one of these clients outside the console guard.
- **Compose and chart change together.** Report a change to `docker-compose.yaml` with no matching change under `charts/nxgt-ory/`, and the reverse. Also report a change that only compose can express, because the direction is compose → Helm. A new "do this differently in production" comment must also land in `charts/nxgt-ory/values-prod.example.yaml`. Neither side keeps its own copy of `config/`: the chart injects those files with `--set-file`.
- **`config/` is a cross-repo API.** Adding a Keto namespace (`config/keto.namespaces.ts`), an `allowed_return_urls` entry (`config/kratos.yaml`), an identity-schema trait or an OAuth2 client (`kratos/scripts/clients.seed.ts`) has to land here first. Route paths must mirror the `ui_url`s in `kratos.yaml` and `hydra.yaml`. Report a mismatch, and report a diff that changes the OPL with no sign that the syntax check was run: `docker compose exec -T keto wget -qO- --post-file=/etc/config/keto/namespaces.ts --header='Content-Type: text/plain' http://127.0.0.1:4469/opl/syntax/check` (`{}` with HTTP 200 passes).
- **Almost nothing pins an address, and the shared host is a hand-kept registry.** `nxgt-docker` no longer keeps a static-IP registry: only traefik (`.2`) and stalwart (`.5`) pin one, because the PROXY-protocol `TRUSTEDIPS` list names them. A new `ipv4_address` in this repo's compose is a finding unless the commit explains it. A traefik router on `kratosix.$HOST` without an explicit `priority` (this repo uses 1, bookmarks-ui uses 10) is a finding.
- **The cookie rule.** `call()` from `@nxgt/ory-sdk/flows` is the only place a Kratos call is unwrapped, and every `redirect()`/`data()` built from one passes `{ headers }`. A dropped `headers` loses the rotated CSRF cookie and leaves a form that answers 403 forever. See `kratos/AGENTS.md`.
- **`NODE_ENV` is read at bundle time.** Report any `build:server`/`start` script in `kratos/package.json` that loses its `NODE_ENV=production` prefix, and any `.env.test` or `-m test` in `playwright.config.ts`.
- **`packages/` obey the release rules below.** A change under `packages/` with no changeset, a `workspace:^` sibling range that `bun.lock` did not follow, a package without its own `LICENSE`, `.npmrc` anywhere, or a publish through `changeset publish` instead of `scripts/publish.ts` is a finding.
- **Scripts are TypeScript run by Bun, using Bun Shell.** A new `.sh` file, or a script that parses `.env` with shell tools, is a finding. Images with different contents may not share a Docker tag. Report a Dockerfile that is not `FROM oven/bun:1.4.2` directly, or any return of `docker/base.Dockerfile`, `scripts/docker-base.ts` or `GH_TOKEN` in the image build.

## Deliberate — do not report

- `biome.json`'s last override turns Biome off for `config/**`. The "unused" classes in `config/keto.namespaces.ts` are the OPL document itself.
- The `// @ts-nocheck` in `config/keto.namespaces.ts`, and its two editor errors (`related` has no initializer; `members` refers to itself). Keto's parser is only a subset of TypeScript, so `declare related` or `related!` would stop the stack from booting.
- The root `package.json` `overrides` pins for `zod` (held at 4.4.3 because 4.5.4 exhausts `tsc`'s heap), `react-hook-form`, `@tanstack/*`, `@playwright/test` and `typescript` (`~6.0.3`). They keep a single copy of the peers that `@nxgt/material`, `@nxgt/ory-sdk` and `@nxgt/ory-react` share with the app.
- The published packages accept `typescript: ^6.0.3 || ^7.0.0` as a peer while the repo itself builds on `~6.0.3`. The widening is deliberate and both packages' ranges move together; neither may touch `ts.*` at module scope or import `typescript` at runtime, since TypeScript 7's npm package ships no compiler API.
- `@nxgt/ory-react` declares `@nxgt/material` as an optional peer with a wide range (`>=1.16.5`) and a devDependency on the app's major. The wide peer is free; a devDependency that falls behind `kratos/package.json` puts two copies of the library in the bundle.
- The Font Awesome Pro sprite sheets committed under `kratos/public/assets/icons/sprites/`. The repo is private and the licence allows this use.
- The `@source "../node_modules/@nxgt/material/";` line in `kratos/app/app.css`. It is required, and nothing errors when it is missing.
- `flow.server.ts`, `context.ts`, the traits helpers and `urls.server.ts` stay in `kratos/app/modules/kratos/` instead of moving to `@nxgt/ory-sdk`. The SDK refuses to hold them on purpose.
- Each app restates access checks in its `<module>.access.ts`, called from the service, even though the route guards already exist. This is on purpose: a job or a second caller is guarded too.
- Compose and Helm both exist, at parity and on the same ports. That is a staged replacement, not a fork.
- CI does not run the root `bun test`, e2e or `verify:chart`. The first two need a live stack, and the runner has no helm yet. `test:packages` and `verify:artifacts` do run.
- The `admin-screen-pattern` skill (now in `ory-app`, marketplace `softistx-plugins`) is not Ory-specific, on purpose.

## Layering and packaging

- The root workspace (`nxgt-ory`, `private: true`) holds `kratos/` (`kratos-ui`, also private, taking the packages at `workspace:^`) and two **public** packages under `packages/`: `@nxgt/ory-sdk` (0.2.0) and `@nxgt/ory-react` (0.4.0), both MIT, versioned independently (`fixed` and `linked` are empty), with `@nxgt/ory-react` peering on the SDK by `workspace:^`. `@nxgt/ory-sdk` has `./flows`, `./oauth2`, `./tuples`, `./admin`, `./kratos`, `./keto` and `./hydra` beside its root; `@nxgt/ory-react` has `./server`, `./ui`, `./flows` and `./forms`.
- Releases are changesets, as in nxgt-core: a change under `packages/` needs a changeset (CI runs `changeset:status`), `.github/workflows/release.yml` opens the "Version packages" PR, and merging it publishes through `scripts/publish.ts` (`bun publish`, never `changeset publish`), which re-reads the registry for up to fifteen minutes and tags only what npm confirms. `changeset:version` is `changeset version && bun install`: `workspace:^` is substituted from `bun.lock`, so a Version PR without the refreshed lockfile publishes yesterday's internal ranges. `verify:artifacts` packs, installs and imports every subpath and fails a tarball without its `LICENSE`, with test code, or whose sibling range excludes the sibling. No `.npmrc`: `NPM_TOKEN` is an organisation secret read through `bunfig.toml`. A first publish or a major version waits for the owner, as for any package.
- The packages' peers: `typescript: ^6.0.3 || ^7.0.0` on both, `openapi-fetch ^0.17.0` and `zod ^4.4.3` on the SDK, `react`/`react-dom ^19.2.8`, `react-router ^8.3.1`, optional `react-hook-form` and `@nxgt/material` on the React package. A peer range edited in one package and not the other is a finding.
- `@nxgt/material` (`^2.0.1` in the app) resolves from public npmjs with no token, and `stx-sdk` is **no longer a dependency** of this repository: its Ory layer moved into `packages/`. A `link:` dependency, a registry credential, or a `stx-sdk` dependency in any `package.json` is a regression. AGENTS.md's "Related repositories" table still says `@nxgt/material@^1.16.5`; the invariant sections and `kratos/package.json` are right. Report that stale line once as a documentation finding.
- In the app, the Ory layer is `@nxgt/ory-sdk` and `@nxgt/ory-react`. `stx-sdk/oauth/react` (the legacy relying party) must not be imported: the app has exactly one identity system. SDK code is imported only from `.server.ts` modules and as types, apart from `@nxgt/ory-react/ui`, which renders; report any other client-side import.
- `src/generated/` in `@nxgt/ory-sdk` is committed and regenerated by hand (`cd packages/ory-sdk && bun run codegen`), never as a `postinstall`; `openapi/kratos.yaml` is upstream Ory's spec, pinned to the same tag as the `oryd/kratos` image, and never hand-edited.
- Server-only code lives in `*.server.ts`. Report any admin/tuples client, or any `serverEnv` read, that reaches client code.
- Consumers (the two consumer repositories) reach this stack only by URL on the `proxy` network. Report any import or path reference into those repos.
- The `@nxgt/shared-mongo` `Types`/`ObjectId` import rule is not stated in this repo's docs. This repo has no Mongo code to apply it to.
- Commit format is `<type>: <Capitalized summary>`, with the types the "Commit messages" bullet of that repository's `AGENTS.md` lists; no copy here.
