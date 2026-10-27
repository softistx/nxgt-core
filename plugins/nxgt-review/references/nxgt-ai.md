# `code-reviewer` in nxgt-ai

nxgt-ai is the public Bun workspace behind the `@nxgt/ai-*` packages, a Bun-native AI agents SDK published to npmjs: `ai-core` (messages, Zod tools, the model port, the agent loop, proposed actions), the `ai-anthropic` and `ai-ollama` adapters, `ai-testing`, `ai-telemetry`, and the later `ai-memory`, `ai-graphql`, `ai-alxia` and `ai-mcp`. Its skeleton is nxgt-data's. The worst bugs here are invisible to a type check: a saved conversation a provider refuses on replay, an action run that nobody confirmed, a token count that is off by the cache.

## Measure

```bash
find packages/*/src scripts -name '*.ts' ! -name '*.spec.ts' -exec wc -l {} + | sort -rn | head -20
```

The green bar, as CI runs it:

```bash
bun install
bunx biome ci
bun run build
bun run typecheck
bun run test
bun run verify:artifacts
bun run changeset:status
```

You may run all of them. Never run `changeset:publish`, `scripts/publish.ts` or `bun changeset`. Read `AGENTS.md` in full first: it names the packages that exist and the phases still planned, and `docs/roadmap.md` says which are which.

## Invariants

- **No third-party runtime client.** The Anthropic and Ollama adapters call Bun `fetch` and parse SSE and NDJSON in the package. `@anthropic-ai/sdk`, the `ollama` package or any other client in a manifest is a finding. `@modelcontextprotocol/sdk` is the one planned exception, in `@nxgt/ai-mcp` only; every other package has no `dependencies`. Infrastructure goes through `@nxgt/*` and `@alxia/*`.
  `grep -n '"dependencies"' -A6 packages/*/package.json`
- **Siblings and `zod` are peers.** `zod` and `typescript` are peers, never dependencies; a sibling is a peer as `workspace:^` plus a devDependency. A sibling in `dependencies` gives a consumer two copies of the core.
- **Every `tool_use` is answered by a `tool_result` in the saved messages.** A conversation with a tool call and no result (an aborted step, a tool that threw, a step limit hit mid-batch) is refused by the provider on the next turn. Check each path that ends a run early, and compaction, which must never split a call from its result.
- **A proposed action is never executed by the loop.** A mutating tool returns a proposed action; only a confirmation runs it, and it is re-validated when confirmed and expires. A path where `runAgent` calls an action's `execute`, skips the re-validation, or accepts an expired one is a finding.
- **`Usage.inputTokens` includes the cache tokens.** Cache read and write counts are reported beside it, as a part of it. An adapter or the telemetry observer that adds them again, or leaves them out, is a finding; so is a budget computed from the wrong one.
- **Observers are keyed by `runId`.** State kept per run in an observer, the telemetry one above all, lives in a map by `runId`; a module-level or instance-level `let` shared by concurrent runs attributes a span to the wrong run.
- **Adapters are stateless per call.** A model adapter keeps nothing between `stream` calls: no cached request, no counter, no retry state outside the call. The same adapter serves concurrent runs.
- **Message content is not recorded unless asked** by telemetry; the `gen_ai.*` names are the ones `AGENTS.md` and the roadmap give.
- **Test-only code never ships outside a `./testing` subpath.** A package that adds a store ships its contract suite there.
- **No private app name** in docs, READMEs, code, changesets, issues or examples. Examples use generic domains.
- **Imports carry no extension**; each README says consumers resolve with `"moduleResolution": "bundler"`.

## Structure

- A function over **80** lines, or a source file over **250**. A file directly under `src/` other than `index.ts` or a declared entry point is a finding.
- Each package follows nxgt-data's `docs/` layout: `docs/README.md` (the index), `docs/guide/<area>.md`, `docs/troubleshooting.md`, `docs/roadmap.md`, with `docs` in `files`. A public change with no README line and no guide page is a finding; so is a new error with no troubleshooting entry.

## Deliberate — do not report

- The root files `AGENTS.md` names as copied from nxgt-data (`build.ts`, `scripts/`, `.github/`, `biome.json`, `bunfig.toml`, `tsconfig.base.json`).
- The declared divergences in `AGENTS.md`: no `examples/` workspace, no service scripts yet, no Meilisearch/SeaweedFS caches or newest-peers job in `ci.yml`, `CLAUDE.md` as the one-line `@AGENTS.md` import.
- A package marked `"private": true` before its release-readiness slice.
- Packages named in the roadmap as Next or Later that do not exist yet.

## Layering and packaging

- `@nxgt/ai-core` at the bottom; the adapters, `-testing`, `-memory`, `-graphql`, `-alxia`, `-mcp` and `-telemetry` on it. No cycle, no integration importing another except through its published name.
- **`"private": true` leaves a package in a commit of its own**, the release-readiness slice's. A removal mixed with other changes is a finding.
- Changesets, independent versions, `bun publish` through `scripts/publish.ts`; registry configuration in `bunfig.toml`, never `.npmrc`. A package change takes a changeset naming it, or an empty one for a spec-only change. The `NPM_TOKEN` lives in the GitHub environment `npm`, never a repository secret.
- A new workspace member needs `bun.lock` in the same branch.
- Every published package is MIT with its own `LICENSE`; `typescript` is a peer; siblings by `workspace:^`.
- A README is the npm page: sections with an example each, an **API** and a **Traps** section, no private name.
- Commit messages: "Commits" in the owner's global `~/.claude/CLAUDE.md`, which that repository's `AGENTS.md` cites; no copy here.
