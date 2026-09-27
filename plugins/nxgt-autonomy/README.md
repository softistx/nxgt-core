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
- Work the queue (the work-queue.md memory file) to completion. When it runs dry, run the improvement-scout, then nxgt-autonomy:plan-the-roadmap. Never start work the queue does not approve.
- Owner decisions go through AskUserQuestion, recommended option first and labelled "(Recommended)" or "(Recommandé)". Do all the work that does not depend on the answer before asking.
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
bun run typecheck:plugins
claude plugin validate plugins/nxgt-autonomy
claude --plugin-dir plugins/nxgt-autonomy -p "say what mode you are in"   # from inside a git repository
```

The pure core — the mandate, the opt-out, the git-repository check — is in
`scripts/lib/mandate.ts` and takes every input as an argument. The hook
script is only the shell around it (`scripts/lib/hook.ts`), and
`session-start.spec.ts` spawns it the way Claude Code does, with the event on
stdin.
