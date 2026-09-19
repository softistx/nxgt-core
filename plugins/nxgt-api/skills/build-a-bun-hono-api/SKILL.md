---
name: build-a-bun-hono-api
description: >-
  Lay out a Bun + Hono API: a folder per subject rather than per layer, each
  module exporting its own Hono app instead of being handed one, the
  environment declared in a root `bun.d.ts` and parsed once with zod, a
  `Bun.serve` entrypoint that binds the parsed port and stops on a signal,
  and one OpenAPI registry each module registers into. Use when starting an
  API, adding a module to one, or wiring an app's environment or entrypoint.
---

# Skill: Build a Bun + Hono API

## Purpose

The shape of an HTTP API in these repositories: where files go, how the
environment is read, how the process starts and stops. It is transport and
storage agnostic — it says nothing about who authenticates a caller (that is
`nxgt-ory-app`'s) nor which database is behind it.

Two implementations are worth reading before you start:

| where | what it is |
| --- | --- |
| `sellix-monorepo/apps/bookmarks/bookmarks-api` | the source of the environment and entrypoint patterns, and the cleanest of the seven backends there |
| `nxgt-data/examples/hono-api` | a small worked example of the whole shape, with a spec beside every file |

Prefer copying from those over re-deriving. Where they disagree, this file
says which one is right and why.

---

## 1. A folder per subject, not per layer

```
src/
  db.ts             the storage configuration, and the app's handle type
  collections.ts    where the modules' models meet that configuration
  api.ts            the OpenAPI registry, shared by every module
  context.ts        what a request carries, composed from the modules
  app.ts            the middleware, and the modules mounted
  modules/
    users/          users.model.ts · users.service.ts · users.route.ts
    articles/       articles.model.ts · articles.service.ts · articles.route.ts
```

A subject is one folder and always the same three files: **what is stored,
what is done, what is served** — each with its spec beside it, so a module is
measured where it is read. `users.service.spec.ts` calls the services with no
HTTP at all; `users.route.spec.ts` calls the routes as a client would.

The central files stay central by **composing**, never by listing. If adding
a module means editing a central file in more than one place, that file has
become a layer again:

```ts
// modules/users/users.service.ts — the module declares its own slice
export function buildUserServices(kit: Kit) {
	return {
		create: (values: NewUser) => createUser(kit, values),
		find: (id: ObjectId) => findUser(kit, id),
	};
}
/** Read off the builder, so the signatures are never written twice. */
export type UserServices = ReturnType<typeof buildUserServices>;

// context.ts — composes, and learns nothing about what a module does
export interface Services {
	readonly users: UserServices;
	readonly articles: ArticleServices;
}
export function buildServices(kit: Kit): Services {
	return { users: buildUserServices(kit), articles: buildArticleServices(kit) };
}
```

## 2. A module exports its app; it is not handed one

```ts
// modules/articles/articles.route.ts
export const articlesApp = new Hono<Env>();
const routes = api.routes(articlesApp, { tag: 'articles' });

routes.post('/articles', async (c) => { … });
```

`api` is a module of its own (`src/api.ts`), so a route file is the whole of
what its module serves and `app.ts` only mounts:

```ts
app.route('/', usersApp);
app.route('/', articlesApp);
```

`{ tag }` bounds a module to its own operations. Measure it rather than
claim it — one `@ts-expect-error` file that nothing imports, with `tsc
--noEmit` reading it as the test:

```ts
// test/types/routes.ts
const routes = api.routes(usersApp, { tag: 'users' });
// @ts-expect-error `/articles` belongs to the articles module, not this one.
routes.get('/articles', (c) => c.json({ message: 'errors.not-found' }, 404));
```

### Registering is not mounting

A module registers its routes **as it is imported**, so a registry's
`assertComplete()` passes the moment the file is loaded — even under a wrong
prefix, even with nothing mounted. Assert on the assembled app as well:

```ts
export function assertServed(app: Hono<Env>): void {
	const served = new Set(
		app.routes.map((route) => `${route.method.toLowerCase()} ${route.path}`),
	);
	const missing = Object.entries(operations)
		.filter(([, op]) => !served.has(`${op.method} ${op.honoPath}`))
		.map(([id]) => id);
	if (missing.length > 0) {
		throw new Error(`The app serves no route for: ${missing.join(', ')}`);
	}
}
```

Mutating `app.route('/', articlesApp)` to `'/v1'` then fails with
`The app serves no route for: listArticles, createArticle, deleteArticle`.
Without it, that mutation produces a process that starts and 404s.

Mount order decides between two modules whose paths could both match one
request. Say so where the mounts are.

---

## 3. The environment: declared in `bun.d.ts`, parsed in `env.ts`

Two files, and **nothing else reads `Bun.env`.**

### `bun.d.ts`, at the package root

Sibling to `package.json`, *not* under `src/` — that is what makes
TypeScript's default include sweep it up. If the tsconfig has an explicit
`include`, add it there.

```ts
declare module 'bun' {
	interface Env {
		/** Server */
		PORT: string;

		/** Database */
		MONGO_URI: string;
	}
}
```

Every member is a `string`: this types the **input**, while `z.infer`
describes the **output**. `PORT` is a `string` here and a `number` there, and
that is correct — do not try to derive one from the other.

Leave `NODE_ENV` out: `bun-types` already declares it, as optional, and its
declaration wins the merge.

What it buys, measured: a declared name types as `string`, an undeclared one
as `string | undefined`. So it documents and completes the names — it is the
map below that refuses drift.

### `src/env.ts`

```ts
import { z } from 'zod';

const envSchema = z.object({
	NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
	PORT: z.coerce.number().default(3000),
	MONGO_URI: z.string().default('mongodb://127.0.0.1:27017/blog'),
});

export type Env = z.infer<typeof envSchema>;

const parseEnv = (value: Record<keyof Env, string | undefined>): Env => {
	const result = envSchema.safeParse(value);

	if (!result.success) {
		console.error('❌ Invalid environment variables:');
		console.error(z.prettifyError(result.error));
		throw new Error('Invalid environment variables');
	}

	return result.data;
};

// An explicit map, not `Bun.env` as a whole: what this app reads is the list
// above and nothing else, and a variable missing from this map is invisible
// to it whatever the shell exports.
export const env = parseEnv({
	NODE_ENV: Bun.env.NODE_ENV,
	PORT: Bun.env.PORT,
	MONGO_URI: Bun.env.MONGO_URI,
});
```

Rules, each for a reason:

- **`z.coerce.number()`** for anything numeric, `z.enum([...])` for anything
  with a fixed set, `z.url()` (top-level, zod 4) for a URL, and a
  `.default(...)` on nearly everything so the app starts with nothing set.
- **`.safeParse`, never `.parse`** — you want the message, not a stack.
- **`z.prettifyError(result.error)`**, not `result.error.issues`. The issues
  array prints as an object and is unreadable; the prettified form is
  `✖ Invalid input: expected number, received NaN` / `→ at PORT`.
- **Read at module scope**, so a bad value stops the process before it opens
  a connection rather than on the first request. The throw is what exits.
- **`Record<keyof Env, string | undefined>`**, not `Record<string, unknown>`.
  This is the whole guarantee, and it is measured:

  ```
  # a schema key nobody passes
  Property 'MONGO_URI' is missing in type '{ NODE_ENV: …; PORT: … }' but
    required in type 'Record<"NODE_ENV" | "PORT" | "MONGO_URI", string | undefined>'

  # a passed key in no schema
  Object literal may only specify known properties, and 'LOG_LEVEL' does not
    exist in type 'Record<"NODE_ENV" | "PORT" | "MONGO_URI", string | undefined>'
  ```

  Both are live defects in `sellix-monorepo` today: `LOG_LEVEL` is in six
  schemas and passed by none, so it is permanently `'debug'`; and
  `APP_DEFAULT_CURRENCY`, `APP_DEFAULT_ROUNDING_PRECISION`,
  `APP_DEFAULT_ROUNDING_RULE` are passed by six apps and declared in no
  schema, so zod strips them silently. Typing the map is what catches both.

- **`| undefined`** because any variable may be unset; the defaults are for
  exactly that. Do not declare members optional in `bun.d.ts` to compensate.

---

## 4. The entrypoint: `Bun.serve`

```ts
import { serve } from 'bun';

const kit = await createKit(config);

const server = serve({
	fetch: buildApp(kit).fetch,
	port: env.PORT,
	hostname: '0.0.0.0',
	development: env.NODE_ENV !== 'production' && {
		// Enable browser hot reloading in development
		hmr: true,

		// Echo console logs from the browser to the server
		console: true,
	},
});

console.log(`🚀 Server running at ${server.url} ${env.NODE_ENV}`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
	process.on(signal, () => {
		void server
			.stop()
			.then(() => kit.close())
			.finally(() => process.exit(0));
	});
}
```

- `import { serve } from 'bun'`, not `Bun.serve(...)`, and never the
  `export default { port, fetch }` object form.
- **Pass `port: env.PORT`.** Bun reads `PORT` itself when `serve()` is not
  given one, which makes the schema's default a decoration and `PORT=abc` a
  silent fallback instead of a startup error. Every backend in
  `sellix-monorepo` validates the port and then never passes it; do not copy
  that.
- `hostname: '0.0.0.0'` so a container can be reached.
- `development` as `env.NODE_ENV !== 'production' && { … }` — a
  `false | {…}` union, which `serve()` accepts.
- Log with `server.url`, which carries the port actually bound.
- **Stop on a signal**, then hand back whatever the process opened.
  `sellix-monorepo` has no handler in any of its seven services and relies on
  SIGKILL; that is a gap, not the pattern.
- The connection is opened **once, here** — never per request.

Scripts, all three:

```json
"dev":   "bun --watch src/index.ts",
"build": "bun build ./src/index.ts --minify-whitespace --minify-syntax --target=bun --outfile=dist/server.js",
"start": "bun ./dist/server.js"
```

---

## 5. Services take the handle first

A service is a function whose first argument is the request's handle — the
database kit, the client, the context — and which holds nothing of its own:

```ts
export function createUser(kit: Kit, values: NewUser): Promise<User> {
	return kit.db.users.create(values);
}
```

That is what lets the same function run from a request, a script or a test.
The middleware binds them once per request and puts them on the context, and
a handler reaches the services, never the handle:

```ts
app.use('*', async (c, next) => {
	const actor = tryObjectId(c.req.header('x-user-id'));
	if (!actor) return c.json({ message: 'errors.unauthenticated' }, 401);
	c.set('services', buildServices(kit.as(actor)));
	await next();
});
```

A handler that cannot reach the handle cannot write as another user and
cannot close it.

Do not put a variable on the context that nothing reads. If no handler reads
`c.get('actor')`, it does not belong in `Env`.

---

## Traps

- **A service that announces a promise must reject, not throw.** Mark it
  `async` even when the body's first statement throws, or the call site gets
  a synchronous exception where it awaited a rejection.
- **`registering !== mounting`** — see §2.
- **The environment is read in one file.** A second `Bun.env` read anywhere
  else is a variable that was never declared, never parsed and never
  defaulted.
- **`bun.d.ts` under `src/` does nothing** when the tsconfig has no
  `include`; it must sit at the package root, or be named explicitly.
- **Do not derive `bun.d.ts` from `z.infer`.** They are the two ends of the
  parse and they differ on purpose.
- **A central file that lists instead of composing** is a layer folder
  wearing a module's name.
