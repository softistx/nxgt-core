---
name: write-a-repo-script
description: >-
  Write repository automation as a TypeScript file run by Bun, using Bun Shell
  for the commands, rather than a `.sh`. Use when adding anything under
  `scripts/`, when porting a shell script you are about to edit, or for any
  chore that touches more than two files or that anyone might want to re-run.
---

# Skill: Write a repository script

## Purpose

Any automation that lives in a repository — release plumbing, a codemod, a
verification probe, a maintenance chore — is a **TypeScript file run by Bun**,
using Bun Shell for the commands it needs. Not a `.sh`.

This is the convention across `nxgt-core`, `sellix-monorepo`,
`nxgt-federation` and `nxgt-ory`. `scripts/publish.ts` and
`scripts/verify-artifacts.ts` are the reference implementations.

## When to use

- Adding anything under `scripts/`.
- Replacing a `.sh` you are about to edit — porting it is usually quicker than
  understanding it a second time.
- A one-off task that touches more than two files, or that anyone might want to
  re-run. Write the script; do not paste a pipeline into a terminal and lose it.

Not for: a genuine one-liner, or a `RUN` step inside a Dockerfile, where a
shell is the only thing available.

---

## Why

Bash is the wrong language for anything with data in it, and repository chores
are full of data — manifests, version numbers, tarball contents, registry
answers.

| in bash | in a Bun script |
| --- | --- |
| `jq` piped into `sed` piped into a subshell | `await Bun.file(p).json()`, an object |
| `set -euo pipefail`, and a `for` loop still masks failures because its status is the last iteration's | an exception, with a stack |
| arrays that break on spaces, `"${ARR[@]:-}"` incantations | arrays |
| no types, so a typo in a variable name is an empty string | `bun run typecheck` |
| unreadable at 150 lines | readable at 400 |

The failure that motivated this: a `for` loop in a Dockerfile that cloned and
built four packages and *silently shipped an image with one missing*, because a
loop's exit status is only its last iteration's. It needed a comment explaining
`set -e` to be correct at all. In TypeScript it is a `for` loop that throws.

Bun makes the trade free: `$` gives you the pipes, globs and redirection that
made shell worth using, and the rest of the file is a real language.

---

## The shape

```ts
#!/usr/bin/env bun
/**
 * One paragraph on what this does, and — more usefully — *why it exists*
 * rather than the obvious alternative. Whoever reads this next is deciding
 * whether to delete it.
 */

import { join } from 'node:path';
import { $ } from 'bun';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
```

- **Resolve paths from `import.meta.url`, never from `process.cwd()`.** A
  script must behave the same whether it is run from the repository root or
  from a package directory.
- **`$` by default, `.quiet()` when the output is noise, `.nothrow()` only when
  a non-zero exit is an expected answer** — and then check `exitCode`
  explicitly:

  ```ts
  const res = await $`git tag --force ${tag}`.cwd(ROOT).quiet().nothrow();
  if (res.exitCode !== 0) console.error(`  warning   could not tag ${tag}`);
  ```

- **Interpolate values, do not build command strings.** `` $`git tag ${tag}` ``
  escapes `tag`; a template that concatenates into one string does not.
- **`.text()` and `.json()`** for reading output; `Bun.file().json()` for
  manifests; `new Bun.Glob(…).scanSync()` for file lists.
- **Print what you did, one line per unit of work,** in a fixed column so a
  long run is scannable:

  ```
    skip      @nxgt/i18n@1.0.0 (already published)
    published @nxgt/shared-mongo@1.1.0
  ```

- **Exit non-zero on failure and say what to do about it.** A script that
  prints a problem and exits 0 will be ignored by CI.

---

## What a good one looks like

`scripts/verify-artifacts.ts` — packs every package, installs the tarballs into
a temporary directory the way a consumer would, and imports every subpath each
package declares. It reads `exports` maps to decide what to import, so it needs
no hand-maintained list, and it fails the build on a manifest that would break
an install.

That is the shape to copy: **derive the work from the repository's own
metadata**, rather than restating it in the script. A list in a script is a
list that goes stale.

---

## Running it

Add it to the root `package.json` when it is part of a workflow:

```jsonc
"scripts": { "verify:artifacts": "bun run scripts/verify-artifacts.ts" }
```

A one-off does not need an entry — `bun scripts/<name>.ts` is enough — but it
does need to be committed if it did anything worth repeating.

---

## Porting an existing `.sh`

Do it when you next need to change the script, not as a sweep. Keep the
behaviour and the help text; drop the argument-parsing boilerplate — Bun gives
you `Bun.argv`, and a handful of flags is a few lines of destructuring rather
than a `while [[ $# -gt 0 ]]` loop with a `case`.
