---
name: adopt-a-released-fix
description: >-
  Adopt a fix an in-house package has released for a problem this application
  reported: bump the package, remove the `Temporary, until <pkg>#<n>`
  workarounds, run the repository's green bar, open the PR and close the
  tracking issue. Use when the SessionStart context lists "fixes released
  upstream, ready to adopt", when a `Temporary, until` marker is found whose
  upstream issue is closed, when `file` answers "released: #n reported this",
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
waited for a released fix. Exit 1 only says some marker is flagged. Also handle
the others the report shows:

- `untracked`: no tracking issue links that upstream issue; ask the user, do not remove it;
- `unresolvable`: the reference is wrong or the repository is gone; fix the marker or ask.

## 3. Bump, remove, verify

1. Bump the package to `version` in every `package.json` that declares it and
   refresh the lockfile with the repository's package manager (`bun add
   <package>@<version>` in a Bun workspace).
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

Open the PR (title `fix: Adopt <package>@<version>`; body: what was removed,
the green bar, and the tracking issue number). Once it exists, close the
tracking issue with the PR number:

```bash
gh issue comment <tracking> --body "Adopted in #<PR>."
gh issue close <tracking>
```

The tracking issue lives in this repository, which is private; nothing here
goes on the upstream issue. A public repository never has a tracking issue
(see `report-to-upstream`): there, only the markers and the bump apply.

## 5. Report

Tell the user the PR, the package and version, the markers removed, and the
tracking issues closed.
