# nxgt-economy

Token economy as the default of every Claude Code session: the main session
runs on the strongest model, and light work is delegated to lighter ones
through the Agent tool's `model` parameter.

| part | what it does |
| --- | --- |
| `SessionStart` hook | puts the rule below in context at the start of every session |
| `PreToolUse` hook, matcher `Agent` | when an agent is spawned without a `model` (and is not a fork), adds a one-line reminder naming the model it will run on |

## Install

It comes with `nxgt-base`, or on its own at user scope:

```bash
claude plugin install nxgt-economy@nxgt-core --scope user
```

The hooks need `bun` on the `PATH`.

## The rule

- `haiku`: mechanical and read-only work — locating a file, symbol or log line; reading a log or CI output and reporting what failed; one question to a docs page; polling a status; listing, counting, comparing; a rename or one-line fix with an exact spec.
- `sonnet`: implementation from a clear plan, writing or fixing specs, documentation, read-only review of a small diff, a multi-file search that needs judgement.
- `opus`, passed explicitly: architecture and plans, a hard bug of unknown cause, the review before a PR into develop, anything costly to undo.
- Don't spawn an agent for a single lookup one command does. Run independent agents in parallel with self-contained prompts. Don't re-read a file you just edited. Never dump a whole log or transcript into context.

The text lives in `scripts/lib/economy.ts`.

## Make sonnet the subagent default

Subagents inherit the main model unless told otherwise. Set this in
`~/.claude/settings.json`:

```json
{ "env": { "CLAUDE_CODE_SUBAGENT_MODEL": "sonnet" } }
```

When the variable is unset, the `SessionStart` hook says so.

## What it does not do

- It changes no permission and no tool input, and never blocks a call: the
  `PreToolUse` hook returns only `hookSpecificOutput.additionalContext`, with
  no `permissionDecision` and no `updatedInput`.
- It fails open: an error prints a `systemMessage`, and the hook exits 0.

## Opt out

`NXGT_ECONOMY_DISABLE=1` (or `true`) in the environment turns both hooks off.
