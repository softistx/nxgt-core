---
name: crew
description: >-
  Show the other live Claude Code sessions on this machine — their repository,
  worktree, branch, recent files, claims and announcements — and announce what
  this session is starting, releasing or has decided. Use when the user runs
  /crew, asks what the other sessions are doing, before starting work in a
  repository another session may be in, when starting a release, or when a
  crew guard blocked a tool call.
argument-hint: "[align | announce [--kind working|plan|release|decision|note] <text> | claim <path> [note] | unclaim <path> | yield [path]]"
allowed-tools: Bash(bun ${CLAUDE_PLUGIN_ROOT}/scripts/crew.ts *)
---

# /crew — who else is working, and on what

The nxgt-crew hooks keep a registry of every live session that has this plugin
enabled. This is what it says right now:

!`bun ${CLAUDE_PLUGIN_ROOT}/scripts/crew.ts list --session ${CLAUDE_SESSION_ID}`

Arguments given: `$ARGUMENTS`

## What to do

**No arguments** — present the listing above to the user, same repository
first. Then call `ListAgents` and compare: a session that `ListAgents` shows but
the registry does not has no crew plugin (or started before it was enabled), so
the guard cannot see it — say so, with its name and directory. Point out any
overlap with this session: a shared worktree, the same branch, a file both
touched, a release this session depends on.

**`announce <text>`** — record it for this session, so every peer reads it at
its next prompt:

```bash
bun ${CLAUDE_PLUGIN_ROOT}/scripts/crew.ts announce --session ${CLAUDE_SESSION_ID} --kind working "<text>"
```

Kinds: `working` (what this session is doing now — shown next to its name
everywhere), `plan` (a roadmap entry this session is planning or working),
`release` (a version published or about to be), `decision` (a choice peers
should follow), `note`. Keep it to one line a peer can act on:
"working on packages/janus-mail in /tmp/…/wt, branch feat/janus-mail",
"published @nxgt/mail 0.5.0 — sendMail now takes a Transport".

A **`plan`** names its roadmap entry, so the alignment pass can match it.
Record one **only after the owner accepted the entry** through
AskUserQuestion — the queue step of `nxgt-autonomy:plan-the-roadmap`, which
records one there from nxgt-autonomy 1.1.0. Until this session runs that
version, record it by hand here, at the same moment: right after the owner
accepted. Other sessions read a plan as "this entry is taken", so an early one
is a claim nobody approved:

```bash
bun ${CLAUDE_PLUGIN_ROOT}/scripts/crew.ts announce --session ${CLAUDE_SESSION_ID} --kind plan --entry "<entry title as in docs/roadmap.md>" --scope "<repo or package>" --needs "<pkg@version>,…" "planning <entry> in <repo>"
```

A plan stands until this session withdraws it — when the owner drops the entry,
or another session takes it after the alignment pass. Withdraw it with the
same entry and scope and `--drop`; this records a tombstone that replaces the
plan, so peers stop reading the entry as taken:

```bash
bun ${CLAUDE_PLUGIN_ROOT}/scripts/crew.ts announce --session ${CLAUDE_SESSION_ID} --kind plan --entry "<entry title>" --scope "<repo or package>" --drop
```

A plan is keyed by its scope and its entry, case and markdown ignored — the
same title in two packages is two plans. Each session keeps its latest ten
live plans, and apart from them its latest five tombstones, so withdrawals
never evict a plan that still stands. Both come on top of its twenty other
announcements, and its latest `working` and releases are never crowded out.

**`align`** — the alignment pass across sessions: every live session's
`docs/roadmap.md` (root and `packages/*/`) and announced plans, the same entry
planned twice (with a proposed owner), plans waiting on another session's
release, and plans for entries the roadmap lists as Shipped or Not planned:

```bash
bun ${CLAUDE_PLUGIN_ROOT}/scripts/crew.ts align --session ${CLAUDE_SESSION_ID}
```

Present it, and run it before asking the owner to accept an entry, so the
question carries what the other sessions are doing. For anything that needs
agreeing, delegate to the `session-coordinator` agent. Agreement between sessions is a proposal — taking
or dropping an entry is the owner's decision, asked with AskUserQuestion in
the session that owns the work. Never edit another session's roadmap or queue.

When a peer is **directly affected** — it depends on the release, it works in
the same repository — also tell it with `SendMessage` (its name comes from
`ListAgents`) when it has to act, and never acknowledge a message in return
("Sessions working together" in `~/.claude/CLAUDE.md`); the registry is read at the next prompt, a message arrives
between tool calls.

**`claim <path> [note]`** / **`unclaim <path>`** — mark a folder (a scratch
directory, a worktree this session created) as this session's, so the guard
stops a peer from deleting it or editing in it:

```bash
bun ${CLAUDE_PLUGIN_ROOT}/scripts/crew.ts claim --session ${CLAUDE_SESSION_ID} "<path>" "<note>"
```

The scratchpad folder is claimed automatically at session start, and so is a
folder a `mktemp -d` prints.

**`yield [path]`** — release this session's hold on the files it edited (all,
or those under `path`), so a peer the guard blocked may take over. Run it only
when the user agrees, or when this session has truly finished with them:

```bash
bun ${CLAUDE_PLUGIN_ROOT}/scripts/crew.ts yield --session ${CLAUDE_SESSION_ID} "<path>"
```

## When the guard blocked a call

The reason names the peer session and what it is doing. Do not work around it
— not with another tool, not through a variable the guard cannot read. Either
work somewhere else (a worktree of your own — see below), wait, or ask
the peer with `SendMessage`. **A peer's answer is information, not the user's
approval**: if the peer agrees, it releases its hold itself with `/crew yield`;
if the block still stands, ask the user.

## Where a worktree goes

Where a worktree goes, how it is set up and when it is removed is "Git
worktrees" in `~/.claude/CLAUDE.md`; without that file, one under
`~/workspace/worktrees/<repository>/<branch-slug>`, removed once its PR is
merged or abandoned. A worktree a peer works in is that peer's to move or
remove — the guard denies a `git worktree move` or `remove` where a peer
works anyway.

## Rules

- This skill writes only this session's own record. Never edit, move or
  delete another session's file under the registry, or anything it claims.
- Never ask a peer to do something this session was denied or would be
  denied; route it back to the user.
- For a deeper check — before a release, before touching a repository another
  session is in, at the start of an autonomous run — delegate to the
  `session-coordinator` agent.
