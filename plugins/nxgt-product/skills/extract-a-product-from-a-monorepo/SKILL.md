---
name: extract-a-product-from-a-monorepo
description: >-
  Move a product out of a monorepo into a repository of its own with its
  history intact — `git filter-repo` with `--path-rename`, a root manifest
  and a regenerated lockfile, then a second PR that removes it upstream and
  repairs every count, path and container name the departure invalidated. Use
  when extracting an app or a product out of a monorepo, splitting a
  repository, moving a directory between repositories while keeping
  `git log`, or cleaning up after such a move.
---

# Skill: Extract a product from a monorepo

## Purpose

An extraction is **two pull requests in two repositories, in this order**:

1. the new repository — additive, verifiable, green before anyone else is
   affected;
2. the removal upstream — a deletion plus every repair the deletion implies.

They are never one change and never simultaneous. The new repository can be
wrong in private; the removal cannot.

Read `lay-out-a-product-repository` for the shape the extracted repository takes;
this skill is the move itself and its aftermath. `references/<product>.md` records
what each completed extraction actually cost.

---

## 1. Decide what travels with it, before touching git

Three questions, and the second is the one that gets skipped:

- **What is the product?** Every deployable of it, and nothing else. A directory
  that two products import is not part of either — it stays, or it becomes a
  published package first.
- **Does anything else in the monorepo reach into it?** Grep for the directory
  name, the workspace names, the container names and the ports. A reference by
  *container name* survives the move; a reference by *path* does not; and a
  reference in prose is invisible to every tool you own. All three were found in
  this organisation's two extractions.
- **Is a migration also pending?** Then choose, deliberately, and write the choice
  in the commit message:
  - **migrate first, then extract** when the migration has a reference
    implementation in the monorepo — the diff is reviewable against its siblings,
    and the extracted repository arrives clean. This is what `self-learning` did.
  - **extract as-is, migrate after** when it does not. Two changes at once are
    unreviewable; the debt then goes in `AGENTS.md` as numbered consequences
    (`lay-out-a-product-repository` §9). This is what `content-hub` did.

## 2. `git filter-repo`, on a fresh clone, with the renames in the same pass

```bash
git clone https://github.com/<org>/<monorepo> /tmp/extract-<product>
cd /tmp/extract-<product>
git filter-repo \
	--path apps/<product>/ \
	--path-rename apps/<product>/<product>-api/:apps/api/ \
	--path-rename apps/<product>/<product>-ui/:apps/ui/
```

- **A fresh clone, always.** `filter-repo` rewrites every commit and refuses to
  run on a repository with a remote it did not just clone, for the reason that
  makes `--force` a bad idea: there is no undo.
- **`--path` and `--path-rename` in one invocation.** Two passes work but produce
  a history whose paths change mid-way, so `git log --follow` breaks at the seam.
- **The rename is where the directory names get fixed.** `<product>-api` inside
  `apps/<product>/` said *which* product because it had siblings; at the root of
  its own repository it is `apps/api`. Do it here or do it in a rename commit that
  every future `git log` has to cross.
- Commits that touched nothing under `--path` are gone, so the count drops.
  Record the number that survived in the commit message — 135 and 105 for the two
  products here. It is the one number that proves the history came along.

Then verify before building anything on top:

```bash
git log --oneline | wc -l
git log --oneline -- apps/api | tail -3     # predates the new repository
git ls-files | head                          # nothing outside apps/
```

## 3. The lockfile does not survive, and its replacement is a measurement

Whatever `bun.lock` the filtered tree has is the monorepo's, describing
workspaces that are no longer there. Delete it, write the root manifest, and
install:

```bash
rm -f bun.lock && bun install
```

**Read that install's output, and then build.** A single-product lockfile resolves
differently from a shared one, and what a shared one hides is a *peer* another
workspace happened to declare. Measured here:

> `rxjs` is a peer of `@apollo/client@4`, so nothing pulls it in directly. In the
> monorepo another app declared `rxjs@^7`, which won the hoist for everyone. Alone,
> `inquirer@7` — transitive, from the PWA/workbox tooling — wins it with `rxjs@^6`,
> and the client build fails with two dozen `[MISSING_EXPORT] "observeOn" is not
> exported by rxjs`.

The fix is to declare the pin in the app that needs it (`"rxjs": "^7.8.2"`), and
the general rule is: **an undeclared peer that worked in a monorepo is a bug the
monorepo was hiding.** `bun run build` in every workspace is what surfaces the
class; `bun run typecheck` does not, because types resolve from the same wrong
copy.

## 4. What the product gains on the way out

The extracted repository is not the old subtree at a new address. It gains what
the monorepo provided and what the monorepo never had:

| gains | because |
| --- | --- |
| root manifest, `biome.json`, `tsconfig.base.json` | it inherited the monorepo's |
| `docker-compose.yaml`, `docker/Dockerfile`, `.dockerignore` | often it had none at all — `bun run dev` on the host was the only way to run it |
| `.github/workflows/ci.yml` | the monorepo's workflow named other paths |
| `AGENTS.md`, `CLAUDE.md`, `README.md`, `.env.example` | the monorepo's `AGENTS.md` was about eleven workspaces |
| `packages/README.md` | the reservation is the reason it is one repository |

**Look for an app-level compose or Dockerfile before writing a root one.** One of
these two extractions wrote a root `docker-compose.yaml` and Dockerfile, then
discovered the UI already had its own under `apps/ui/`. Both were deleted and
everything they recorded was carried into the root files and `AGENTS.md`, in a
follow-up commit that said so. `git ls-files | grep -E 'docker|compose'` first
costs nothing.

**A `.env` was never in git, so a fresh clone cannot start.** `.env.example` and
the `register-client` step belong in the README, and the compose file uses
`${VAR:?<how to get it>}` rather than a default for anything a deployment must
supply.

## 5. Create the repository, then push once, green

```bash
gh repo create <org>/<product> --private --source=. --remote=origin --push
gh api -X PATCH /repos/<org>/<product> -f default_branch=develop
```

- **Default branch `develop`**, matching the rest of the parc.
- **The product name carries no `nxgt-` prefix.** `nxgt-*` is the platform layer.
- CI green **on the first push**, which is the point of doing the new repository
  first: everything that follows assumes this one works.

## 6. The removal upstream repairs four kinds of thing

The deletion is the easy half. Budget the rest of the PR for these, in descending
order of how quietly they break:

1. **A cross-service address that is now wrong — and may always have been.** An
   API registry naming `http://localhost:5300/graphql` was already wrong (that app
   was never in the container-sharing config), and the extraction makes it
   unambiguously so. It becomes `http://<product>-api:5300/graphql`, a container
   name on the shared network. Fix it and say in the message that it was already
   broken; a reader otherwise assumes the extraction broke it.
2. **Counts and lists in prose.** "Three UIs exist today", "a five-app change
   across three repositories", the databases list, the compiled-binary list. Every
   one of these is now off by one and no tool checks any of them. Grep the
   directory name **and** the app names across `*.md`.
3. **Skills and docs that scaffold from the departed app.** Their
   `apps/<product>/…` paths are still readable, at a shorter path, in another
   repository. A relocation banner naming the new repository and the new path is
   the whole fix — do not rewrite the examples, and do not delete the skill.
4. **A pattern reference in a code comment.** Dozens of comments name the departed
   app as the reference for a pattern. They stay true; add one paragraph in
   `AGENTS.md` under the directory structure saying where that app went, so the
   comments resolve.

## 7. `git rm` un-hides everything the app's `.gitignore` was hiding

The trap that reads as a regression. `git rm -r apps/<product>` removes the
tracked files **and the app's `.gitignore` files**, while leaving every generated
and installed file on disk — `node_modules`, `dist/`, `src/generated/`,
`.react-router/types/`. Nothing ignores them any more.

Measured: `biome check` went from 4 warnings on the base branch to **2160 errors**
across an extra 1500 files, all of it in generated output, with no source change
in the diff at all.

```bash
git rm -r --quiet apps/<product>
rm -rf apps/<product>          # the untracked remainder, on disk
git add -A
bunx biome check .             # back to the base branch's number
bun run typecheck              # every remaining workspace
```

Then `bun install` — it removes the departed workspaces from `bun.lock`, and that
diff belongs in the PR.

## 8. Both messages carry the numbers

The commit and the PR say: the two repository URLs, the old path → new path for
each app, **how many commits survived**, which product went out migrated and
which went out with debt, and what beyond the deletion changed and why. An
extraction is unreviewable from the diff alone — the diff is a deletion — so the
message is the review.

---

## Checking it

In the new repository:

```bash
git log --oneline -- apps/api | wc -l            # > 1, and predates the repo
bun install && bun run check && bun run typecheck && bun run build
docker compose --profile prod build
gh run list --limit 1                            # green on the first push
```

Upstream, after the removal:

```bash
grep -rn '<product>' --include='*.md' --include='*.ts' --include='*.json' . \
	| grep -v node_modules                        # every hit is deliberate
bunx biome check .                                # the base branch's number
bun run typecheck                                 # every remaining workspace
git diff --stat develop -- bun.lock               # the workspaces are gone
```

And the one that matters most, because nothing else checks it: **start the two
stacks and let the surviving services call the departed one by its new container
name.** A path reference fails at build time; an address fails at the first
request, in someone else's repository.
