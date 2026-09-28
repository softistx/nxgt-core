# `@nxgt/shared-graphql` docs

The package's [README](../README.md) is the short version, with one example
per section. These pages are the long one.

| Page | Read it when |
| --- | --- |
| [Migrating to 3.0](./guide/migrating-to-3.md) | you upgrade from 2.x: every break, with the code before and after |
| [Authentication](./guide/authentication.md) | you wire `useOryAuth`, `useAuth` behind a trusted gateway, or `@authenticated(type:)` |
| [Permissions](./guide/permissions.md) | you guard a field with `@permission`, or call `requireUser` / `can` |
| [Errors](./guide/errors.md) | you decide what a client receives: denials, `createMaskError`, `createFormatError`, outages |
| [Troubleshooting](./troubleshooting.md) | you have an error message in hand |
| [Roadmap](./roadmap.md) | you want to know what is next, and what shipped in 3.0 |
