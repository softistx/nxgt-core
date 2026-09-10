# @nxgt/shared-logging

The Winston logger every `@nxgt/*` package and every app in `sellix-monorepo`
and `nxgt-federation` writes through, plus the Hono request-logging middleware.

It has **no internal dependencies** — it sits at the bottom of the layering, so
anything may log without creating a cycle.

```ts
import { createLogger, logger, type Logger } from '@nxgt/shared-logging';

const log: Logger = createLogger({ name: 'orders-api', tag: 'orders' });
```

`Logger` is this package's export, not `winston.Logger`. Naming winston's type
through a nested `node_modules` is what `tsc` refuses to emit (TS2883) for a
consumer installing from the registry.

## Things that bite

- **`logs/` is relative to the process's working directory**, not to this
  package. It must exist and be writable before the first line is written; a
  container that mounts nothing there will crash on startup, not degrade
  quietly.
- **Importing the package constructs a default `logger`** named `server`. Even
  a process that only wanted `createLogger` still opens `logs/server-*.log`.
  Create the directory before the first import, or the default logger is the
  crash.
- Level comes from `LOG_LEVEL`, default `info`.

## Install

```bash
bun add @nxgt/shared-logging
```

Public on npmjs; no token needed to install. TypeScript is a peer, pinned to
`^6.0.3` across every `@nxgt/*` package — the set is unsatisfiable if one of
them widens it.
