---
'@nxgt/openapi-client': minor
---

New package: a typed `fetch` client for the operations `@nxgt/openapi-codegen` generates. `createClient<ClientOperations, OperationsByRoute>(operations, { baseUrl })` gives `api.op(id, input)` and `api.get(path, input)` for every method, QUERY included. The path, the parameters and the body are checked at compile time, and a call resolves to one of the declared replies, narrowed on its status. A status the spec does not declare throws `UndeclaredStatusError`; a failed fetch throws `NetworkError`, a slow one `TimeoutError`. It has no runtime dependencies.

`validate: true` checks the request before it is sent and the reply before it is returned, with the spec's schemas read through Standard Schema, and throws a `ValidationError` carrying the issues the server would report. `decode: true`, on a client created with `createClient<ClientOperations, OperationsByRoute, true>`, returns each reply as its schema outputs it: with `dates: 'date'`, a date-time is a `Date`.
