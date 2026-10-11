---
name: report-to-upstream
description: >-
  File an anonymous, deduplicated issue on one of the owner's packages
  (@nxgt/*, @alxia/*, or any package whose repository belongs to softistx or
  SteveGT96) and keep a private tracking issue in the application. Use when a
  session hits a bug in such a package, a missing feature it would otherwise
  work around, a wrong or missing doc, or a dependency of the package behind
  its latest release — ~/.claude/CLAUDE.md "In-house packages" says these are
  filed through nxgt-issues, never worked around silently.
allowed-tools: Bash(bun ${CLAUDE_PLUGIN_ROOT}/scripts/issues.ts *)
---

# Report to upstream

The application files the problem where it will be fixed — the package's
repository — without naming itself, and keeps the link on its own side. Filing
is automatic once the scrub passes (owner decision): do not ask the user for
permission to file; report the URL afterwards.

Every command runs from the application's checkout (or takes `--cwd <dir>`).

## 0. First use in an application: its domains

Look for `.nxgt-issues.json` at the repository root with an `appDomains` list.
If it is missing or the list is empty, ask the user (AskUserQuestion) which
domains the application uses (production, staging, admin, API), then create
it:

```json
{ "appDomains": ["example-app.com", "admin.example-app.fr"] }
```

When the user says the application has no domain of its own, write
`{ "appDomains": [] }` — explicitly empty. Every listed domain, its registrable
domain and its main label are denied in filings. **`file` refuses (exit 3)
until the file exists with an `appDomains` list**, empty or not (an entry
counts only when it is a host with a dot; never write `"none"`): a product name
derived from a domain is only caught once the domain is listed. Bare domain
names are rewritten to `<host>` either way.

## 1. Resolve

```bash
bun ${CLAUDE_PLUGIN_ROOT}/scripts/issues.ts resolve <package>
```

It prints `<package> -> owner/repo (public|private, installed x, latest y)`, or
`refused: <reason>` with a hint (exit 2). **On a refusal, tell the user the
reason and the hint, and file nothing** — no other route, no hand-written `gh
issue create`. Reasons: `no-repository-field` (ask the package's session to add
`repository`), `not-owner`, `issues-disabled`, `archived`, `not-found`,
`unknown-package`, `rate-limited`, `unreachable`.

For an outdated dependency, `bun ${CLAUDE_PLUGIN_ROOT}/scripts/issues.ts deps <package>` prints the rows behind
their latest release; `bun ${CLAUDE_PLUGIN_ROOT}/scripts/issues.ts deps <package> --file` puts them in the
package's one rolling dependencies issue. Then skip to step 5.

## 2. Write a minimal reproduction from scratch

Never paste application code, paths, logs, names, domains or data. Write a new,
minimal example against the package's public API that shows the problem, with
generic names (`user`, `item`, `example.com`). Include the versions involved,
what you expected, what happened, and a generic workaround if there is one.

## 3. File

```bash
bun ${CLAUDE_PLUGIN_ROOT}/scripts/issues.ts file <<'JSON'
{
  "package": "@nxgt/example",
  "kind": "bug",
  "title": "parse() drops the last item of a list",
  "symptom": "parse drops the last item of a list",
  "summary": "Parsing a comma-separated list loses its final element.",
  "versions": { "@nxgt/example": "1.3.0", "bun": "1.3.2" },
  "expected": "`parse('a,b')` returns `['a', 'b']`.",
  "actual": "It returns `['a']`.",
  "repro": "```ts\nimport { parse } from '@nxgt/example';\nconsole.log(parse('a,b'));\n```",
  "workaround": "Append a trailing comma before parsing.",
  "keywords": ["parse", "last", "item"],
  "note": "Also seen with bun 1.3.2."
}
JSON
```

`kind` is `bug`, `enhancement` (a missing feature that forces a workaround),
`documentation`, or `dependencies` (then `"dependencies": [{ "name", "current",
"latest" }]` instead of the text fields). `symptom` is the one line the
duplicate fingerprint is computed from: keep it about the behaviour, not the
application.

What it prints, and what to do:

| output (exit) | meaning | next |
| --- | --- | --- |
| `filed <url>` (0) | a new issue | step 4 with its number |
| `commented <url> (duplicate of #n…)` (0) | the same report existed and is open; a comment says another consumer hit it | step 4 with `#n` |
| `commented <url> (duplicate of #n, closed)` + `fixed but not released yet` (0) | the fix is merged, not published | wait for the release; keep the workaround and its marker; step 4 with `#n` |
| `released: #n reported this…` (0) | the fix is published; nothing was filed | bump the package to the fixed release and remove the workaround; only if it still fails on that release, run `file --new` |
| `refused: the application repository … is public` (2) | filing from a public application could tie it to the report | ask the user (AskUserQuestion); only with their OK rerun with `--public-app` |
| `candidates: …` (4) | open issues that may be the same | read them (`gh issue view`); same problem → `bun ${CLAUDE_PLUGIN_ROOT}/scripts/issues.ts file --duplicate-of <n>` with the same JSON; different → `bun ${CLAUDE_PLUGIN_ROOT}/scripts/issues.ts file --new` |
| `refused: the text is not anonymous…` (3) | a private term or a credential was found | rewrite the named parts generically and run `file` again; never work around the scrub |
| `refused: <reason>` (2) | the gate refused | tell the user; file nothing |
| `rate-limited: …` (5) | GitHub throttled the token | tell the user when calls resume; do not retry in a loop |
| `… was refused (permission)` on stderr (6) | the token lacks a permission | tell the user; `gh auth status` |

## 4. Track it in the application

```bash
bun ${CLAUDE_PLUGIN_ROOT}/scripts/issues.ts track <<'JSON'
{ "upstream": "owner/repo#12", "package": "@nxgt/example",
  "title": "parse() drops the last item", "summary": "We append a comma meanwhile." }
JSON
```

It opens (or refreshes) a private issue in the application's repository,
labelled `upstream`, linking the upstream issue. It refuses when the
application's repository is public, because that would tie the application to
the anonymous issue: tell the user instead.

**In a public application** (the user agreed to `--public-app`): add no
issue-number markers and open no tracking issue without the user's explicit
OK — both are public and point at the anonymous report. Ask; without a yes,
mark the workaround with a plain `// Temporary: workaround for an upstream bug`
and keep the URL in the reply to the user only.

Otherwise mark every workaround in the code with the upstream issue:

```ts
// Temporary, until @nxgt/example#12
```

Then run `track` again so the tracking issue lists the markers (it finds them
with `git grep`).

## 5. Tell the sessions that have to act

```bash
bun ${CLAUDE_PLUGIN_ROOT}/scripts/issues.ts sessions owner/repo
```

It lists the live sessions whose repository depends on a package of
`owner/repo`. With `ListAgents`, find the session working in `owner/repo`
itself and those listed: send **one** `SendMessage` to each that has to act —
the package's session (the issue URL and kind), and a consumer that uses the
affected API (the URL and the workaround). None when nobody has to act.

## 6. Report

Tell the user the upstream URL, the tracking issue URL, and the markers added.
