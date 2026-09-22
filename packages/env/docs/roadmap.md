# Roadmap

Deliberately absent, in the order they would be considered.

## Not planned

- **Reading or writing a secret store.** A `.env` is the boundary this package
  works at. Something that talks to `pass`, Vault or 1Password is a different
  package, and it should produce a `.env` this one can `check`.
- **Rotating a credential at its source.** `rotate` writes a file. Changing a
  database's password is the database's job, and doing both from one command is
  how you end up with a file that disagrees with a running service.
- **Sorting, grouping or reformatting a template.** The template's shape is the
  author's; the output mirrors it so the two stay diffable.

## Considered

- **`nxgt-env annotate`** — add `# @env …` lines to an existing template from the
  name rules, so a repository adopts the annotations once instead of by hand.
  Useful the day a parc of ~30 templates is converted; pointless before.
- **A `--json` output** for `check`, for a CI step that wants to report per key
  rather than exit non-zero.
- **`min` on a generated length** — a key that a consumer validates with
  `min(32)` cannot be generated shorter. Today the default (64) covers every such
  check in this parc, so the constraint has never bitten.
