# CLAUDE.md

This file exists so Claude Code picks up this repository's agent instructions.
It deliberately holds no guidance of its own.

## Read AGENTS.md first

**[AGENTS.md](./AGENTS.md) is the single source of truth.** Everything that
applies to any coding agent working here lives there — the layering and the
no-cycles rule, why declarations are the hard part of the build, the traps that
have already cost time (star re-exports below an entry point, requiring a peer
that is on no registry, the pinned `typescript` peer, the absent `.npmrc`), how
releasing works, and the table of duplications that are deliberate and must not
be "cleaned up".

## Skills

**This repository is the marketplace.** The skills the four repositories share
live under `plugins/`, not in `.claude/skills/`, and every repository — this one
included — consumes them by enabling the plugin in its own committed
`.claude/settings.json`. Authored once, versioned once; nothing is copied.

| plugin | skills |
| --- | --- |
| `nxgt-workflow` | `large-feature-branch-workflow`, `write-a-repo-script` |
| `nxgt-package` | `create-a-package`, `release-a-package-change` |

Do not list them here by hand. Each `SKILL.md` carries its own `description` in
frontmatter, which is what decides when it fires, and `claude plugin details
<name>` prints the inventory and its token cost. A prose copy of that is a copy
that goes stale — which is the whole reason these moved.

Adding a skill that is genuinely only about this repository still means
`.claude/skills/<name>/SKILL.md`, which takes precedence over anything a plugin
provides. Adding one the other repositories should have means `plugins/`, and a
version bump in `.claude-plugin/marketplace.json`.

`large-feature-branch-workflow` carries a `references/<repo>.md` per repository
for what genuinely differs — the green bar, the sequencing, the access surface
a deep review must check. `references/nxgt-core.md` is this one's.

## Related repositories

`sellix-monorepo` and `nxgt-federation` consume every package here from the
public npm registry, with no token and no registry configuration. Their
`AGENTS.md` files carry the import rule (`Types`, `ObjectId`, `Connection` come
from `@nxgt/shared-mongo`, never from `mongoose`), which this split did not
change. Keep the three in step by hand.

`stx-sdk` is published to the public npm registry and is a required peer of
`@nxgt/shared-hono` and `@nxgt/shared-graphql`. `@nxgt/material` and
`@nxgt/map` are **not** published anywhere and are consumed through `link:`;
`@nxgt/material` in particular stays private for licence reasons — it vendors
Font Awesome Pro assets.

## Keeping it that way

Add new agent guidance to `AGENTS.md`, never here. This file should only ever
grow content that is genuinely Claude Code-specific — skills, slash commands,
hooks, or settings that would make no sense to a different agent.
