# The error handler

`createErrorHandler(translate, options?)` is the `app.onError` handler: it
turns whatever a route throws into a JSON body, and logs it.

```ts
import { createErrorHandler } from '@nxgt/shared-hono';
import { translate } from '@nxgt/i18n';

app.onError(createErrorHandler(translate));
```

## What a client receives

| thrown | status | `message` | `debugMessage`, only in development and test |
| --- | --- | --- | --- |
| `CustomException` | its `code` | `translate(message, options)` | its `debugMessage` |
| `HTTPException` | its `status` | its `message`, as is | its stack |
| any other `Error` | 500 | `translate('errors.internal-server-error')` | its `message` |

Every body also carries `status`, the same number as the response's, and
`timestamp`.

An `HTTPException`'s `message` and a `CustomException`'s message key reach the
client in every environment, production included (a key the translator does
not know is sent as written). Never build either from internal detail such as
another error's `message`; put that in `debugMessage`.

## Each environment

The handler reads the raw `NODE_ENV`, once, when the package is first
imported. Changing `process.env.NODE_ENV` afterwards has no effect. The package
accepts `development`, `test` and `production` and throws at import for any
other value (see [troubleshooting](../troubleshooting.md)).

**The detail is opt-in: the handler is secure by default.** It answers with
`debugMessage` only when `NODE_ENV` is explicitly `development` or `test`. An
**unset `NODE_ENV` answers as `production` does**, with no detail. This is
deliberately not the package's `env.NODE_ENV`, which defaults an unset value to
`development` (that default still gates `oryAuth`'s mock headers). Set
`NODE_ENV=development` locally to see the detail.

**`development` and `test`** answer with the detail, for the developer
reading the response:

```json
{
  "status": 500,
  "message": "Internal server error",
  "debugMessage": "internal detail",
  "timestamp": "2026-10-06T09:00:00.000Z"
}
```

**`production`, or an unset `NODE_ENV`,** answers with no `debugMessage` key at all — not the
exception's, not a stack, not an error's message. Only the status and the
translated message reach the client:

```json
{
  "status": 500,
  "message": "Internal server error",
  "timestamp": "2026-10-06T09:00:00.000Z"
}
```

A client that needs to tell two failures apart in production reads `status`
and the translated `message`, never `debugMessage`. A detail the client is
meant to see belongs in the `CustomException`'s message key and its
`options`, which are translated and always sent.

## What is logged

With `logToConsole` (the default), every error is logged through
`@nxgt/shared-logging`'s `logger.error`, between two rules: the error itself,
then its stack where the table below says so. Whenever the response carries no
detail (`production`, or an unset `NODE_ENV`) the log is where the detail lives, so it also carries a `CustomException`'s
`debugMessage`, and the stack whatever the options say.

| `NODE_ENV` | stack logged | `debugMessage` of a `CustomException` logged |
| --- | --- | --- |
| `development` | with `showStackInDev` (default `true`) | no — it is in the response |
| `test` | with `showStackInTest` (default `false`) | no — it is in the response |
| `production`, or unset | always | always |

`logToConsole: false` logs nothing at all, in any environment — so under
`production` the detail then goes nowhere. Keep it for specs.

## A thrown value that is not an `Error`

Hono hands `onError` an `Error` only. `throw 'text'` or `throw { … }` from a
route never reaches this handler: Hono rethrows it, and the request fails
outside it. Throw an `Error`, or a `CustomException`.
