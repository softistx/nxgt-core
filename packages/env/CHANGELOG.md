# @nxgt/env

## 0.1.1

### Patch Changes

- [#124](https://github.com/softistx/nxgt-core/pull/124) [`96e4109`](https://github.com/softistx/nxgt-core/commit/96e41095f19a21b61b9d6ef220e96d7352088a94) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Entry points share one copy of what they have in common
  
  `build.ts` ran `Bun.build` without `splitting`, so a module imported by two
  entry points was inlined into **both** bundles. For these four packages that was
  27% of the JavaScript this workspace publishes — `@nxgt/shared-events` alone now
  emits ten shared chunks where it previously carried ten duplicates.
  
  No class was duplicated here, which is the only reason this is a patch and not
  an incident. The same setting in nxgt-ory gave `@nxgt/ory-sdk` two
  `OryUnavailable` classes, one per entry point, so an `instanceof` between them
  was false and nine routes answered 500 where they meant 503 — through a green
  build, a green typecheck, and a `verify:artifacts` that loaded every subpath.
  
  `verify:artifacts` now refuses a tarball that defines any class in more than one
  entry bundle, so the day one of these packages grows a shared class it is a
  failed check rather than a runtime surprise in a consumer.

## 0.1.0

### Minor Changes

- [#114](https://github.com/softistx/nxgt-core/pull/114) [`16511d2`](https://github.com/softistx/nxgt-core/commit/16511d21af46f2e2b52ccfedc7fab1c5f5ac564e) Thanks [@SteveGT96](https://github.com/SteveGT96)! - A `.env` is generated, not copied.
  
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
