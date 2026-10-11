---
'@nxgt/shared-logging': major
---

**BREAKING:** the default log label is now `app` for every logger: `createLogger` without `tag`, the default `logger`, `getLogger()` and the request logger of `loggerProvider()`. It used to be a private application's name. Set `LOG_TAG` (read when each logger is created) to keep your previous label everywhere, or pass `tag` per logger; `tag` wins over `LOG_TAG`.
