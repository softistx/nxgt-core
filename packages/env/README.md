# @nxgt/env

A `.env` is **generated**, not copied. This package turns a `.env.example` or
`.env.template` into a real `.env`: it generates the values only that deployment
defines, refuses to invent the ones something else issues, and never overwrites a
value that is already there.

```sh
bunx @nxgt/env init            # .env.example → .env, 0600
bunx @nxgt/env check           # missing, empty, unknown keys — exits 1
bunx @nxgt/env rotate SESSION_SECRET
```

## Why it refuses as often as it generates

`SESSION_SECRET` has no right answer — any 64 random characters will do, and
copying one between machines is strictly worse than generating one.
`HYDRA_CLIENT_SECRET` has exactly one right answer, and an OAuth server holds it.
A tool that generates both writes a file that looks configured and fails at the
token exchange.

So every key falls into one of three buckets, decided in this order:

1. **An `# @env …` annotation** on a comment line above the key. It always wins.
2. **A manual name** — `*_TOKEN`, `*_API_KEY`, `*_ACCESS_KEY`, `*_CLIENT_ID`,
   `*_CLIENT_SECRET`, `*_PRIVATE_KEY`, `*_CERT`, `*_DSN`, `*_LICENSE_KEY`. Left
   empty, and the report says who issues it. This list is checked **first**
   because `*_CLIENT_SECRET` also ends in `_SECRET`.
3. **A generated name** — `*_SECRET`, `*_PASSWORD`, `*_PASS`, `*_PASSPHRASE`,
   `*_SALT`, `*_ENCRYPTION_KEY`, `*_SIGNING_KEY`.

Anything else is copied from the template, and a placeholder (empty,
`CHANGE_ME`, `<like-this>`, `TODO`, `xxx`) is written as empty rather than as
itself.

## The annotations

```env
# @env secret length=64
SESSION_SECRET=

# @env password length=24 charset=alnum
MONGO_PASSWORD=

# @env hex length=32
COOKIE_SALT=

# @env manual — `bun run register-client` writes it
HYDRA_CLIENT_SECRET=

# @env copy
LOOKS_LIKE_A_SECRET=not-really
```

`secret` | `password` | `hex` | `base64` | `uuid` | `manual` | `copy`.
`length` and `charset` (`safe`, `alnum`, `hex`) are optional.

## A generated value never contains a character that changes meaning

The default alphabet excludes `$`, space, `'`, `"`, `` ` ``, `\`, `#`, `=` and
`:` — every character that means something in a shell, in a dotenv file, or in
compose interpolation. That is not tidiness. On the machine this package was
written for:

- `export S3_PASSWORD=…$…` exported **10** characters of a 20-character
  password, because bash expanded the `$`;
- a `MONGO_PASSWORD` with a **space** in it was cut at the space, and bash ran
  the remainder as a command at every interactive shell start.

Both truncated values were then baked into running containers, where they still
are. The entropy lost by dropping punctuation is bought back with length: 64
characters of the default alphabet is about 380 bits.

## Idempotent by construction

`init` mirrors the template's own lines, so the `.env` stays diffable against
it, and **an existing value is never replaced**. Running it after a key was added
to the template fills in that key alone. That is what makes it safe to call from
a repository's `setup` script on every run.

`check` is the CI shape: it separates *missing* and *empty* (failures) from
*waiting to be pasted* (a human's job) and *not in the template* (usually a
rename nobody finished).

## Programmatic use

```ts
import { checkEnv, parseTemplate, parseValues, renderEnv } from '@nxgt/env';

const template = parseTemplate(await Bun.file('.env.example').text());
const existing = parseValues(await Bun.file('.env').text());
const { text, generated, pending } = renderEnv(template, { existing });
if (pending.length) console.log('someone must paste:', pending.join(', '));
await Bun.write('.env', text);
```

`classifyByName`, `readAnnotation`, `generateValue` and `isTransportSafe` are
exported too — the last one is worth reusing anywhere a credential is written to
a file a shell will read.

## What it does not do

- **It does not rotate anything anywhere else.** `rotate` writes a new value into
  the file; the service still has the old one until you update it. For a value
  issued elsewhere it refuses outright and says where rotation happens.
- **It does not read or write your secret store.** A `.env` is the boundary.
- **It does not sort or reformat.** The template decides the shape.
