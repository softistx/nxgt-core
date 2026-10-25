# nxgt-economy

Token economy as the default of every Claude Code session: the main session
runs on the strongest model, and light work is delegated to lighter ones
through the Agent tool's `model` parameter.

| part | what it does |
| --- | --- |
| `SessionStart` hook | puts the rule below in context at the start of every session |
| `PreToolUse` hook, matcher `Agent` | when an agent is spawned without a `model` (and is not a fork), adds a one-line reminder naming the model it will run on; a `Plan` agent without a model is reminded to pass `opus`, and a `code-reviewer` without one to pass `opus` (deep review) or `sonnet` (small diff, slice into `feat/*`, docs or spec check) |

## Install

It comes with `nxgt-base`, or on its own at user scope:

```bash
claude plugin install nxgt-economy@nxgt-core --scope user
```

The hooks need `bun` on the `PATH`.

## The rule

Haiku for read-only lookups and mechanical code, sonnet for ordinary code and the
reviews it can do, opus passed explicitly for plans, the other reviews and
decisions costly to undo; the full text is in `scripts/lib/economy.ts`. Opus plans and
reviews, Sonnet and Haiku write the code, per "Token economy" in
`~/.claude/CLAUDE.md`, which the hook cites.

## Make sonnet the subagent default

Subagents inherit the main model unless told otherwise. Set this in
`~/.claude/settings.json`:

```json
{ "env": { "CLAUDE_CODE_SUBAGENT_MODEL": "sonnet" } }
```

When the variable is unset, the `SessionStart` hook says so.

## Agents pin their own model

Every agent of this marketplace pins a `model:` in its frontmatter by the same
rule: `opus` for a reviewer, a planner or a decision costly to undo
(`code-reviewer`, `improvement-scout`, `queue-refiller`,
`unanswered-question-resolver`), `sonnet` for the rest. A pin beats
`CLAUDE_CODE_SUBAGENT_MODEL`, and a `model` passed on the Agent call beats the
pin.

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
