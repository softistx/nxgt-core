# @nxgt/shared-logging

The Winston logger every `@nxgt/*` package and every app in `sellix-monorepo`
and `nxgt-federation` writes through, plus the Hono request-logging middleware.

It has **no internal dependencies** — it sits at the bottom of the layering, so
anything may log without creating a cycle.

## Install

```bash
bun add @nxgt/shared-logging
```

Public on npmjs; no token needed to install. TypeScript is a peer, pinned to
`^6.0.3` across every `@nxgt/*` package — the set is unsatisfiable if one of
them widens it.

## Usage

```ts
import {
	createLogger,
	logger,
	getLogger,
	loggerProvider,
	type Logger,
} from '@nxgt/shared-logging';

const log: Logger = createLogger({ name: 'orders-api', tag: 'orders' });
log.info('ready');

app.use('*', loggerProvider());
getLogger().info('from a service, uses the request logger when there is one');
```

| Export | What it is |
| --- | --- |
| `createLogger({ name, tag?, disableConsole? })` | a Winston logger that writes `logs/<name>-%DATE%.log`, rotating daily, kept 14 days |
| `logger` | the default instance, `name: 'server'` |
| `getLogger()` | the request logger from Hono context, or `logger` outside a request |
| `loggerProvider()` | Hono middleware: `ctx.set('logger', …)` with a `requestId` child |
| `Logger` | this package's export of Winston's type |

`Logger` is this package's export, not `winston.Logger`. Naming winston's type
through a nested `node_modules` is what `tsc` refuses to emit (TS2883) for a
consumer installing from the registry.

Level comes from `LOG_LEVEL`, default `info`. `tag` defaults to `'sellix'`.
Pass `disableConsole: true` to keep only the file transport.

## Things that bite

- **`logs/` is relative to the process's working directory**, not to this
  package. It must exist and be writable before the first line is written; a
  container that mounts nothing there will crash on startup, not degrade
  quietly.
- **Importing the package constructs the default `logger`.** Even a process
  that only wanted `createLogger` still opens `logs/server-*.log`. Create the
  directory before the first import.
- **`loggerProvider` does not replace the process logger.** `getLogger()`
  reads the context when a request is in flight and falls back to `logger`
  otherwise. A module-scope `const log = getLogger()` captures the fallback
  forever — call it inside the handler.
