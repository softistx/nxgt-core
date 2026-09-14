---
'@nxgt/openapi-client': minor
---

New package: a typed `fetch` client for the operations `@nxgt/openapi-codegen` generates. `createClient<ClientOperations, OperationsByRoute>(operations, { baseUrl })` gives `api.op(id, input)` and `api.get(path, input)` for every method, QUERY included. The path, the parameters and the body are checked at compile time, and a call resolves to one of the declared replies, narrowed on its status. A status the spec does not declare throws `UndeclaredStatusError`; a failed fetch throws `NetworkError`, a slow one `TimeoutError`. It has no runtime dependencies.
