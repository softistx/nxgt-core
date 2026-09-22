# Troubleshooting

## `no .env.example or .env.template here — pass --template`

`init` looks for `.env.example`, then `.env.template`, in the working directory
only. It never searches upwards: in a monorepo that would silently fill an app's
`.env` from the root template.

## A key I expected to be generated is empty

It matched the manual list, which is checked first. `*_CLIENT_SECRET` is the
usual surprise — it ends in `_SECRET`, and it is still issued by an OAuth server.
Override it with an annotation if this one really is yours to invent:

```env
# @env secret length=48
MY_CLIENT_SECRET=
```

## A key I expected to be left alone was generated

Its name matched the generate list (`*_SECRET`, `*_PASSWORD`, `*_PASS`,
`*_PASSPHRASE`, `*_SALT`, `*_ENCRYPTION_KEY`, `*_SIGNING_KEY`). Annotate it
`# @env copy` or `# @env manual <why>`.

## `check` exits 1 on a file I just generated

Read which list the keys are in. *missing* and *empty* fail; *waiting to be
pasted* does not — it exits 0 for those, which is what lets `check` run in CI on
a machine that legitimately has no Cloudflare token. If the key is in *empty* and
should be pending, its name did not match the manual list: annotate it.

## `check` says a key is `not in the template`

Usually a rename that stopped halfway: the `.env` has the old name and the
template the new one. It is reported and does **not** fail, because a machine is
allowed to carry extra variables.

## The `.env` has the literal `CHANGE_ME` in it

Not from this tool: it treats `CHANGE_ME`, `<like-this>`, `TODO`, `FIXME`, `xxx`
and empty as placeholders and writes an empty value instead. A literal in the
file means it was written by hand or by something else.

## `rotate` refuses

The key is not generated here — something else issues it, so rotating it means
rotating it there and pasting the result. The message names the key and says
where.

## The value in my container is not the value in the file

Compose interpolation reads the **shell before the `.env`**, and Bun's loader
does not overwrite an already-set variable. A stale `export` wins over both, and
`docker inspect <container>` is the only honest check. This package writes files;
it cannot see your shell.
