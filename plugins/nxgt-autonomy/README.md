# nxgt-autonomy

Autonomy as the default operating mode of every Claude Code session in a git
repository: work the queue to completion, plan the roadmap when it runs dry,
and ask the owner only what only the owner can decide.

| part | what it is for |
| --- | --- |
| `SessionStart` hook | puts the mandate below in context at the start of every session in a git repository |
| skill `work-autonomously` | the loop: one item, one branch, one PR — reviewed, documented, merged |
| skill `plan-the-roadmap` | the planning cycle that refills the queue from candidates and roadmap entries, in eight steps; with `nxgt-crew` enabled, it aligns with other sessions (`/crew align`) and records accepted entries (`/crew announce --kind plan`) |
| agent `work-queue-auditor` | reconciles the queue with `git log` and `gh pr list`, and the roadmaps with the queue; says what remains |
| agent `improvement-scout` | proposes improvements into the queue, applies none |
| agent `green-bar-verifier` | refuses to call anything done that was not measured |
| agent `queue-refiller` | when the queue is empty and the owner said to keep going: reconciles it with `git` and `gh`, sweeps for improvements and features, and writes the top items into it — under *In flight* only when the owner pre-approved recommendations and the item is reversible; names the sibling sessions that look idle. Edits the queue file only |
| agent `unanswered-question-resolver` | when a question came back unanswered after 5 minutes: takes the recommended option if it is reversible and inside the mandate, otherwise waits with a holding step, and records the decision under *Assumed, not answered*. Edits the queue file only |

## Enable it

It comes with `nxgt-base`, or on its own at user scope:

```bash
claude plugin install nxgt-autonomy@nxgt-core --scope user
```

The hook needs `bun` on the `PATH`.

## The mandate

At `startup`, `resume`, `clear` and `compact` — the hook has no matcher, so it
runs on every [`SessionStart`](https://code.claude.com/docs/en/hooks#sessionstart)
source — `scripts/hooks/session-start.ts` returns the mandate as
`hookSpecificOutput.additionalContext`, which Claude Code adds to Claude's
context before the first prompt:

```text
nxgt-autonomy: autonomous mode is the default for this session. The skill nxgt-autonomy:work-autonomously details it; NXGT_AUTONOMY_DISABLE=1 turns it off.
- Work the queue (the work-queue.md memory file) to completion. When it runs dry, run the queue-refiller if the owner said to keep going, else the improvement-scout, then nxgt-autonomy:plan-the-roadmap. Never start work the queue does not approve.
- Owner decisions go through AskUserQuestion, recommended option first and labelled "(Recommended)" or "(Recommandé)". Do all the work that does not depend on the answer before asking. A question that returns unanswered after 5 minutes (askUserQuestionTimeout "5m") goes to the unanswered-question-resolver.
- An irreversible or outward-facing action — deleting data, force-pushing, a first publish of a package, spending money, messaging anyone off this machine — waits for the owner's explicit answer; carry on with other work meanwhile.
- Never end a turn by handing back or waiting.
- Every PR goes through nxgt-review:review-before-a-pr, then nxgt-docs:keep-docs-current. Merges and releases follow the repository's AGENTS.md.
```

The text lives in `buildMandate()`, in `scripts/lib/mandate.ts`; a spec fails
when this copy no longer matches it.

What the hook does **not** do:

- **It changes no permission and no mode.** It only adds context; auto mode,
  allow rules and prompts are exactly what the session had.
- **It never blocks.** It exits 0 whatever happens. An error it catches becomes
  a one-line `systemMessage`; a crash of `bun` itself is a non-blocking hook
  error, and the session starts without the mandate.
- **It prints nothing outside a git repository.** There is no queue to work
  and no PR to open in a scratch folder. The check walks up from `cwd` looking
  for `.git` (a directory, or a worktree's file) without spawning `git`.

## A question nobody answers

The owner's rule is that a question left unanswered for **5 minutes** is
taken on its recommendation — when that can be undone. The trigger is a
Claude Code setting, not this plugin:

```json
{ "askUserQuestionTimeout": "5m" }
```

It is `/config` → *Question auto-continue timeout* (`"60s"`, `"5m"`, `"10m"`
or `"never"`; the default is `"never"`). With it, a question left idle for 5
minutes ends and `AskUserQuestion` returns with no answer; the session then
runs `unanswered-question-resolver`, which takes the recommended option only
if it is reversible and inside the mandate, and records it under *Assumed,
not answered* at the top of the queue. The next report leads with those
lines.

**Without the setting, nothing fires.** `AskUserQuestion` blocks the turn
until it is answered, so no timer, background command or scheduled wake-up
can act meanwhile. The plugin does not change the setting — the loop reads
it and, when it is not `"5m"`, asks the owner to set it.

## Opting out

```bash
NXGT_AUTONOMY_DISABLE=1 claude
```

`1` or `true` turns the hook off for that session. The skills and agents stay
available; they are just no longer the default.

## Where things live

| what | where |
| --- | --- |
| the queue | `~/.claude/projects/<project>/memory/work-queue.md` — one per project, the owner's memory file for the project the session runs in; an item may name several repositories |
| a roadmap | `docs/roadmap.md` of each published package, kept by `nxgt-docs`'s `roadmap-keeper` |

## Developing it

```bash
bun run test:plugins        # the specs: mandate.spec.ts and session-start.spec.ts
bun run typecheck:plugins   # plugins/tsconfig.json: every plugin's scripts at once
claude plugin validate plugins/nxgt-autonomy
claude --plugin-dir plugins/nxgt-autonomy -p "say what mode you are in"   # from inside a git repository
```

`plugins/nxgt-autonomy/tsconfig.json` is not what `typecheck:plugins` runs —
that is `plugins/tsconfig.json`, over `*/scripts/**/*.ts`. It is kept for
editors, so opening a file here resolves Bun's types without the root config.

The pure core — the mandate, the opt-out, the git-repository check — is in
`scripts/lib/mandate.ts` and takes every input as an argument. The hook
script is only the shell around it (`scripts/lib/hook.ts`), and
`session-start.spec.ts` spawns it the way Claude Code does, with the event on
stdin.
