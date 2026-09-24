---
name: lay-out-a-library-monorepo
description: >-
  The skeleton of an nxgt library monorepo — a Bun workspace whose `packages/*`
  are published to npm under `@nxgt/*`, as nxgt-data, nxgt-http,
  nxgt-telemetry and nxgt-janus are: which root files are copied byte for byte
  from nxgt-data, which ones each repository owns, and the shape of one
  package. Use when creating such a repository, adding a package to one,
  touching a root config file, or checking that a repository still follows the
  pattern. Not for a product repository (nxgt-product) nor for a package in
  nxgt-core itself (nxgt-package).
---

# Skill: Lay out a library monorepo

## Purpose

A **library monorepo** is a repository whose only output is packages on the
public npm registry. nxgt-data, nxgt-http, nxgt-telemetry and nxgt-janus are
four of them, and they share one skeleton. **nxgt-data is the reference**: when
a file here is said to be shared, nxgt-data's copy is the one that is right.

The skeleton is not a template to improve. A root file that differs in one
repository is a file that has to be read again in every review, and a fix made
in one copy is a fix the other three do not have.

```
<repository>/                       # softistx/nxgt-data, nxgt-http, nxgt-telemetry, nxgt-janus
	package.json                    # private, workspaces: packages/*, packageManager bun@<pinned>
	bun.lock
	bunfig.toml                     # shared — the @nxgt scope on npmjs, $NPM_TOKEN
	.gitignore                      # shared
	LICENSE                         # shared
	tsconfig.base.json              # shared — moduleResolution: bundler
	tsconfig.json                   # shared — extends the base, noEmit
	biome.json                      # per repository — see below
	build.ts                        # shared — one build for every package
	.changeset/config.json          # per repository — only the repo name differs
	.github/
		actions/setup/action.yml    # shared in substance — Bun pinned, bun i --frozen-lockfile, Biome
		workflows/ci.yml            # per repository — same steps, its own services
		workflows/release.yml       # shared in substance — changesets/action, "Version packages" PR
	.claude/settings.json           # per repository — the nxgt-core marketplace and its plugins
	scripts/
		tsconfig.json               # shared
		verify-artifacts.ts         # per repository — packs, installs, imports every subpath
		publish.ts  publish.spec.ts
	AGENTS.md                       # per repository — the single source of truth for agents
	CLAUDE.md                       # per repository — points at AGENTS.md and holds nothing else
	README.md
	packages/
		<name>/                     # @nxgt/<name>
```

---

## 1. The shared files are copied, never edited in place

| file | shared across |
| --- | --- |
| `bunfig.toml`, `.gitignore`, `LICENSE` | all four, and nxgt-core |
| `tsconfig.base.json`, `tsconfig.json`, `scripts/tsconfig.json` | all four, and nxgt-core |
| `build.ts` | nxgt-data, nxgt-telemetry, nxgt-janus — nxgt-http's copy does the same, with its own examples in the comments |

Check a repository against the reference before touching any of them:

```bash
for f in bunfig.toml .gitignore LICENSE tsconfig.base.json tsconfig.json scripts/tsconfig.json build.ts; do
	diff -q "$f" ../nxgt-data/"$f" >/dev/null || echo "differs: $f"
done
```

A difference is either a declared divergence, written in that repository's
`AGENTS.md` with its reason, or a drift to fix — **in nxgt-data first**, then
carried to the others.

Before carrying a change to another repository, read that repository's
`AGENTS.md` for a rule the change would break. A change that is right in one
repository and breaks a rule in the next is not a fix.

## 2. Imports carry no extension, and consumers resolve as a bundler does

`from './engine'`, never `'./engine.js'` — in the sources, and in what the
build emits. `tsconfig.base.json` sets `"moduleResolution": "bundler"` in every
repository, and that is the contract with consumers too: a consumer on
`nodenext` is not supported. Each package README says so in its Install
section.

An error that only appears under a setting the contract excludes is not a bug
to fix. Rewriting the emitted `.d.ts` files to add extensions was tried once in
nxgt-janus and reverted: it is the same rule, broken one step later.

## 3. What each repository owns

- **`package.json`** — the scripts share one vocabulary: `build`, `typecheck`
  (with `typecheck:scripts`), `test`, `check`, `verify:artifacts`,
  `changeset:version`, `changeset:publish`, `changeset:status`. A repository
  adds to them (nxgt-data starts its test servers, nxgt-http typechecks its
  generated code); it does not rename them.
- **`biome.json`** — tabs, single quotes, `organizeImports`, `dist` ignored.
  A repository may add rules, as nxgt-janus adds `useNamingConvention` to hold
  its no-`snake_case` rule, and says so in `AGENTS.md`.
- **`ci.yml`** — on `pull_request` to `develop`, `main` and `feat/**`. A
  repository that caches a service binary (nxgt-data, nxgt-janus) also runs on
  `push` to `develop`, the only way its caches become readable from every pull
  request. Steps in this order: `biome ci`, **build before typecheck** (every `exports`
  points at `dist/`), typecheck, test, `verify:artifacts`, and
  `changeset status` on a pull request that is not the release branch.
- **`AGENTS.md`** — the rules, the traps already paid for, the deliberate
  duplications and the declared divergences from nxgt-data. `CLAUDE.md` only
  points at it.
- **`.claude/settings.json`** — see §6.

## 4. One package

```
packages/<name>/
	package.json
	README.md                  # the npm page
	LICENSE                    # a copy: npm ships only the package's own
	biome.json                 # { "root": false, "extends": "//" }
	tsconfig.json              # extends ../../tsconfig.base.json
	tsconfig.build.json        # emitDeclarationOnly, excludes *.spec.ts
	docs/                      # guides, troubleshooting.md, roadmap.md (nxgt-docs)
	src/
		index.ts
		<feature>/index.ts         # a subpath entry, if any
	test/                      # shared fixtures, type tests
```

```jsonc
{
	"name": "@nxgt/<name>",
	"type": "module",
	"files": ["dist", "docs", "README.md", "package.json", "LICENSE"],
	"exports": {
		".": { "types": "./dist/index.d.ts", "import": "./dist/index.js", "default": "./dist/index.js" },
		"./package.json": "./package.json"
	},
	"scripts": {
		"build": "bun run ../../build.ts",
		"test": "bun test src",
		"typecheck": "tsc --noEmit"
	},
	"nxgt": { "entrypoints": ["src/index.ts"] },
	"peerDependencies": { "typescript": "^6.0.3" }
}
```

- `nxgt.entrypoints` mirrors `exports`: a subpath is a file, an `exports`
  entry **and** an entry point. `verify:artifacts` imports every declared
  subpath from a packed tarball, so a missing third piece fails CI rather than
  a consumer.
- Siblings depend on each other by `workspace:^`, never `workspace:*`.
- `files` names `docs`, so `docs/` must exist: a package whose `files` lists a
  folder it does not have ships without the guides its README links to.

## 5. Nothing publishes until the repository says so

A new repository starts with `"private": true` on every package, and the
release workflow runs and publishes nothing. **Removing `"private"` is what
makes a package publishable: it is a deliberate commit of its own**, taken
together with making the repository public — never a side effect of another
change.

## 6. The plugins, active in every project

A repository commits the marketplace and the plugins it expects in
`.claude/settings.json`:

```json
{
	"extraKnownMarketplaces": {
		"nxgt-core": { "source": { "source": "github", "repo": "softistx/nxgt-core" } }
	},
	"enabledPlugins": {
		"nxgt-base@nxgt-core": true,
		"nxgt-workflow@nxgt-core": true,
		"nxgt-package@nxgt-core": true
	}
}
```

`nxgt-base` is a bundle: it has no skill of its own and depends on
`nxgt-monorepo` (this skill), `nxgt-review`, `nxgt-docs` and `nxgt-autonomy`.
Installing it installs and enables all four.

Trusting the folder adds the marketplace, but **a plugin that is only enabled
in a project's settings does not load until it is installed**. Installed at
user scope, once per machine, it is active in every project:

```bash
claude plugin install nxgt-base@nxgt-core --scope user
```

An install at project scope in another checkout is not visible here; that is
the usual reason a skill reports "Unknown skill". For a whole organisation,
`nxgt-base@nxgt-core` goes in `enabledPlugins` of the managed settings instead.
After an install from a shell, `/reload-plugins` loads it into a running
session.

---

## Checklist for a new library monorepo

- [ ] The shared files of §1 copied from nxgt-data, and the `diff` loop silent.
- [ ] `package.json`, `biome.json`, `ci.yml`, `.changeset/config.json` adapted, and
      every difference from nxgt-data declared in `AGENTS.md`.
- [ ] `CLAUDE.md` points at `AGENTS.md` and holds nothing else.
- [ ] `.claude/settings.json` as in §6, and `nxgt-base` installed at user scope.
- [ ] Every package `"private": true`, `verify:artifacts` green on it anyway.
- [ ] Every README states `"moduleResolution": "bundler"` in its Install section.
- [ ] A `references/<repo>.md` added to `nxgt-review` for the reviewer.
