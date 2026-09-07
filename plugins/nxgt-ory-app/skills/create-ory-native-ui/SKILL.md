---
name: create-ory-native-ui
description: >-
  Build an SSR UI whose visitors are Kratos identities, in whichever of the
  three shapes applies: a path prefix on kratos-ui's host, a route subtree of
  kratos-ui, or an OAuth2 client of Hydra on its own host. Use when adding a
  product UI on top of an Ory-native API. The UI decides nothing about access.
---

# Skill: Create an Ory-native UI

## Purpose
Use this skill to build a UI whose visitors are the Ory stack's identities
(the sibling repo `nxgt-ory`: Kratos accounts, kratos-ui's screens) and whose
data comes from
an Ory-native API (`create-ory-native-rest-api` here, or
`create-ory-native-graphql-api` in `nxgt-federation`). The UI itself decides
**nothing** about access: it signs the visitor in and shows what the API
answers.

There are two shapes, and the first question is which one:

| | (a) Path prefix on kratos-ui's host | (b) OAuth2 client of Hydra, own host |
| --- | --- | --- |
| Reference | **`apps/bookmarks/bookmarks-ui`** (this repo) | **`nxgt-federation/apps/notes/notes-ui`** |
| Served at | `kratosix.$HOST/<prefix>`, dev `localhost:517x/<prefix>` | its own host / port |
| Who is signed in | Kratos `whoami` with the visitor's `ory_kratos_session` cookie | a Hydra token set in the app's own signed cookie |
| Sign-in screen | kratos-ui's `/login` with `return_to` | Hydra → kratos-ui's `/oauth2/login` + `/oauth2/consent` |
| API receives | the forwarded `Cookie` | `Authorization: Bearer` |
| If the API is behind Oathkeeper | unchanged — the edge reads the same cookie | unchanged — the edge introspects the same Bearer |
| Extra moving parts | `allowed_return_urls` in `kratos.yaml`, Traefik `Host && PathPrefix` | a registered Hydra client, `SESSION_SECRET`, refresh |
| Pick when | the UI can live on kratos-ui's host | it cannot (another domain, another team's host, a machine-facing surface) |

There is also a **shape (c)**, and it is the one to reach for first: when the
UI is part of kratos-ui's own product rather than a separate app, make it a
**route subtree of kratos-ui** — see "Shape (c)" below. It is strictly cheaper
than (a).

Both (a) and (b) are **SSR** on Bun + Hono (`react-router-hono-server`) —
the console's shape, kratos-ui's discipline. Shape (a) because the Kratos cookie is
host-only and must be forwarded server-side; shape (b) because the client
secret and the tokens must not reach a bundle. Neither is an SPA. Concretely, for (b): React Router's
`createCookieSessionStorage` signs the tokens into an httpOnly cookie, loaders
call the API with `Authorization: Bearer` from the server, and the browser
holds nothing it could leak. `ssr: true`, `react-router-hono-server/bun` and
the Web-streams `entry.server.tsx` all come from the reference app. **No
`VITE_` variable in `app/env.server.ts`, ever.**

---

## When to use
- A product UI for signed-in Kratos identities, on top of an Ory-native API.
- Any second Ory app on kratos-ui's host (shape a), or any Ory app that has
  to live elsewhere (shape b).

Do **not** use it for a UI of an oauth-api–backed API (`storex-ui`,
`oauth-admin` shape: `stx-sdk/oauth/react`, `localStorage` session, SPA) — and do
not mix the two auth modules in one app.

---

## Ory in one page (what a UI needs to know)

- **The stack**: `cd ../nxgt-ory && bun run setup`; kratos-ui `bun run dev` on
  5177 — it owns registration, login, recovery, settings, and Hydra's login /
  consent / logout screens. Your UI has **no login form**.
- **The Kratos cookie is host-only.** A UI on another host cannot read it;
  that is the whole reason shape (b) exists (memory: *Kratos cookie is
  host-only*).
- **The subject is the identity id**, whichever door: `session.identity.id`
  for a cookie, the token's `sub` for Hydra (public subject identifiers).
  The API's Keto tuples are about that string.
- **The UI reaches only public listeners**: Kratos public (`whoami`, shape a)
  or Hydra public (shape b), and the API — which may be the API's own address
  or Oathkeeper's proxy (`4455`) in front of it, the UI cannot tell and must
  not care. Never Kratos admin, Keto (read or write), Hydra admin, and never
  Oathkeeper's API listener (`4456`, it serves the whole policy) — no `KETO_*`
  and no `OATHKEEPER_API_URL` in the UI's env at all.
- **The edge changes nothing for a UI.** It consumes the same cookie or the
  same Bearer, so pointing `API_URL` at `:4455` instead of the API is a config
  change and nothing more. Two statuses become possible that the API alone
  would not send: a **401 whose body is not translated** (the edge refused
  before reaching the API) and a **403 meaning "this identity may not use this
  app at all"** (`App:<app>#use`), which is not about any object. Handle both
  as you already handle 401 and 403; do not try to distinguish them.
- **Unavailable is never anonymous.** Kratos / Hydra not answering is a 503
  page, never a redirect to login and never an empty list.
- **The API decides.** 404 for what the caller may not see, 403 for an edit a
  viewer attempted, `myAccess` on each object for what to render. Do not add
  a UI-side Keto check "to save a round trip". This holds with an edge in
  front: Oathkeeper is deliberately not allowed to answer about an object,
  precisely so that the 404 keeps meaning what it means.

---

## Shared machinery (both shapes — copy from the reference, do not rewrite)

| File | What it is |
| --- | --- |
| `react-router.config.ts` | `ssr: true`; shape (a) adds `basename: '/<prefix>/'` and vite `base` |
| `app/server.ts` | Hono + `languageDetector`, a **`/health`** (or `/<prefix>/health`) that answers without a session — probes must never hit `/` (the anonymous 302 chases login forever); shape (a) adds the `serveStatic` rewrite of the prefix |
| `app/entry.server.tsx` | Web-streams entry — without it Bun 500s on `renderToPipeableStream` |
| `app/env.server.ts` | zod over `process.env`, **no `VITE_`** — the browser must not learn any of it |
| `app/shared/reply.server.ts`, `app/hooks/use-action-reply.ts` | actions answer `data()` never `redirect()`; `useActionReply` waits for `idle`; `attempt()` turns a thrown `Response` into a fail reply the page toasts |
| `app/modules/api/*.server.ts` | **the only place the API is called**; a non-2xx / GraphQL error becomes a thrown `Response` with the API's own status; a dead socket is a 503 |
| `app/modules/kratos/` (shape a) | the client, the session bracket, `Traits` — **not** a call funnel: `call`, `forward`, `carry` and the flow types come from `stx-sdk/ory/flows` |
| `app/root.tsx` | the session middleware, the viewer loader, `ErrorBoundary` pages for 404 / 503 (shape b adds 400 for a refused callback) |
| `routes/app/layout.tsx` | the one guard (`requireSession()` / `requireAuth()`); nothing else |
| `shouldRevalidate` on the detail route | skip revalidation after a successful delete, or the loader's 404 lands before the navigation |
| `app/i18n/*`, `AppShell`, `@nxgt/material` forms | as in the reference; a component another app could use goes to `@nxgt/material` (memory: *Reusable UI goes to nxgt-material*) |

## Do not hand-write the Kratos plumbing

`call.server.ts` used to be byte-identical in three apps, and the node readers
were one copy away from a second. They are `stx-sdk/ory/flows` now:

| Import from `stx-sdk/ory/flows` | |
| --- | --- |
| `call`, `forward`, `carry`, `cookieOf` | the funnel that harvests **every** `Set-Cookie`, on the failing branch too — a 4xx is where Kratos rotates the CSRF cookie |
| `createFlows({ kratosPublic })` | read a flow back by id, send a submit |
| `getCsrfToken`, `getFieldErrors`, `getFlowMessages`, `getNodeValue`, `hasGroup`, `flowState`, `continueTo` | reading the node tree Kratos answers with |
| the flow / submit type aliases, `FlowKind`, `FlowLike`, `KratosErrorBody` | Kratos's shapes |
| `BROWSER_INIT_PATH`, `FLOW_PATH` | the ten endpoints, typed against the spec |

What the app still writes itself, because the SDK deliberately refuses to hold
it:

- **`flow.server.ts`** — `loadFlow`/`submitFlow` choose between `redirect` and
  `redirectDocument`, and that choice is whether the visitor gets an anti-CSRF
  cookie at all.
- **`context.ts`** — React Router matches contexts by object identity; one
  created inside a linked package is a *different* context, which
  `stx-sdk/scripts/assert-context-identity.ts` exists to catch. Never import a
  context from `stx-sdk`.
- **`Traits` / `readTraits` / `submitTraits`** — the identity schema is the
  stack's (nxgt-ory's `config/identity.schema.json`).
- **`urls.server.ts`** — it reads `APP_URL`; the SDK never reads the
  environment.

The long form is `docs/ory/08-flows.md` in the `stx-sdk` repository.

---

## Shape (a) — path prefix on kratos-ui's host (`apps/bookmarks/bookmarks-ui`)

- **`sessionMiddleware` on the root route only**: one `whoami` per request
  with the visitor's cookie forwarded; commits Kratos's `Set-Cookie` on the
  way out, including through a thrown redirect. `requireSession()` on the
  layout, pure, `redirectDocument` to kratos-ui's `/login?return_to=<absolute
  URL>` (relative `return_to` is silently ignored by Kratos; strip `.data`).
- **`/logout`** is loader-only: `redirectDocument(KRATOS_UI_URL/logout?return_to=APP_URL)`.
- **The API call forwards `Cookie`**, whole, from loaders and actions. No
  other header identifies the caller.
- **Numbers**: a free dev port (`ss -ltn`; 5177 kratos-ui, 5179 bookmarks-ui
  — 5178 is free again since the console merged into kratos-ui),
  `APP_URL=http://localhost:<port>/<prefix>`, added to
  `allowed_return_urls` in nxgt-ory's `config/kratos.yaml` (`bun docker
  restart kratos` **from nxgt-ory**). Production is the shared host, already
  listed. That file is in another repo: it is its own PR, and nothing in this
  repo fails when you forget it — the redirect just 400s at runtime.
- **Raw URLs carry the prefix by hand** (`links()`, `window.location.assign`,
  the error page's back button); `<Link>` and `navigate()` get it from the
  router.
- **Compose**: a service in the product group's `docker-compose.yaml`, Traefik
  ``Host(`kratosix.${HOST}`) && PathPrefix(`/<prefix>`)``, `depends_on` the
  API healthy, `<API>_URL=http://<api>:${APP_PORT}/api` container to container.
- **Read `apps/bookmarks/bookmarks-ui/AGENTS.md`** — every trap of the prefix
  shape is listed there once. (It used to be ory-admin's own `AGENTS.md`; that
  app is now shape (c).)

## Shape (c) — a route subtree of kratos-ui (nxgt-ory, `/admin`)

**kratos-ui lives in the sibling repo `nxgt-ory`.** Shape (c) is therefore a
change *there*, not here — reachable, and still the right answer when the UI
belongs to the stack's own product, but it does not ship in this repo's PR.
**That repo has its own skill for it, `add-console-module`; load that one and
stop reading this section**, which stays only so the choice between the three
shapes can be made from here.

**Prefer this over shape (a) whenever the UI belongs to kratos-ui's own
product** — the operator console did, and moving it here deleted an entire
class of problem rather than solving it.

Shape (a)'s cost is not "a second app", it is *a path prefix on a shared host*:
a `basename` plus a matching Vite `base`, a `serveStatic` rewrite, a
`/<prefix>/health` for probes, `/<prefix>` written by hand into `links()` and
every `window.location.assign`, a second Traefik router that wins only on rule
length, a second dev port in `allowed_return_urls`, and a second dev server in
the e2e config. As a route subtree, **all of it is just `prefix('admin', …)`**
in `app/routes.ts`, because the router is already at the host root.

What you must put back, because it is what the separate app was buying:

- **One layout carries the guard**, and every route in the subtree sits under
  it: `requireSession()` + `requirePermission(...)`. The unauthenticated
  listeners have no access control of their own, so this layout *is* the
  access control.
- **An import boundary replaces the process boundary.** Add the module to that
  repo's root `biome.json` `noRestrictedImports` override — the mechanism already
  guards `stx-sdk/ory/tuples` and `stx-sdk/ory/admin`. Without it, a future
  public route in the same app can import the admin client and become an
  anonymous dump of whatever it fronts. Verify the rule actually bites by
  adding the import to a public route and running `bun run check`.
- **Do not hand-write the guards.** `stx-sdk/ory/react/server` has
  `createSessionGuard`, `createPermissionGuard` and `loginRedirect`;
  `stx-sdk/ory/react/ui` has `Forbidden` and `readDenial`. Two entries, because
  a route's `middleware` export is stripped from the client bundle and one
  entry holding both halves would rely on tree-shaking to keep it that way.
  Wire them in `app/middlewares/guards.server.ts` — kratos-ui and bookmarks-ui
  are the two worked examples, same-origin and cross-host. `identify` (naming
  the account in the 403 body) is opt-in and belongs to an internal console
  only. `stx-sdk/docs/ory/09-route-guards.md` is the contract.
- **The guard's 403 page stays on `root.tsx`, and discriminates on the thrown
  BODY.** The instinct is to put it on the subtree's layout, since the root now
  serves public flows where a 403 means something else — but React Router picks
  the boundary for an error thrown in `middleware` as
  `min(index of the throwing route, index of the first match with a handler to
  call)`, and a root with a loader pins that to 0. A pathless layout under the
  subtree does not move it; that was tried and measured. So make
  `requirePermission` throw a `Response` whose JSON body carries the permission
  and the identity, and have the root boundary render the 403 page when it sees
  that body — public flows never throw one shaped like it. See
  nxgt-ory's `kratos/app/components/forbidden.tsx`.
- **Do not answer that by moving the guard into a loader.** Loaders run in
  parallel with their siblings and *after* a child route's `action`, so a
  non-administrator's delete would already have gone through. Middleware runs
  first, sequentially, and blocking; that is the whole reason to use it.

Do NOT use shape (c) for a different product's UI: it would ship that
product's code, dependencies and deploy cadence inside the sign-in path every
other app in the stack depends on. That is what shape (a) is for.

## Shape (b) — OAuth2 client of Hydra (`nxgt-federation/apps/notes/notes-ui`)

- **`stx-sdk/ory/oauth2`**: `createOAuth2Client({ issuer: HYDRA_PUBLIC_URL,
  clientId, clientSecret, redirectUri: `${APP_URL}/auth/callback`, scope:
  'openid offline email profile' })`. Every endpoint from discovery. Read
  `stx-sdk/docs/ory/03-oauth2-client.md`.
- **Session**: `createCookieSessionStorage` (React Router), httpOnly,
  `SameSite=Lax`, `secure` following `APP_URL`'s scheme, signed with
  `SESSION_SECRET` (≥ 32). Holds `pending { state, nonce, codeVerifier,
  returnTo }`, `tokens` (whole set, `expiresAt` as ISO), `viewer`.
- **Three loader-only routes**: `/auth/login` (`beginAuthorization`, bank
  `pending`, `redirectDocument` to Hydra with the cookie committed);
  `/auth/callback` (check `state`, `exchangeCode` with the verifier, store
  the **whole** token set, `/userinfo` once, redirect to `returnTo` —
  same-app paths only); `/auth/logout` (destroy the cookie,
  `redirectDocument` to `endSessionUrl({ idToken, postLogoutRedirectUri })`).
- **`authMiddleware` on the root only**: `isExpiring` → `refresh`; Hydra
  **rotates** refresh tokens, so store the returned set and **commit the
  cookie on the way out, through thrown redirects too**. `OAuth2Error` on
  refresh → anonymous; `OryUnavailable` → 503. `requireAuth()` on the
  layout; `bearerOf(context)` in loaders.
- **`scripts/register-client.ts`** creates / updates the Hydra client through
  the admin API (host-published `4445`, script only — the app never holds
  `HYDRA_ADMIN_URL`) and writes `HYDRA_CLIENT_ID` / `HYDRA_CLIENT_SECRET` to
  **`.env.local`** (gitignored; Bun does not load `.env.development.local`).
  `redirect_uris` must match byte for byte: change `APP_URL`, run it again.
- **Numbers**: own port (federation: 5401 for notes-ui), `APP_URL` without a
  prefix, `HYDRA_PUBLIC_URL` as the **browser** reaches Hydra (the issuer).

### The round trip (what you are wiring)

```
/                 requireAuth(): no auth → 302 /auth/login?return_to=/
/auth/login       oauth2.beginAuthorization() → bank { state, nonce, codeVerifier, returnTo } → redirectDocument(Hydra /oauth2/auth)
Hydra             → kratos-ui /oauth2/login (Kratos session? accept silently : its /login form) → /oauth2/consent (the one screen)
/auth/callback    state === pending.state? → exchangeCode({ code, codeVerifier }) → userinfo() once → store { tokens, viewer } → redirect(returnTo)
root middleware   isExpiring(tokens)? refresh → store the WHOLE set → commit the cookie on the way out (thrown redirects too)
loaders           gql(bearerOf(context), …) → notes-api
/auth/logout      destroySession → redirectDocument(endSessionUrl({ idToken, postLogoutRedirectUri }))  — Hydra ends Kratos too
```


### Key rules for shape (b) — each one is a failure that happened

- **`authMiddleware` on the root route only**; `requireAuth()` on the layout,
  pure; `bearerOf(context)` in loaders and actions. Never read the cookie
  again in a route.
- **Store the whole token set after `refresh`** — Hydra rotates refresh
  tokens — and **commit the cookie on the response even when a child threw a
  redirect**. Otherwise the visitor is signed out at the next request.
- **`redirectDocument` to every other origin** (Hydra, and Hydra's
  end-session). A client-side `redirect` there leaves a blank page.
- **Only same-app paths come back from `return_to`** (`safeReturnTo`), or
  `/auth/login` is an open redirect. Strip the `.data` suffix.
- **`redirect_uri` is derived from `APP_URL`** and registered from the same
  value: change `APP_URL`, run `register-client` again. Hydra matches byte
  for byte.
- **`scope: 'openid offline email profile'`** — `offline` earns the refresh
  token, `email` is what the header shows.
- **Cookie**: httpOnly, `SameSite=Lax` (the callback is a cross-site
  redirect), `secure` following `APP_URL`'s scheme (not `NODE_ENV`).
- **`.env.local`, not `.env.development.local`** — Bun loads the first, not
  the second.
- **Actions answer `data()`, never `redirect()`**; `useActionReply` waits for
  `idle`; `shouldRevalidate` skips revalidation after a successful delete;
  `attempt()` turns the API's thrown `Response` into a toast.
- **`/health` answers anonymously**; probes must never hit `/`.
- **Reusable components go to `@nxgt/material`**, not the app.

---

## Screens that list, filter and edit

Load **`admin-screen-pattern`** for that — the shell, `DataTable` and "load
more", filters in the URL rather than in Redux, actions answering `data()`, and
the whole-record `PUT` that clears what it omits. It is not Ory-specific, which
is why it is its own skill, but it is what an Ory console is made of.

---

## Testing
Playwright against the real stack — the thing under test is the redirect
dance, which a `redirect` where a `redirectDocument` was needed breaks only
after hydration, with nothing in any log. `auth.setup.ts` creates run-unique
identities through Kratos's admin API and signs them in **through the real
screens** (kratos-ui's login form; shape b continues through consent), then
banks `storageState`. Specs assert against **Keto** (`isAllowed`) what a
save / share / unshare / delete did, not only what the page shows.

Traps met, all one trap: **Playwright acts before React has hydrated.** Its
actionability checks read the DOM, which is complete long before the handlers
are attached, so a click on a `useFetcher` button or a dialog trigger is
dropped with no trace and the assertion times out on a page that looks fine.
Wrap the interaction *and* its proof in
`await expect(async () => { … }).toPass({ timeout: 30_000 })`. Three details
that cost time:

- `fillSettled` (kratos-ui `playwright/utils.ts`) is enough for ONE input. A
  form whose fields share a react-hook-form instance needs the whole fill in
  the retry — a late commit resets every field at once.
- Assert the field's **value**, not just that the submit lit up. A commit
  landing mid-fill can leave a controlled textarea holding the old value
  concatenated with the new one, which still validates.
- Opening a dialog is a **toggle**. Guard it (`if (!(await
  dialog.isVisible()))`) or the second attempt closes what the first opened.

Also: probe `/health`, never `/`. The suites take minutes — run them before a
PR, not on every save (the user asked not to block on them).

## Documentation (mandatory — part of the same branch)
1. `README.md` — running it (the stack, kratos-ui, the API, then this),
   *Try it end to end*, the fit, non-goals (no login form, no Keto client,
   not an SPA).
2. `docs/README.md` + `01-…` (session / round trip) + `02-…` (authorization:
   why the UI decides nothing) + `03-troubleshooting.md` — real failures only.
3. `AGENTS.md` — the imperative; last section is this list.
4. Root `CLAUDE.md` per-app list; nxgt-ory's `README.md` consumers table;
   nxgt-ory's `config/kratos.yaml` (shape a) if the dev origin changed. The
   last two are that repo's PR.

## Steps
1. Decide the shape (table above). Stack up, kratos-ui up, the API up.
2. Copy the reference app; rename; pick the port; write `.env.development`
   (shape b: `bun run register-client`).
3. Shape (a): `allowed_return_urls`; shape (b): the client is registered.
4. Replace the API module (`app/modules/api`) and the domain components;
   keep the auth module untouched.
5. `bun run typecheck`, `bunx biome check --write .`, `bun run build`, boot
   the bundle once and `curl` `/health`, `/` (302) and a forged callback
   (shape b: 400).
6. Playwright, then documentation, then PR to `develop`.

## Checklist before finishing
- [ ] SSR; nothing `VITE_`-prefixed; no `KETO_*`, no admin URL in the app's runtime env
- [ ] One session/auth middleware on the root; the guard on the layout; `redirectDocument` to every other origin
- [ ] The API is called from `.server.ts` only, with the cookie (a) or the Bearer (b); statuses pass through untouched
- [ ] Whether `API_URL` points at the API or at Oathkeeper's proxy is a config choice the UI code cannot see
- [ ] `/health` answers anonymously; probes point there
- [ ] Shape (a): prefix everywhere, `allowed_return_urls`; shape (b): whole token set stored, cookie committed after refresh, `register-client` documented
- [ ] No hand-written `call.server.ts` or node readers — they are `stx-sdk/ory/flows`; the session context stays local
- [ ] Playwright signs in through the real screens and asserts against Keto
- [ ] README + docs/ + AGENTS.md + CLAUDE.md list + nxgt-ory's `README.md` row
