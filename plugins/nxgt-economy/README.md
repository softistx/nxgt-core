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

Haiku for mechanical and read-only work, sonnet for ordinary implementation, opus
passed explicitly for architecture and costly mistakes; the full text is in
`scripts/lib/economy.ts`.

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

`NXGT_ECONOMY_DISABLE=1` (or `true`) in the environment turns both hooks off. Installed through `nxgt-base`,
the plugin cannot be disabled on its own, so set it in the `env` block of `~/.claude/settings.json`
(or a project's `.claude/settings.json`):

```json
{ "env": { "NXGT_ECONOMY_DISABLE": "1" } }
```
