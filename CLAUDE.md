# CLAUDE.md

This file exists so Claude Code picks up this repository's agent instructions.
It deliberately holds no guidance of its own.

## Read AGENTS.md first

**[AGENTS.md](./AGENTS.md) is the single source of truth.** Everything that
applies to any coding agent working here lives there — the layering and the
no-cycles rule, why declarations are the hard part of the build, the traps that
have already cost time (star re-exports below an entry point, `link:` in a
published manifest, the pinned `typescript` peer, the absent `.npmrc`), how
releasing works, and the table of duplications that are deliberate and must not
be "cleaned up".

## Skills

`.claude/skills/*/SKILL.md`:

- **`release-a-package-change`** — load it before editing anything under
  `packages/`. A change here is not done when it compiles; it is done when it
  is released and the consumer is bumped.

## Related repositories

`sellix-monorepo` and `nxgt-federation` consume every package here from the
public npm registry, with no token and no registry configuration. Their
`AGENTS.md` files carry the import rule (`Types`, `ObjectId`, `Connection` come
from `@nxgt/shared-mongo`, never from `mongoose`), which this split did not
change. Keep the three in step by hand.

`@nxgt/material`, `@nxgt/map` and `stx-sdk` are **not** published anywhere and
are consumed through `link:`. `@nxgt/material` in particular stays private for
licence reasons — it vendors Font Awesome Pro assets.

## Keeping it that way

Add new agent guidance to `AGENTS.md`, never here. This file should only ever
grow content that is genuinely Claude Code-specific — skills, slash commands,
hooks, or settings that would make no sense to a different agent.
