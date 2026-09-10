# @nxgt/datasource-rest

An Apollo-style REST datasource over `openapi-fetch`: auth forwarding, caching
and error translation, so a GraphQL resolver can call a REST service with the
same typed client the REST apps use.

```ts
import { RESTDataSource } from '@nxgt/datasource-rest';

const bookmarks = new RESTDataSource({
	client, // openapi-fetch Client<paths>
	authOptions: { token: () => getAccessToken() },
	cacheOptions: { ttl: 5_000 },
});

const { data } = await bookmarks.get('/bookmarks/{id}', {
	params: { path: { id } },
});
```

`get` / `post` / `put` / `patch` / `delete` (and the rest of the HTTP verbs)
are the client's methods, rebound. Auth and cache are `openapi-fetch`
middleware installed in the constructor.

## Things that bite

- **Downstream errors become `CustomException`.** A 404 is `NotFound`, a 401
  is `Unauthenticated` — not a transport failure. Catch `CustomException`, not
  `Error` named after the HTTP library.
- **`authOptions.token` may be a string or a thunk.** The thunk is called per
  request. `shouldUseToken` skips the header on the requests you name.

## Install

```bash
bun add @nxgt/datasource-rest
```

Public on npmjs; no token needed to install. TypeScript is a peer, pinned to
`^6.0.3` across every `@nxgt/*` package — the set is unsatisfiable if one of
them widens it.
