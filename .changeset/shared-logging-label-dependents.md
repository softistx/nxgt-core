---
'@nxgt/security': patch
'@nxgt/shared': patch
'@nxgt/shared-mongo': patch
'@nxgt/shared-storage': patch
'@nxgt/shared-hono': patch
'@nxgt/shared-graphql': patch
---

Their own log lines now read `[app]` by default through `@nxgt/shared-logging` 2.0.0; set `LOG_TAG` to keep your previous label.
