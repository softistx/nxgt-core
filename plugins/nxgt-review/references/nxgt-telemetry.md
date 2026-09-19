# `code-reviewer` in nxgt-telemetry

nxgt-telemetry is the Bun workspace behind `@nxgt/telemetry` and its five
integrations (`-otlp`, `-hono`, `-httpyz`, `-mongo`, `-logging`), published to
npmjs. It is the TypeScript counterpart of the Kotlin `stx-telemetry`: the
vocabulary is shared, and a change to it here is a divergence that must be
named. Its worst bugs have no stack trace — a span attributed to another
request, a log lost at shutdown, a process that will not exit.

## Measure

```bash
find packages/*/src scripts -name '*.ts' ! -name '*.spec.ts' -exec wc -l {} + | sort -rn | head -20
```

The green bar, as CI runs it:

```bash
./node_modules/.bin/biome ci
bun run build
bun run typecheck
bun run test               # one process per package, then scripts; known state in AGENTS.md
bun run verify:artifacts
bun run changeset:status
```

You may run all of them. `@nxgt/telemetry-mongo`'s specs download a real
`mongod` into `.cache/mongodb` on first run; that is expected. Never run
`changeset:publish`, `scripts/publish.ts` or `bun changeset`.

## Invariants

- **Writing a signal never waits and never fails.** A path from `log.*`,
  `SpanScope.attribute`, `SpanScope.event` or `Pipeline.post` that can throw,
  reject, or `await` is a finding. Report the line that can throw. A
  `JSON.stringify` on an unvetted value and an unguarded schema validation
  are the two that keep coming back.
- **The core has no runtime dependency.** `packages/telemetry/package.json`
  carries no `dependencies`, and no `devDependencies` beyond `@types/bun`.
  Standard Schema is declared in `src/logger/standard-schema.ts`, not
  depended on. Report anything added, whatever its size.
- **No `@opentelemetry/*`, anywhere, in any manifest.** OTLP is a wire
  format here, not an SDK.
  `grep -rn '@opentelemetry' packages/*/package.json packages/*/src`
- **The sampler is asked once, by the root.** A `sampler.sample(...)`
  reached from anywhere but the creation of a root span produces traces
  missing their middles. Grep every call site and say which one is the root.
- **Logs are never sampled.** A log dropped because `sampled` is false is a
  finding. The `traceId` is attached either way.
- **The current span comes from the `AsyncLocalStorage`, never from a module
  variable.** A module-scope `let` in `src/context/` read outside the browser
  fallback is the bug this library exists to not have.
- **A timer never holds the process open.** Every `setInterval`/`setTimeout`
  in a pipeline is `.unref()`ed, and `close()` clears it.
- **`close()` races the drain against `drainTimeout`** and is awaited; a
  close that resolves before the backlog ships loses the last batch.
- **An attribute is a scalar, or a list of scalars.** An object reaching
  `Attributes` without the coercion is a finding; so is a coercion that can
  refuse a value instead of falling back to `String(value)`.
- **Ids come from `crypto.getRandomValues`.** `Math.random()` near a trace or
  span id is a finding.
- **`traceparent` parsing returns null, never throws**, on every malformed
  shape `AGENTS.md` lists. There is no `tracestate`.
- **The shared vocabulary does not change locally.** Severities, span kinds,
  statuses, semantic attribute names and defaults are those in `AGENTS.md`.
  A change to any of them with no changeset naming the divergence from
  `stx-telemetry` is a finding.
- **One integration never imports another**, and an integration imports the
  core by its published name, never relatively or through `paths`.
- **An integration's host is an optional peer** (`hono`, `@nxgt/httpyz`,
  `mongodb`, `winston`), pinned exactly as a devDependency. The core is a
  `dependencies` entry of each integration, by `workspace:^`.
- **`-logging` never imports winston.** The format is an object with
  `transform`, the transport a `node:stream` `Writable`.
- **A propagation change asserts on a second span's `parentSpanId`.**
  Round-tripping a header is not evidence the chain links.
- **A public function that can refuse an argument has an
  `@ts-expect-error` case** in the package's `test/types/`.

## Structure

- A function over **80** lines, or a source file over **250**. For a grown
  factory, the seam is the by-role shape `packages/telemetry/src/export/`
  follows: `exporter.ts` + `pipeline.ts` + one file per exporter.
- Files are organised in folders by role (`model/`, `attributes/`, `trace/`,
  `context/`, `telemetry/`, `span/`, `logger/`, `export/`). A file directly
  under `src/` other than `index.ts` or a declared entry point is a finding.
- An import carrying a `.js` or `.ts` extension is a finding.

## Deliberate — do not report

From the table in `AGENTS.md`:

- `LICENSE` at the root and in each `packages/*/`.
- `build.ts`, `scripts/`, `.github/`, `biome.json`, `bunfig.toml`,
  `tsconfig.base.json`, copied from nxgt-data.
- The span-shaped fields `-hono` and `-httpyz` both build (server fails at
  500, client at 400). Do report a name the two set with different meanings.
- `SERVER_ADDRESS` / `SERVER_PORT` declared again in
  `-mongo/src/attributes/db.ts`.
- The `guarded` hook wrapper and `always`/`nothing` in `-hono` and `-httpyz`.
- The core being a `dependencies` entry rather than a required peer, until
  it is published.

## Layering and packaging

- `@nxgt/telemetry` at the bottom; the five integrations on it; nothing else.
- Changesets, independent versions, `bun publish` through
  `scripts/publish.ts`. Every package public, MIT, with its own `LICENSE`.
- `typescript` is `^6.0.3` everywhere; siblings by `workspace:^`.
- A README is the npm page: sections with an example each, an **API** and a
  **Traps** section, no private name.
- Commit types: `feat`, `fix`, `update`, `chore`, `docs`, `refactor`,
  `tests`, `typo`.
