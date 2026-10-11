# nxgt-issues

Closes the loop between an application and the in-house packages it consumes.
When a package misbehaves, lacks a feature the application would otherwise work
around, or has a wrong or missing doc, the application files an anonymous issue
on the package's repository and keeps a private tracking issue of its own; the
package side sees its open issues when a session starts; once the fix is
released, the application adopts it and removes the `// Temporary, until
<package>#<n>` markers.

> **Status: reporter.** This version ships the `report-to-upstream` skill and
> the `issues.ts` CLI behind it (`resolve`, `file`, `track`, `deps`,
> `sessions`). There is no hook yet: nothing runs at session start. The
> `SessionStart` digest, the app-side adoption flow and the `/issues` dashboard
> follow in later versions.

## Install

```bash
claude plugin install nxgt-issues@nxgt-core --scope user
```

It is not part of `nxgt-base` yet. Installed, it adds the `report-to-upstream`
skill, which fires when a session hits a bug, a missing feature, a wrong doc or
an outdated dependency in one of the owner's packages.

## The reporter flow

1. `issues.ts resolve <pkg>` — the repository the package's issues go to, or a
   refusal with a hint (file nothing then).
2. Claude writes a minimal reproduction from scratch: versions, expected,
   actual, a generic workaround. Never application code.
3. `issues.ts file` — scrub, dedupe, file (automatic when the scrub passes).
4. `issues.ts track` — the private tracking issue in the application, then the
   `// Temporary, until <pkg>#<n>` markers.
5. `issues.ts sessions owner/repo` with `ListAgents` — one `SendMessage` to
   each session that has to act.

## The CLI

`bun plugins/nxgt-issues/scripts/issues.ts <command>` (from a skill:
`bun ${CLAUDE_PLUGIN_ROOT}/scripts/issues.ts`). It acts on the directory it is
run from, the application's checkout, or on `--cwd <dir>`. Inputs are JSON on
stdin.

| command | does |
| --- | --- |
| `resolve <pkg> [--json]` | prints `<pkg> -> owner/repo (public\|private, installed x, latest y)` or the refusal |
| `file [--duplicate-of <n> \| --new] [--public-app]` | files the report on stdin (below) |
| `track` | opens or refreshes the private tracking issue (stdin below) |
| `deps <pkg> [--file]` | prints the dependencies of `<pkg>@latest` whose latest release falls outside the declared range; `--file` puts them in the rolling issue |
| `sessions <owner/repo> [--json]` | the live nxgt-crew sessions whose repository depends on a package published from `owner/repo` (none when nxgt-crew is absent) |

`file` reads one report:

```json
{
  "package": "@nxgt/example", "kind": "bug",
  "title": "parse() drops the last item of a list",
  "symptom": "parse drops the last item of a list",
  "summary": "…", "versions": { "@nxgt/example": "1.3.0" },
  "expected": "…", "actual": "…", "repro": "…",
  "workaround": "… (optional)", "keywords": ["parse"], "note": "… (optional)"
}
```

`kind` is `bug`, `enhancement`, `documentation` or `dependencies`; a
`dependencies` report carries `"dependencies": [{ "name", "current", "latest"
}]` instead of the text fields. `track` reads `{ "upstream": "owner/repo#n",
"package", "title", "summary", "markers"?: [{ "file", "line" }] }`; without
`markers` it finds them with `git grep`.

What `file` does, in order:

1. refuses when the application's own repository is public (asked fresh, never
   from the 24-hour gate cache, so a repository made public since is seen), unless `--public-app` says the user agreed; a
   repository gh cannot see (404) is not public;
2. resolves and gates the package (as `resolve`);
3. builds the deny-list once (below); it refuses (exit 3) while no application
   domain is configured (only an entry with a dot counts: `none` is no
   domain), unless the repository's `.nxgt-issues.json` says
   `"appDomains": []`;
4. renders the issue body, the title, the "another consumer" comment and the
   search words, and scrubs each **rendered** text; any denied term or
   credential refuses the whole filing, printing the terms and the credential
   keywords to remove, never a value;
5. dedupes: an open issue labelled `consumer-report` with the same fingerprint
   gets the comment; a closed one gets it too, with a "wait for the release"
   hint, unless it is labelled `released`: then nothing is filed and `file`
   says to bump (`--new` files anyway, for a bug that survives the bump);
   otherwise one keyword search lists open candidates for Claude
   to judge (`--duplicate-of <n>` comments there, `--new` files anyway);
6. creates the missing labels (the kind and `consumer-report`) and files,
   printing the URL.

A `dependencies` report never opens a second issue: it edits the one rolling
issue (marked `<!-- nxgt-issues:deps -->`), merging rows by name, and reopens it
with only the new rows when the package side closed it.

### Exit codes

| code | meaning |
| --- | --- |
| 0 | done: filed, commented, updated, tracked, or nothing to do |
| 1 | usage: unknown command, invalid flags or input |
| 2 | refused by the gate (the reasons below), `file` from a public application without `--public-app`, or `track` on a public or foreign application |
| 3 | refused by the scrub, or the deny-list could not be built whole |
| 4 | keyword candidates printed; nothing filed |
| 5 | rate-limited; nothing filed |
| 6 | another failure (gh, git), printed on stderr; a 403 that is not a rate limit says `permission` |

### Refusals

| reason | when | hint |
| --- | --- | --- |
| `invalid-name` | not an npm package name | — |
| `unknown-package` | neither on the registry nor under `node_modules` | check the name |
| `no-repository-field` | no GitHub `repository` in its `package.json` | ask the package's session to add one |
| `not-owner` | the repository's owner is not in `NXGT_ISSUES_OWNERS` (checked before any gh call, and again after a rename) | — |
| `not-found` | gh cannot see the repository | renamed, deleted or not visible to the token |
| `issues-disabled` | issues are off | ask the owner to turn them on |
| `archived` | the repository is archived | keep the workaround |
| `rate-limited` | a pause is in force | try again when it lifts |
| `unreachable` | gh failed otherwise | `gh auth status` |

The gate answer (`gh api repos/o/r`: owner, `has_issues`, `archived`,
`private`) is cached 24 hours in `<home>/cache/gate/`.

### Rate limits

Every gh call goes through one wrapper. A refusal for rate (HTTP 429, or a
message that says "rate limit", "secondary rate" or "abuse") writes `rateLimitedUntil` (now + 15 minutes)
to `<home>/cache/rate-limit.json`; until then every call fails at once without
spawning gh. Any other HTTP 403 is a missing permission: it fails that call
(exit 6) and pauses nothing. A filing makes at most one search-API call (the keyword search);
the fingerprint lookup lists `consumer-report` issues instead of searching.

## The deny-list

`buildDenyList` returns plain data, `{ terms, distinctive }`: `terms` is every
string that may never appear in a filing, `distinctive` the subset that is the
application's own vocabulary (stems of its repository and packages, its scope,
the main label of its domains, 5+ characters), matched even inside a word
(`acmestoredb`). The other terms match whole-word, in the text as written and
again after decoding and folding separators and camelCase (see `deny.ts`).

`file` builds it once per filing from:

- the application's repository (`origin`, read from `.git/config`) and its
  package and workspace names; without a GitHub `origin`, the checkout's root
  folder name and the name of the folder holding the git common dir (the main
  checkout of a worktree);
- the working directory's name;
- every private repository of the default owners (`softistx`, `SteveGT96`),
  by full name, and by each distinctive stem as a whole word outside
  `node_modules/` paths (`zorblax` from `zorblax-api`); a stem that is a
  common English word or a framework, library or tool name (`compose`,
  `rest`, `content`, `react`, `docker`…, listed in `common-words.ts`) is never
  denied alone — name such a product in `denyTerms` (below),
  and of any other owner in `NXGT_ISSUES_OWNERS` (`gh repo list --visibility
  private`, cached 24 hours in `<home>/cache/private-repos.json`; when gh fails
  the stale copy is used, and with no copy at all nothing is filed).
  `NXGT_ISSUES_OWNERS` narrows who receives filings, never what is denied. A
  `gh repo list` that returns `[]` cannot be told apart from a token that sees
  none of the owner's private repositories: check `gh auth status` and the
  token's scopes if a private name is expected on the list;
- `git config user.name` and `user.email` (unset is fine; a git that cannot be
  run, or fails otherwise, refuses the filing), the hostname, the home folder;
- the application's own domains and any extra terms from the configuration.

The package being reported and its repository are allowed.

### Application domains and extra terms

```json
{ "appDomains": ["api.example-shop.io"], "denyTerms": ["Project Falcon"] }
```

read from, and merged across:

- `<repository root>/.nxgt-issues.json` (this application; commit it or not);
- `<home>/config.json` (every application);
- `NXGT_ISSUES_APP_DOMAINS` and `NXGT_ISSUES_DENY_TERMS`, comma-separated.

`denyTerms` is also the way to deny a product whose repository stem is a
common word: a private `acme-compose` denies `acme-compose` but not `compose`
alone, so write `"denyTerms": ["Compose Cloud"]` when the product goes by
that name in prose.

A domain adds itself, its registrable domain and that domain's main label.
The skill creates `.nxgt-issues.json` on first use in an application, asking
the user for the domains. **While no domain is configured, `file` and `deps
--file` refuse (exit 3)**, unless the repository's `.nxgt-issues.json` says
`"appDomains": []` (the application has none); the user-wide file and the
environment variable can supply domains but cannot declare "none" (their `[]`
or `["none"]` still refuses: an entry counts only when it holds a dot).

Independently of the configuration, the scrub rewrites any dotted name ending
in a common TLD to `<host>` (`domains.ts`): `com`, `net`, `org`, `io`, `dev`,
`app`, `fr`, `ca`, `co`, `uk`, `de`, `eu`, `us`, `me`, `ai`, `cloud`, `tech`,
`xyz`, the francophone ccTLDs (`ma`, `be`, `tn`, `sn`, `ci`, `lu`, `ch`, `dz`,
`cm`, `ht`), `it`, `sh`, and `school`, `academy`, `online`, `store`, `site`,
`page`, `education`, `africa`, `ng`, `ke`, `za`, `in`, `sa`, `ae`, `qa`,
`studio`, `agency`, `digital`, `space`, `live`, `so`, `to`, among others; and
a private name under `.internal`, `.lan` or `.local`, port or not
(`billing.acme.internal`). Browser API paths stay (`chrome.storage.local`). A path, query or fragment after it is kept
(`<host>/graphql`); a leading `.`, `*.` or `@` goes with it (`'.myeduapp.com'`,
`*.myeduapp.com`, `@myeduapp.com`); a Unicode label is rewritten whole
(`école.fr`). Kept as written: `github.com` and its subdomains, `npmjs.com`,
`npmjs.org`, `registry.npmjs.org`, `nodejs.org`, `bun.sh`, `mozilla.org`,
`developer.mozilla.org`, `nuxt.com`, `vitejs.dev`, `hono.dev`,
`typescriptlang.org`, `stackoverflow.com`, `mongodb.com`, `graphql.org`,
`jsr.io`, `schema.org`, `vuejs.org`, `react.dev`, the RFC 2606
`example.com|net|org` names, `ASP.NET`-style names, common script names
(`deploy.sh`), and code: `index.ts`, `process.env`, `Promise.all`, `this.app`,
a name followed by a call or a member access, anything inside a path.

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
| `hosts.ts`, `domains.ts` | rewrite `host:port`, IP literals, resolver-error host names and bare domain names to `<host>` |
| `secrets.ts` | known token shapes, and the credential assignments, headers, flags and key blocks that refuse a filing; a name ending in `Error` or `Exception` and lower-case prose with a validation or status word after a label (`password: too short`, `token: has expired`) pass; `password: open sesame` refuses |
| `key-names.ts` | `key` names: a plain one (`key`, `sortKey`) refuses only key material (`Zq8w-LmP3`, `AbCdEfGh…`, `ABCD-EFGH-IJKL`); a purposeful one (`signingKey`, `accessKeyId`, `licenseKey`) or an env-style `*_KEY` refuses any literal |
| `common-words.ts` | the English and tech words a private repository stem is never denied as |
| `credential-pairs.ts` | credential headers set by index or as a tuple (`headers['authorization'] = …`, `new Headers([['authorization', …]])`) and `--password`, `-W`, `-p`, `-a` flags beside their value in an argument array (a port passes) |
| `auth-calls.ts`, `literals.ts` | literal secrets handed to a credential call — a callee whose name has a part like `password`, `secret`, `key`, `token`, `hash`, `hmac`, `cipher`, `sign`, `verify`, `compare`, `encrypt`, `scrypt`, `pbkdf2`, `argon`, `bcrypt`, `login`, `auth`, or `btoa`, `encode`, `Buffer.from`, or a credential header's setter or `res.cookie` — at any depth, wherever the call sits; and the literals that are plainly not secrets (algorithm names, locale tags, role words, durations, env names, naming options; a message with a space only under a `message`, `error` or `description` key, never as a positional argument of a key call, so `verify(sig, 'Signature is invalid')` refuses; no role word, locale or env name in the key position of a sign, signature, hash, hmac, cipher, password, verify or webhook call, or the password of `login`; `encode` and `Buffer.from` refuse only a literal that looks like a credential) |
| `code-values.ts` | when the value of a credential-named assignment is code (a call whose literals are names, a type, an env read, a fallback chain) rather than a secret |
| `deny.ts`, `deny-terms.ts`, `fold.ts` | the deny-list and its search, with the normalization that catches `secret_app`, `Secret App`, `secret&#45;app`... |
| `fingerprint.ts` | the duplicate fingerprint of a report |
| `issue-body.ts` | the issue and comment templates, with their HTML-comment markers |
| `resolve.ts` | the package's repository (registry, then `node_modules`) and the gate |
| `github.ts`, `github-issues.ts` | every gh call, with the rate-limit pause |
| `labels.ts` | the labels and `ensureLabels` |
| `crew-registry.ts` | a read-only copy of nxgt-crew's registry reader and liveness rule |
| `workspaces.ts` | a repository's manifests, their dependencies, and an installed dependency's manifest |
| `deny-sources.ts` | where a filing's deny-list comes from, and the configuration |
| `report.ts` | the stdin JSON of `file` |
| `cli.ts`, `cli-context.ts`, `filing.ts`, `file.ts`, `file-checks.ts`, `deps.ts`, `deps-behind.ts`, `track.ts`, `sessions.ts` | the commands |

The `issue-body.ts` templates do not scrub. `file` renders the whole body (and
the duplicate comment) and runs `scrub()` on the rendered text, refusing on
`refused`; scrubbing the inputs alone is not enough.

`scripts/issues.ts` is the only file that builds the real runner.
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
| `NXGT_ISSUES_APP_DOMAINS` | the application's domains, comma-separated (see the deny-list) |
| `NXGT_ISSUES_DENY_TERMS` | extra terms never to file, comma-separated |
| `NXGT_ISSUES_ALLOW_NETWORK=1` | lets the real runner work under `NODE_ENV=test` |
| `NXGT_CREW_HOME`, `NXGT_CREW_SESSION_ID` | where `sessions` reads the crew registry, and which session is this one |

Cache files live in `<home>/cache/`: `<owner>__<repo>.json` (10 minutes),
`gate/<owner>__<repo>.json` and `private-repos.json` (24 hours),
`rate-limit.json`.
