# nxgt-issues

Closes the loop between an application and the in-house packages it consumes.
When a package misbehaves, lacks a feature the application would otherwise work
around, or has a wrong or missing doc, the application files an anonymous issue
on the package's repository and keeps a private tracking issue of its own; the
package side sees its open issues when a session starts; once the fix is
released, the application adopts it and removes the `// Temporary, until
<package>#<n>` markers.

> **Status: scaffold.** This version ships the library under `scripts/lib/` and
> nothing else: no skill, no hook, no command. It changes nothing in a session.
> The reporter flow, the `SessionStart` hook, the app-side adoption flow and the
> `/issues` dashboard follow in later versions.

## Install

```bash
claude plugin install nxgt-issues@nxgt-core --scope user
```

It is not part of `nxgt-base` yet, and installing it changes nothing until a
later version adds skills and hooks.

## What the library holds

| module | role |
| --- | --- |
| `hook.ts` | the shell every hook of the plugin will run in |
| `runner.ts` | the only place that spawns a process or fetches a URL, with a scripted fake for specs |
| `repo-id.ts` | which GitHub repository a directory or a `package.json` belongs to, and whether its owner is allowed |
| `refs.ts` | closing keywords and upstream references |
| `markers.ts` | parses the `Temporary, until <package>#<n>` markers out of `git grep -n` output |
| `cache.ts` | the 10-minute cache, written atomically |
| `scrub.ts` | the anonymity pass: transforms, then a deny-list check that refuses a filing on any hit or on a credential assignment |
| `deny.ts`, `fold.ts` | the deny-list and its search, with the normalization that catches `secret_app`, `Secret App`, `secret&#45;app`... |
| `fingerprint.ts` | the duplicate fingerprint of a report |
| `issue-body.ts` | the issue and comment templates, with their HTML-comment markers |

The `issue-body.ts` templates do not scrub. A filer must render the whole body
(and the duplicate comment) and run `scrub()` on the rendered text, refusing on
`refused`; scrubbing the inputs alone is not enough.

`no-network.spec.ts` fails if any module other than `runner.ts` spawns a
process, opens a socket or calls `fetch` (it reads the library recursively); the
real runner throws in a test run (`NODE_ENV=test`, or a `*.spec.ts` entry file)
unless `NXGT_ISSUES_ALLOW_NETWORK=1`.

## Configuration

| variable | effect |
| --- | --- |
| `NXGT_ISSUES_DISABLE=1` | turns the plugin off (`true` works too) |
| `NXGT_ISSUES_OWNERS` | comma-separated GitHub owners the plugin may touch; default `softistx,SteveGT96` |
| `NXGT_ISSUES_HOME` | the state and cache directory; else `$CLAUDE_CONFIG_DIR/nxgt-issues`, else `~/.claude/nxgt-issues` |
| `NXGT_ISSUES_ALLOW_NETWORK=1` | lets the real runner work under `NODE_ENV=test` |

Cache files live in `<home>/cache/<owner>__<repo>.json`.
