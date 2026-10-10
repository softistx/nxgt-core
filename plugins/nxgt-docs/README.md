# nxgt-docs

Keeps every published package documented for developers: a concise README (the
npm page) and a `docs/` folder with detailed guides, troubleshooting and a
roadmap, never naming a private application.

| part | what it is for |
| --- | --- |
| skill `keep-docs-current` | the bar a package's README and `docs/` are held to after a change to its public surface, and how to reach it |
| agent `documentation-writer` | writes the README and the `docs/guide/` pages, with a working example per point |
| agent `troubleshooting-writer` | writes `docs/troubleshooting.md`: one entry per error a consumer can hit, headed by its exact message |
| agent `roadmap-keeper` | writes and maintains `docs/roadmap.md` — Now, Next, Later, Not planned, Shipped |
| agent `documentation-auditor` | read-only audit of whether a change is documented on the npm page and in `docs/` |
| `Stop` hook | at the end of a turn, blocks once per package when its public surface changed and its documentation did not |

## Enable it

It comes with `nxgt-base`, or on its own at user scope:

```bash
claude plugin install nxgt-docs@nxgt-core --scope user
```

The hook needs `bun` on the `PATH`.

## The Stop gate

`scripts/hooks/stop.ts` runs at the end of every turn. It checks the
repository holding the session's `cwd` and the repositories holding the files
the session edited (the `file_path` of its own Edit, Write and MultiEdit
calls, the `notebook_path` of NotebookEdit; a subagent's edits are not
counted). A linked worktree counts on its own, so work done by absolute path in
`~/workspace/worktrees/<repository>/<slug>` while the `cwd` stays the main
checkout is checked too. It never reads `git worktree list`, which would
include other sessions' worktrees. Changes made through Bash in another
repository are not seen: only the `cwd` and the paths of those four tools count.

In each one it compares the working tree and the branch with the merge-base of
`HEAD` and `origin/develop` (else `origin/main`, else `origin/HEAD`), and looks
at the **published** packages only — a `package.json` not `"private": true`.

**It blocks** when a published package's public surface changed and neither
its README nor a page under its `docs/` did. The public surface is:

- a file under `src/` or `lib/`, except specs, tests and test-only helpers
  (`*.spec.*`, `*.test.*`, `*.fixtures.*`, `*.harness.*`, and anything under
  `__tests__/`, `__fixtures__/`, `test/` or `tests/`);
- a file under a shipped asset directory: `graphql/`, `openapi/`, `schema/`;
- a change to `exports`, `files`, `peerDependencies` or `peerDependenciesMeta`
  in its `package.json` (a version bump is not).

The block names the package, the changed files and what was not touched, and
points at `keep-docs-current`. When the change is not consumer-visible, Claude
says so in one line and finishes.

**It stays silent:**

- **once a package was reported in the session** — it asks once per package
  per session (per repository: the same package in the main checkout and in a
  worktree are two), so a long session is not interrupted on every edit;
- **while a `documentation-auditor` run is pending** — launched in the
  background, with no completion notification yet in the transcript;
- outside a git repository, with no published package touched, and on the stop
  the hook itself caused (`stop_hook_active`).

What it does **not** do:

- **It calls no model.** One read of the transcript and local `git` calls
  only (`--no-optional-locks`, so it never takes `index.lock`), no network:
  the latest 200 edited paths are considered, at most 50 directories are
  resolved to a repository (one `git rev-parse` each), and at most 10
  repositories are checked, a few `git` calls each (`merge-base`, `status`,
  `diff`, a `show` per changed manifest).
- **It fails open.** An error or unreadable input lets the turn end as if the
  hook were absent: it exits 0 and prints nothing. An unreadable transcript
  only means no pending auditor and no edited files are seen, so the `cwd`
  repository alone is checked.
- **It writes no documentation.** It only says what is missing; the skill and
  the agents do the writing.

The packages already reported live in one small JSON file per session under
the system temporary folder (`$TMPDIR/nxgt-docs`); `NXGT_DOCS_STATE_DIR`
overrides it, which is what the specs use.

## Opting out

`NXGT_DOCS_DISABLE=1` (or `true`) turns the hook off; the skill and the agents
stay available. Installed through `nxgt-base`, the plugin cannot be disabled on
its own, so set it in the `env` block of `~/.claude/settings.json` (or a
project's `.claude/settings.json`):

```json
{ "env": { "NXGT_DOCS_DISABLE": "1" } }
```

## Developing it

```bash
bun test ./plugins/nxgt-docs/   # this plugin's specs
bun run test:plugins            # every plugin's specs
bun run typecheck:plugins       # plugins/tsconfig.json: every plugin's scripts at once
claude plugin validate plugins/nxgt-docs
```

The pure core is under `scripts/lib/`: what counts as surface
(`surface.ts`), which packages have a gap (`gaps.ts`), the transcript facts
(`transcript.ts`), the block text (`reason.ts`) and the session state
(`state.ts`). `repo.ts` holds the `git` calls, and the hook script is only the
shell around them (`scripts/lib/hook.ts`). `stop.spec.ts` spawns it the way
Claude Code does, with the event on stdin, against scratch repositories.
