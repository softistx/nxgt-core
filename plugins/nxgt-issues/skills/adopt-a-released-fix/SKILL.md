---
name: adopt-a-released-fix
description: >-
  Adopt a fix an in-house package has released for a problem this application
  reported: bump the package, remove the `Temporary, until <pkg>#<n>`
  workarounds, run the repository's green bar, open the PR and close its
  tracking issue. Use when the SessionStart context lists "fixes released
  upstream, ready to adopt", when a `Temporary, until` marker is found whose
  upstream issue is closed **and** released, when `file` answers "released: #n reported this",
  or when asked what workarounds can go.
allowed-tools: Bash(bun ${CLAUDE_PLUGIN_ROOT}/scripts/issues.ts *)
---

# Adopt a released fix

The package side fixed what this application reported and published it; the
application now drops its workaround. Every command runs from the application's
checkout (or takes `--cwd <dir>`). The work is one branch, one PR, in its own
worktree as `~/.claude/CLAUDE.md` asks.

## 1. What is ready

```bash
bun ${CLAUDE_PLUGIN_ROOT}/scripts/issues.ts ready --json
```

Each entry is a tracking issue of this repository whose upstream issue is
closed **and** labelled `released`: `{ tracking, title, upstream, package?,
version? }`. `package` and `version` come from the release step's `Fixed in
<package>@<version>` comment; without them (the last comment is something
else), read the upstream issue (`gh issue view <n> --repo <owner/repo>`) or the
registry for the version that contains the fix. `[]` means nothing to adopt:
stop. Take one entry at a time, or several that share a package.

The cache is 10 minutes old at most; a refresh is two `gh` calls. Exit 2/5/6
mean a foreign origin, a rate limit or a gh failure: tell the user, do not
retry in a loop.

## 2. Find the workarounds

```bash
bun ${CLAUDE_PLUGIN_ROOT}/scripts/issues.ts markers --json
```

The entries with `"status": "ready"` are the markers (`file`, `line`) that
waited for a released fix. Exit 1 only says some marker is flagged (stdout that
is not JSON is a failure: exit 2 is a foreign origin, 5 a rate limit, 6 a gh or
git failure; tell the user, do not retry in a loop). `--exclude <pathspec>`
(repeatable) skips fixtures and docs examples. Also handle the others the
report shows:

- `untracked`: no open tracking issue links that upstream issue (it may have been
  closed early); ask the user, do not remove the marker;
- `unresolvable`: the reference is wrong or the repository is gone; fix the marker or ask.

**A public application has no tracking issues** (they would tie it to the
anonymous report): `ready --json` is `[]` there, and `markers` reads the
upstream issue directly. It adopts from the markers alone: `ready` markers
carry `version` when the release comment is there, otherwise read
the upstream issue or the registry.

## 3. Bump, remove, verify

1. Bump the package only when the installed or declared version is older than
   `version` (never downgrade). Edit the range in each `package.json` that
   declares it, then run `bun install` to refresh the lockfile (not `bun add`
   at a workspace root).
2. For each `ready` marker, open the file at `line`: delete the marker comment
   **and** the workaround it marks (the code that exists only because of the
   defect), restoring the direct use of the package. Never remove a marker
   whose upstream issue is not the adopted one.
3. Run `bun ${CLAUDE_PLUGIN_ROOT}/scripts/issues.ts markers`; the adopted issue must
   no longer appear.
4. Run the repository's green bar (its `AGENTS.md`: `verify`, typecheck, lint,
   tests). If the bug survives the bump, stop: restore the workaround and
   marker, and report it again with `file --new` (see `report-to-upstream`).

## 4. PR and close

Open the PR, titled and committed by the repository's own convention (say what
was adopted: `<package>@<version>`). The body lists what was removed, the green
bar, and `Closes #<tracking>` for each tracking issue. That closes them at
the merge only when the PR targets the repository's default branch; for any
other base, close each by hand (`gh issue close <tracking>`) after the merge.
Then comment on each:

```bash
gh issue comment <tracking> --body "Adopted in #<PR>."
```

Closing at the merge, not before, keeps the tracking issue open until the
workaround is really gone. The tracking issue lives in this repository, which is
private; nothing here goes on the upstream issue.

## 5. Report

Tell the user the PR, the package and version, the markers removed, and the
tracking issues closed.
