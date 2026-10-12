---
"@nxgt/shared-graphql": patch
---

`createMaskError` keeps the `path` and `locations` of a `CustomException`, a Mongoose error and an Ory outage. They reached the client without them, so it could not tell which field failed; a denial and an unexpected error already kept them.
