# @nxgt/shared-logging

The Winston logger every `@nxgt/*` package and every app in `sellix-monorepo`
and `nxgt-federation` writes through, plus the Hono request-logging middleware.

It has **no internal dependencies** — it sits at the bottom of the layering, so
anything may log without creating a cycle.

Log files rotate daily under `logs/` **relative to the process's working
directory**. That directory must exist and be writable before the first line is
written; a container that mounts nothing there will crash on startup, not
degrade quietly.

## Install

```bash
bun add @nxgt/shared-logging
```

Public on npmjs; no token needed to install. TypeScript is a peer, pinned to
`^6.0.3` across every `@nxgt/*` package — the set is unsatisfiable if one of
them widens it.
