# `code-reviewer` in stx-sdk

`stx-sdk` is an unscoped public npm package with three parts. It holds generated OpenAPI clients (`lib/sdk/<api>.ts` over the gitignored `lib/generated/`), a headless React Router auth module (`lib/react/`, `lib/react-server/`) and auth and Ory UI entries that depend on `@nxgt/material`. Its consumers are four apps in two monorepos, plus `@nxgt/shared-hono` and `@nxgt/shared-graphql` in nxgt-core. The most serious bugs here throw no error: a second React Router context instance, per-user state held at module scope, or a fetcher toast that never closes. Read the diff for those, not only for what fails a test.

## Measure

List hand-written source by size. The limit is about 200 lines per file, and type-only files may go over it. `lib/generated/**` is gitignored, and `git ls-files` leaves it out already.

```bash
git ls-files 'lib/**/*.ts' 'lib/**/*.tsx' 'scripts/*.ts' codegen.ts vite.config.ts \
  | grep -v '__tests__/' | xargs wc -l | sort -rn | head -30
```

Green bar, as stated in AGENTS.md ("run `bun run check` and `bun tsc` first"):

```bash
bun tsc             # tsc -b
bun run test        # vitest run, environment: node
bun run check       # biome check --write — WRITES; the reviewer runs `bunx biome check` instead
bun changeset status --since=origin/develop   # what CI checks; needs the changeset committed
```

The reviewer may run `bun tsc`, `bun run test`, `bunx biome check` (without `--write`) and the changeset status check. The reviewer must not run the following:
- `bun run build`: `postbuild` runs `bun link`.
- `bun codegen`: it regenerates `lib/generated/`.
- `bun run check`: it writes files.
- Anything that publishes.

`lib/ory/**/live.test.ts` needs the nxgt-ory stack running (`bun run setup` there). If it fails because nothing is listening, report that as an environment problem, not a finding.

## Invariants

- **React Router contexts are created once, at module scope.** `lib/react/context.ts` must never create a context inside a factory. A second instance makes `context.get(userContext)` return the default value, which means a lockout or an auth bypass with no error. Report any `createContext` that moves into a function, and any new `createContext` for auth state outside `lib/react/context.ts`.
- **Code inside the package reaches `lib/react/` by relative path, never by its own specifier.** Report any self-import: `grep -rnE "from 'stx-sdk" lib/`. `vite.config.ts` must keep `/^stx-sdk(\/.+)?$/` in `EXTERNAL_PACKAGES`, so report its removal.
- **One specifier per entry, and no re-export shims.** An alias built as a re-export, or an entry listed twice in `vite.config.ts`, creates a second context instance. A rename must follow the recorded shape: alias onto the identical `dist/*.js`, migrate the consumers, then remove the alias. `scripts/assert-context-identity.ts` guards the built entries. Report any edit that weakens it.
- **Adding an entry takes three coordinated edits.** They are the `exports` map in `package.json`, `REACT_ENTRIES` or `LIB_ENTRIES` in `vite.config.ts`, and the barrel file. A diff that touches only one or two of them is a finding.
- **`stx-sdk/ory/tuples` is never re-exported from `lib/ory/index.ts`.** `stx-sdk/ory` is the object every service holds, and it must not be able to write tuples. Check with `grep -n tuples lib/ory/index.ts`.
- **Server code never reaches a client entry.** `lib/ory/react/server/` and `lib/ory/react/ui/` are separate entries, as are `lib/react-server/` and `lib/react/`. Report any import from a UI or isomorphic entry into a server-only module.
- **React, React DOM and React Router stay external.** Report any removal from `EXTERNAL_PACKAGES` in `vite.config.ts`. Bundling them causes "Invalid hook call" and a second `createContext`.
- **Mutable per-user auth state lives on an `AuthRuntime`, never in the `createAuthModule` closure or at module scope.** It is resolved per call from `authRuntimeContext` (`lib/react/runtime/`). On a server, a module-level store leaks sessions between users. Report the line that declares that state.
- **Actions read by a fetcher return `data(...)` on every branch, never `redirect()`.** Type the result as a discriminated union (`{ success: true } | { success: false; error }`). A `redirect()` leaves a `toasts.loading()` toast spinning forever on success. `signInAction` is the model to copy. Check with `grep -rn "redirect(" lib/react/handlers lib/react-ui`. `throw redirect(...)` in a loader is fine.
- **`@nxgt/material` stays an optional peer, and only the two UI entries import it.** Report any new required peer that is on no registry. Check `peerDependenciesMeta` in `package.json`, and run `grep -rln "@nxgt/material" lib/`: matches are allowed only under `lib/react-ui*` and `lib/ory/react/ui`.
- **Lifecycle scripts stay guarded.** `postinstall` only works if `codegen.ts` exists, and `codegen.ts` is absent from `files`. Report a new lifecycle script that does real work in a consumer's `node_modules`, and report `codegen.ts` or `scripts/` being added to `files`.
- **A spec change commits only the spec.** Report any tracked file under `lib/generated/` or `dist/`. A change to `openapi/<api>.yaml`, and each entry in `apis.json`, needs a matching façade in `lib/sdk/<api>.ts` and a matching `exports` entry.

## Deliberate — do not report

- **Inline shell in `postinstall` and `prepare`.** They run under both bun and npm on a consumer's machine, where no repository script exists yet. This exception to `write-a-repo-script` does **not** cover `scripts/publish.ts`.
- **The two estate-only UI entries.** `stx-sdk/oauth/react/ui` and `stx-sdk/ory/react/ui` require `@nxgt/material`. Outsiders can use every other entry.
- **`@nxgt/material` as `link:` in `devDependencies`.** This is harmless because consumers never install dev dependencies.
- **`[install]` in `bunfig.toml` instead of `[install.scopes]`.** The package is unscoped, so there is no scope to attach the credential to.
- **The `stx-sdk/oauth/react` name.** It is the relying party of the legacy `oauth-api`, not React utilities. Do not ask to rename it without the alias-migrate-remove shape.
- **Two OAuth relying parties.** They are `stx-sdk/oauth/react` and `stx-sdk/ory/oauth2`.
- **Vitest in the `node` environment, with stubbed `globalThis.localStorage` instead of jsdom.**
- **Type-only files over 200 lines**, when the types are cohesive.

## Layering and packaging

- **Registry and release:** the package is published to the public npm registry as `stx-sdk`, and the GitHub repository is private. It uses Changesets: merging to `develop` opens "Version packages", and merging that pull request publishes.
  - A diff that changes behaviour needs a committed `.changeset/*.md`, or a `--empty` one with a stated reason.
  - A README change needs a `patch` changeset.
- **Publishing:** the release uses `scripts/publish.ts` with `bun publish`. Report any `npm publish`, `changeset publish` or `.npmrc`. The token lives only in `bunfig.toml` as `$NPM_TOKEN` and is never committed.
- **Generated files:** `CHANGELOG.md` is generated, so report hand edits to it.
- **README is the npm page:** report any mention of a private app, a private monorepo or "the estate" in `README.md`. A change to the public surface updates the README in the same pull request.
- **Auth docs:** `docs/react-auth/` is the source of truth for `lib/react/` and `lib/react-server/`. `docs/` ships in the tarball, so an auth change that leaves those docs stale is a finding.
- **Consumer impact:** a change to `lib/react/` affects four apps across two repositories. A breaking change to `stx-sdk/auth` or `stx-sdk/ory` must first be released in nxgt-core, where those subpaths are optional peers of `@nxgt/shared-hono` and `@nxgt/shared-graphql`. Flag breaking changes to the public surface that have no `major` changeset.
- **Imports and style:**
  - Use `import type` for type-only imports (`verbatimModuleSyntax`).
  - The path alias `@/*` maps to `./lib/*`.
  - File and directory names are kebab-case.
  - Comments explain why, not what.
