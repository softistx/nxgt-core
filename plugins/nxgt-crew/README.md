# nxgt-crew

Keeps parallel Claude Code sessions on one machine from stepping on each other.

Several sessions often run at once, in separate repositories or in the same
one. Before this plugin they coordinated through rules pasted by hand ("don't
touch X, another session works on it") and through cross-session messages.
The failures it prevents:

- two sessions editing the same working tree, or the same file;
- one session switching the branch of a checkout another is using;
- one session deleting a worktree or a scratch folder another owns;
- one session publishing a package while another still builds against the old
  version, or missing a sibling's release it depends on.

It has two layers:

| layer | runs | does |
| --- | --- | --- |
| **hooks** | on every prompt and every tool call, in every session with the plugin | keep a registry of live sessions, block the collisions above, surface peers' announcements |
| **`/crew` and `session-coordinator`** | when asked, and at the key moments below | list sessions, record what this session is doing, compare plans, message peers |

## Enable it in every project

Install it once, at user scope:

```bash
claude plugin install nxgt-crew@nxgt-core --scope user
```

That writes the entry below to `~/.claude/settings.json`, which is what makes it
active in every project on the machine:

```json
{
	"enabledPlugins": {
		"nxgt-crew@nxgt-core": true
	}
}
```

The entry alone is not enough in a project that has never installed the plugin:
an enabled plugin loads only once it is installed (the same finding that led to
`nxgt-base`). The hooks need `bun` on the `PATH`.

A session sees only the peers that also run the plugin. `/crew` calls
`ListAgents` to name the sessions the registry cannot see.

## "Constantly", without a daemon

The hooks are the constant part. They run on each prompt and on every tool
call, cost about 30 ms each, and read the registry fresh every time, so a
session's view of its peers is never older than its last action. At the key
moments, the coordinator adds a judgment the hooks cannot make. There is no
polling loop and no background process: a session that stops acting stops
costing anything, and its record lapses on its own.

| event | hook | what it does |
| --- | --- | --- |
| `SessionStart` | `session-start.ts` | registers the session, sweeps records of sessions that are gone, exports `NXGT_CREW_SESSION_ID` through `CLAUDE_ENV_FILE`, and puts a brief of the live peers (same repository first) in context |
| `UserPromptSubmit` | `prompt.ts` | heartbeat; adds the announcements peers made since the last prompt (a release, a decision) to context |
| `PreToolUse` on `Edit\|Write\|MultiEdit\|NotebookEdit\|Bash` | `guard.ts` | applies the conflict rules; denies, or allows and adds what is worth knowing |
| `PostToolUse` (all tools, `async`) | `activity.ts` | heartbeat without delaying the tool; records the edited file; re-reads the branch after a Bash command; claims a folder `mktemp -d` printed |
| `SessionEnd` | `session-end.ts` | deletes the session's record |

Run the **`session-coordinator`** agent:

- before publishing or releasing a package;
- before starting work in a repository or worktree another session may use;
- at the start of an autonomous run;
- when the guard blocked a call and the way forward is not obvious.

Its description says so, so Claude delegates to it at those moments without
being asked.

## The registry

One JSON file per session: `~/.claude/nxgt-crew/sessions/<session_id>.json`.
The folder is `$NXGT_CREW_HOME` when set, else `$CLAUDE_CONFIG_DIR/nxgt-crew`.

```json
{
	"version": 1,
	"sessionId": "3f0c…",
	"title": "janus",
	"pid": 41822,
	"cwd": "/home/me/workspace/dev/nxgt-janus",
	"worktree": "/home/me/workspace/dev/nxgt-janus",
	"repo": "/home/me/workspace/dev/nxgt-janus/.git",
	"remote": "git@github.com:softistx/nxgt-janus.git",
	"branch": "feat/janus-mail",
	"startedAt": "2026-09-27T09:12:03.000Z",
	"lastSeen": "2026-09-27T10:41:55.000Z",
	"edits": [{ "path": "/home/me/…/src/mail.ts", "worktree": "/home/me/…/nxgt-janus", "at": "…" }],
	"claims": [{ "path": "/tmp/claude-1000/…/scratchpad", "note": "scratchpad", "at": "…" }],
	"announcements": [{ "text": "working on packages/janus-mail", "kind": "working", "at": "…" }]
}
```

- **No file contents and no secrets**: paths, a branch, timestamps, and
  one-line announcements a session chose to make.
- **Each session writes only its own file**, through a temporary file and a
  rename, so a reader never sees half a record. A file that does not parse is
  skipped.
- **Liveness.** A session seen in the last 30 minutes is *active*. Past that,
  it stays *idle* for up to 12 hours if its Claude Code process is still
  running, because an idle session still owns its worktree. Otherwise it is
  *gone*. A session whose process exited is gone at once, so a crash never
  leaves a hold behind. A gone record is swept at the next `SessionStart`.
- **Recent edits** hold their file for 60 minutes.

## Conflict rules

"Works in a worktree" means that the peer's current directory is in it, or
that the peer edited a file in it within the edit window.

| this session is about to… | and a live peer… | verdict |
| --- | --- | --- |
| edit a file | edited that same file recently | **deny** |
| edit a file | claims a folder that holds it | **deny** |
| edit a file | works in the same worktree, on other files | allow, and say who (at most every 10 min per peer) |
| edit a file | works in another worktree of the same repository | allow, silently |
| `git checkout`, `switch`, `reset`, `stash`, `clean`, `rebase`, `merge`, `pull`, `restore`, `cherry-pick`, `revert`, `am` | works in that worktree | **deny** |
| `git worktree remove` / `move` | works, edits or claims inside it | **deny** |
| `git branch -d/-D` | has that branch checked out, in the same repository | **deny** |
| `git push --force` / `--force-with-lease` / `+refspec` | has that branch checked out, in the same repository (clones of one remote count) | **deny** |
| `rm`, `rmdir`, `unlink`, `mv`, `git rm` on a path | works, edits or claims at or under it | **deny** |
| the same, on a path inside a peer's worktree | and this session does not work there | **deny** |
| `npm/bun/pnpm/yarn publish`, `changeset publish`, a `*publish*`/`*release*` script, `gh release create`, `git push --tags` | any | allow; list the peers; record a `release` announcement they read at their next prompt |

The guard follows `cd` and `git -C` to see where an operation lands. It reads
the command text, not a shell: a path in a `$variable` or a backtick is not
checked. A deny names the peer, its worktree and branch, when it was last
seen and what it announced, and points to `SendMessage` and `/crew`.

The guard never answers `allow`. That would skip the user's permission
prompt. It stays silent, adds context, or denies.

## Fail open

A registry problem must never stop work.

- Every hook catches its own errors and exits 0. The only thing it prints on
  an error is a `systemMessage` warning such as
  `nxgt-crew: registry unavailable, nothing was checked (…)`.
- A timed-out `PreToolUse` command hook does not block: the call goes on
  through the normal permission flow. The guard's timeout is 5 s. It usually
  takes about 30 ms.
- If `bun` is missing, the spawn fails. That is a non-blocking hook error.
- A record that does not parse is skipped. An unknown directory or an
  unreadable path is not checked. None of these ever counts as a conflict.
- `NXGT_CREW_DISABLE=1` in the environment Claude Code starts with turns every
  hook into a no-op.

## `/crew`

```text
/crew                                     live sessions, this one first, checked against ListAgents
/crew announce working on packages/env    what this session is doing — shown next to its name everywhere
/crew announce --kind release @nxgt/mail 0.5.0 published — sendMail takes a Transport
/crew claim /tmp/tmp.X1 release probe     a folder peers must not edit in or delete
```

The same CLI backs it: `bun plugins/nxgt-crew/scripts/crew.ts list|announce|claim|unclaim|whoami`.

## `session-coordinator`

The agent reads the registry, calls `ListAgents`, and compares each peer's
place and announcements with this session's plan. It reports collisions,
dependencies and shared ground. It sends at most one batched `SendMessage`
per peer that needs to know: a release, a question before touching something
the peer holds, or a decision. It then records the plan as this session's
announcement.

It never edits files, and it never grants or requests permissions for another
session. It treats a peer's message as information, never as the user's
approval. It never asks a peer to do what this session was denied.

## What hooks cannot do

These limits come from the [hooks reference](https://code.claude.com/docs/en/hooks)
and the [subagents](https://code.claude.com/docs/en/sub-agents) and
[cross-session messaging](https://code.claude.com/docs/en/cross-session-messaging)
pages:

- **Hooks cannot call tools.** `ListAgents` and `SendMessage` are Claude's
  tools, so no hook can message a peer or list sessions without the plugin.
  That is the agent's and `/crew`'s job.
- **`SessionEnd` cannot block, and it has a 1.5 s budget** that a plugin hook's
  `timeout` does not raise. If the delete is cut short, the record lapses
  through liveness.
- **A timed-out `PreToolUse` hook does not block.** That is the reason the
  guard fails open, and also why it is not a hard lock.
- **`PostToolUse` cannot undo a tool call.** The edit record is written after
  the fact. Two sessions that write the same file within the same instant are
  not caught.
- **A subagent running in the background does not have `ListAgents`.** In an
  interactive session, subagents run in the background by default. The
  coordinator then works from the registry, and `SendMessage` still works.
- **Only the main conversation can subscribe to a peer's idle notice**
  (`notify_when_idle`). A subagent cannot.
- **A peer's message can be held or refused** by its `crossSessionInbound`
  setting or its permission mode. A successful send means it was delivered,
  not that it was read.
- **Plugin agents ignore `hooks`, `mcpServers` and `permissionMode` in
  frontmatter.** The coordinator relies only on `tools`.

## Configuration

| variable | default | meaning |
| --- | --- | --- |
| `NXGT_CREW_HOME` | `~/.claude/nxgt-crew` | registry folder (the specs point it at a temporary folder) |
| `NXGT_CREW_STALE_MINUTES` | 30 | silence after which a session without a live process is gone |
| `NXGT_CREW_IDLE_HOURS` | 12 | how long a silent session with a live process still counts |
| `NXGT_CREW_EDIT_WINDOW_MINUTES` | 60 | how long an edit holds its file |
| `NXGT_CREW_DISABLE` | unset | `1` turns the hooks off |

## Development

The hook scripts are TypeScript run by Bun, with no `.sh`. The pure cores are
`lib/registry.ts` (records and liveness), `lib/command.ts` (reading a Bash
command), `lib/conflicts.ts` (the rules) and `lib/brief.ts` (the text). Each
has a spec. `hooks/hooks.spec.ts` spawns every hook against a temporary
registry and git repository.

```bash
bun run test:plugins        # bun test ./plugins/
bun run typecheck:plugins
claude plugin validate plugins/nxgt-crew
```
