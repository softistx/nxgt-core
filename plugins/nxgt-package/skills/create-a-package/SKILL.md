---
name: create-a-package
description: >-
  Add a new `@nxgt/*` package to nxgt-core — scaffolding, the layering and
  entry-point conventions, and the checks that catch what a new package
  usually gets wrong. Use when a piece of code should be shared between
  repositories; shared packages live only in nxgt-core, so from any other
  repository this is a PR there followed by a version bump here.
---

# Skill: Create a package in nxgt-core

## Purpose

Add a thirteenth `@nxgt/*` package: the scaffolding, the four conventions that
are not obvious from looking at an existing one, and the checks that catch the
mistakes this repository has already paid for.

This replaces `nxgt-federation`'s old `create-shared-package` skill. Shared
packages do not live in either monorepo any more.

## When to use

- Code is needed by **two consumers** — and from now on the second may be the
  other monorepo, which installs the same tarballs.
- You are splitting an existing package because its dependency footprint has
  become someone else's problem (that is why `@nxgt/security` exists: the policy
  engine is framework-agnostic, and only `@nxgt/security/integrations/hono`
  pulls Hono in).

**Not** when one app uses it. One consumer means it belongs in that app. A
package is a versioned promise to two repositories; do not make one casually.

---

## Where it goes in the layering

Decide this before writing any code, because it is the one thing that cannot be
fixed later without a coordinated release:

```
shared-logging   shared-openapi        (no internal dependencies)
      └─ i18n
           └─ shared
                ├─ shared-exceptions
                └─ shared-mongo
                     ├─ shared-storage
                     ├─ shared-hono
                     └─ security
```

**A cycle is fatal, not untidy.** Two packages that depend on each other have no
version bump with a fixed point, and changesets cannot order the release.
Federation's `shared` ↔ `shared-events` cycle was broken on the way into this
repository; do not recreate that shape by "just re-exporting" something.

If your package needs something from a layer above it, the thing you need is in
the wrong place.

---

## Scaffolding

```
packages/<name>/
  package.json
  tsconfig.json
  tsconfig.build.json
  biome.json
  .gitignore
  README.md
  src/
    index.ts            ← the entry point
    <feature>/
      index.ts          ← a subpath entry point, if the package has one
```

Copy `packages/shared-logging/` — it is the smallest package with no internal
dependencies — and change the name. The three config files are identical in
every package and should stay that way:

```jsonc
// biome.json
{ "root": false, "extends": "//" }
```

```jsonc
// tsconfig.json
{ "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDirs": ["src"], "outDir": "dist" } }
```

```jsonc
// tsconfig.build.json — excludes specs, which tsconfig.json still typechecks
{ "extends": "./tsconfig.json",
  "compilerOptions": { "noEmit": false, "emitDeclarationOnly": true,
                       "rootDir": "src", "outDir": "dist" },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "test", "**/*.spec.ts"] }
```

### `package.json`

```jsonc
{
  "name": "@nxgt/<name>",
  "version": "1.0.0",
  "license": "UNLICENSED",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist", "README.md", "package.json"],
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js", "default": "./dist/index.js" },
    "./package.json": "./package.json"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/softistx/nxgt-core.git",
    "directory": "packages/<name>"
  },
  "publishConfig": { "registry": "https://registry.npmjs.org", "access": "public" },
  "scripts": {
    "build": "bun run ../../build.ts",
    "test": "bun test src",
    "typecheck": "tsc --noEmit"
  },
  "nxgt": { "entrypoints": ["src/index.ts"] },
  "dependencies": { "@nxgt/shared-logging": "workspace:^" },
  "devDependencies": { "@types/bun": "^1.4.0" },
  "peerDependencies": { "typescript": "^6.0.3" }
}
```

Drop the `test` script only if the package genuinely has no specs — and it
should have some.

---

## The four conventions that are not obvious

### 1. `nxgt.entrypoints` is the build's input, and `export *` depends on it

`build.ts` is one script for all packages; they differ only by
`nxgt.entrypoints`. **Every file that does `export * from '<external package>'`
must be a declared entry point.** Anywhere else, Bun emits `__reExport(ns, x)`
against an undeclared binding: the build exits 0 and the published package
throws at import.

Two packages shipped exactly that (`mongoose2 is not defined`,
`hono is not defined`). Audit with:

```
grep -rn "^export \* from '[^.]" packages/*/src/
```

Every hit must be an entry point.

### 2. A subpath is three things, not one

Adding `@nxgt/<name>/<feature>` means:

- `src/<feature>/index.ts`,
- an `exports` entry (`"./<feature>": { types, import, default }`),
- and `src/<feature>/index.ts` appended to `nxgt.entrypoints`.

Miss the third and the subpath resolves to a file that was never emitted.
`verify:artifacts` derives what it imports from the `exports` map, so a declared
subpath is checked automatically — there is no list to maintain.

### 3. Internal dependencies are `workspace:^`, never `workspace:*`

`workspace:*` publishes as an **exact** version. A consumer whose own `^1.0.0`
resolves to a newer release then gets two copies of the sibling in one tree —
and two Mongoose `model()` calls on one connection throw
`OverwriteModelError`. Both monorepos carried that for a week.
`verify:artifacts` refuses an exact sibling pin.

`typescript` is a peer, pinned `^6.0.3` on every package. Do not widen it in
one: the set becomes unsatisfiable, and under TypeScript 7
`@nxgt/shared-openapi` throws at import because `ts.factory` is not on the
default export.

### 4. `bun build` ships no assets

`dist/` holds bundled JavaScript and declarations. A `.graphqls`, a YAML file, a
font — anything that is not code — must live in its **own top-level directory**
and be named in `files`:

```jsonc
"files": ["dist", "graphql", "README.md", "package.json"]
```

`@nxgt/shared-graphql` published its resolvers without the SDL they resolve for
two releases, because nothing in this workspace notices: `@nxgt/*` resolves to
`src/` here.

If consumers need a path to that directory, export one that resolves against the
**package root** — the bundle is `dist/index.js` and the source is
`src/<dir>/<file>.ts`, so no fixed relative depth serves both layouts. See
`SHARED_SCHEMA_PATH`, which walks up to the nearest `package.json`.

---

## Tests

`"test": "bun test src"`, one process per package. Never `bun test` from the
root: a single process made three files fail for reasons that were not theirs —
a mock left on the global, a Mongoose model compiled twice, and an
`--env-file` that only the package script carries.

If the package needs infrastructure, gate on it rather than failing:

```ts
export const hasS3 = ['S3_ENDPOINT', 'S3_BUCKET', 'S3_USER', 'S3_PASSWORD']
  .every((n) => Boolean(Bun.env[n]));

describe.skipIf(!hasS3)('StorageService', () => { … });
```

Infrastructure that is absent is not a failing test. Infrastructure that is
present and broken is.

---

## README

The README is published — it is the package's page on npmjs, read by people who
will never see this repository. Ten of the twelve shipped `bun init` boilerplate
and five of those carried the *wrong package name* in the `#` heading.

State what the package is, list its subpaths in a table, show the install, and
write down the traps a consumer will otherwise hit. See
`packages/shared-mongo/README.md`.

---

## Wiring it up

1. `bun install` from the root, so the workspace links it.
2. Add it to the layering diagram in `AGENTS.md`.
3. `bun run build && bun run typecheck && bun run test`.
4. **`bun run verify:artifacts`** — packs everything, installs it as a consumer
   would, imports every declared subpath. This is the check that matters; the
   build proves almost nothing.
5. `bun changeset` — `minor` on the new package, and the changeset is what makes
   `1.0.0` exist. See the `release-a-package-change` skill for the rest of the
   release, which has a manual step.

---

## Related

- `release-a-package-change` — the release sequence and its failure modes.
- `keep-docs-current` — the README is the npm page; load it before finishing.
- `write-a-repo-script` — anything you automate here is a TypeScript file using
  Bun Shell, not a `.sh`.
- `AGENTS.md` — the long form of every trap named above.
