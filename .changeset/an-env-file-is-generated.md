---
"@nxgt/env": minor
---

A `.env` is generated, not copied.

`@nxgt/env` turns a `.env.example` or `.env.template` into a real `.env`:
it generates the values only that deployment defines, refuses to invent the ones
something else issues, and never overwrites a value already in the file.

- `nxgt-env init` writes the file 0600, mirroring the template's own lines so the
  two stay diffable, and fills in only the keys that have no value. Running it
  twice changes nothing; running it after a key was added to the template fills
  in that key alone, which is what makes it safe to call from a `setup` script.
- `nxgt-env check` is the CI shape: *missing* and *empty* fail, *waiting to be
  pasted* and *not in the template* are reported and do not.
- `nxgt-env rotate VAR` replaces one generated value, and refuses a key that
  something else issues — rotating those happens where they are issued.

Three buckets, decided in order: an `# @env …` annotation always wins; then the
manual names (`*_TOKEN`, `*_API_KEY`, `*_ACCESS_KEY`, `*_CLIENT_ID`,
`*_CLIENT_SECRET`, `*_PRIVATE_KEY`, `*_CERT`, `*_DSN`, `*_LICENSE_KEY`), checked
first because `*_CLIENT_SECRET` also ends in `_SECRET` and an OAuth server is the
only thing that knows it; then the generated names (`*_SECRET`, `*_PASSWORD`,
`*_PASS`, `*_PASSPHRASE`, `*_SALT`, `*_ENCRYPTION_KEY`, `*_SIGNING_KEY`).

A generated value never contains `$`, a space, a quote, a backtick, `\`, `#`, `=`
or `:`. That alphabet is narrow because of two measured failures on the machine
this was written for: `export S3_PASSWORD=…$…` exported ten characters of a
twenty-character password, and a `MONGO_PASSWORD` containing a space was cut at
the space while bash ran the remainder as a command at every shell start. Both
truncated values were baked into running containers. Length buys the entropy back.
