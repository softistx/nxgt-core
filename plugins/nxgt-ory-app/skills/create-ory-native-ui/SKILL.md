---
name: create-ory-native-ui
description: >-
  Build an SSR UI whose visitors are Kratos identities and which owns its own
  self-service screens — registration, login, recovery, verification, settings
  — on @nxgt/ory-sdk/flows and @nxgt/ory-react. Use when adding or converting
  a product UI on top of an Ory-native API. The UI decides nothing about
  access, and it borrows no screens from another app.
---

# Skill: Create an Ory-native UI

> **Read `references/ory-in-one-page.md` first.** It carries the model — who is
> calling, which listeners are unauthenticated, which package entry point is
> which — and *Owning the self-service flows*, which is what makes your own
> screens possible at all. All of it is framework-free. This file is the delta
> for React Router.

## Purpose
Use this skill to build a UI whose visitors are Kratos identities and whose
data comes from an Ory-native API (`create-ory-native-rest-api` here, or
`create-ory-native-graphql-api` in `nxgt-federation`). The UI itself decides
**nothing** about access: it signs the visitor in and shows what the API
answers.

A UI built this way is a **Kratos front end in its own right**. It renders its
own registration, login, recovery, verification and settings screens against
the flows its own Kratos serves. It does not send its visitors to another app
to sign in, and it imports no other app's code — only two published packages.

---

## The default shape: your own front end

| | |
| --- | --- |
| Served at | its own host, its own port |
| Who is signed in | Kratos `whoami` with the visitor's `ory_kratos_session` cookie |
| Sign-in screen | **its own** `/login`, a route of this app, submitting through `@nxgt/ory-sdk/flows` |
| API receives | the forwarded `Cookie` |
| What it depends on | `@nxgt/ory-sdk` and `@nxgt/ory-react`, from npmjs — and nothing else of the stack's |

It is **SSR** on Bun + Hono (`react-router-hono-server`), never an SPA, and now
for one reason rather than two: **every call to Kratos is made by your server**,
with `accept: application/json`, and every `Set-Cookie` it answers is carried
back onto your own response. That is what makes the session yours — the cookie
carries no `Domain`, so it belongs to whichever origin served it. `ssr: true`,
`react-router-hono-server/bun` and the Web-streams `entry.server.tsx` all come
from the reference app. **No `VITE_` variable in `app/env.server.ts`, ever.**

Two variants exist. Neither is the default, and both are cheaper only in a
specific case: *Sharing one session across apps on one host* and *A route
subtree (the operator console)*, below.

**OAuth2 is not this skill's.** A UI that must live on another domain from any
Kratos it could use, or a machine caller bearing a token, is
`nxgt-ory-oauth2`'s subject — not written yet. The material is frozen in
`references/oauth2-on-hold.md`, and three apps run it today.

---

## Your Kratos serves your screens

The cookie decides this, and it is worth stating as a rule rather than a
detail: **`ory_kratos_session` is host-only.** A browser will not send it to an
origin other than the one Kratos set it on. So a UI can only own its screens if
a Kratos **public** listener answers on its own origin. Two ways, and the first
is the direction:

- **Your own Kratos and Keto**, configured to this product's needs: its own
  identity schema, its own flow `ui_url`s pointing at *your* routes, its own
  OPL namespaces. This is the only way to own **all** of it: `ui_url` is
  absolute and instance-wide, so an instance has exactly one UI origin that
  can complete a browser flow, and the emailed recovery link and the
  `session_refresh_required` redirect follow it whatever you do. `nxgt-ory`'s
  `config/` is the worked example of that file set — `kratos.yaml`,
  `identity.schema.json`, `keto.yaml`, `keto.namespaces.ts` — and its
  `docker-compose.yaml` is the worked example of the services. Copy them into
  your repo and change what your product needs; do not bind-mount another
  repo's.
- **A path prefix on a host that already runs one** — see *Sharing one session
  across apps on one host*. Take it only when sharing the session is what you
  actually want.

> **Status, so nobody reads more into this than is there:** `self-learning` is
> the first app to run its own pair, and until that lands the only apps with
> their own screens are `nxgt-ory`'s `kratos` and the ones sharing its host.
> What is above is the shape to build; what is measured is in that repo.

---

## When to use
- A product UI for signed-in Kratos identities, on top of an Ory-native API.
- Converting a UI that today borrows another app's sign-in screens.

Do **not** use it for a UI of an oauth-api–backed API (`storex-ui`,
`oauth-admin` shape: `stx-sdk/oauth/react`, `localStorage` session, SPA) — and do
not mix the two auth modules in one app.

---

## What a UI adds to the model

- **Your UI owns its screens.** Registration, login, recovery, verification and
  settings are routes of this app, rendered from the node tree Kratos answers
  with. There is no app to borrow them from.
- **Do not copy kratos-ui's flow *init*.** Its `urls.server.ts` builds a
  `browserInitUrl` and `redirectDocument`s the visitor to
  `/self-service/<kind>/browser`, which it can do because it proxies Kratos
  **and** owns every `ui_url`. You are not that origin. Initialise
  server-side with `forward(request)`, `carry()` the `Set-Cookie`s onto your
  response, render your own form and submit by flow id. Copied as it stands,
  that line lands your visitor on kratos-ui's login screen with a working
  cookie — which is exactly why it looks like it works.
- **The subject is the identity id**: `session.identity.id`. The API's Keto
  tuples are about that string.
- **The UI reaches only public listeners**: Kratos public (`whoami`, the flows)
  and the API's own address — there is no gateway in between. Never Kratos
  admin, never Keto read or write: no `KETO_*` in the UI's env at all.
- **Unavailable is never anonymous.** Kratos not answering is a 503 page, never
  a redirect to login and never an empty list.
- **The API decides.** 404 for what the caller may not see, 403 for an edit a
  viewer attempted, `myAccess` on each object for what to render. Do not add
  a UI-side Keto check "to save a round trip" — a UI that decides is a UI that
  can be wrong about what the API will do, and the 404 stops meaning what it
  means.

---

## kratos-ui is an example, not a dependency

`nxgt-ory`'s `kratos` app is the **reference implementation** of everything in
this skill: `app/modules/kratos/` (the flow plumbing) and its `routes/auth/`
screens are what to read and copy. Copy them — do not import them, do not route
your visitors through them, and do not add a route to that app on behalf of
yours.

The one thing that legitimately lives inside it is **`/admin`**, the operator
console, because it fronts the stack's own unauthenticated admin listeners. See
*A route subtree*.

## Your screens

Five flows, each the same three beats: **initialise** (browser endpoint, which
sets the anti-CSRF cookie), **render the node tree**, **submit and read the
answer back**. `@nxgt/ory-sdk/flows` has the readers for all of it.

| Route | Flow | What it must get right |
| --- | --- | --- |
| `/registration` | `registration` | the traits come from **your** `identity.schema.json`; field errors are per-node |
| `/login` | `login` | `return_to` is absolute or Kratos ignores it; `refresh` and `aal2` are the same route |
| `/recovery` | `recovery` | answers 200 with a message whether or not the address exists — do not "fix" that |
| `/verification` | `verification` | reached from a link in a mail, so it lands with a `flow` id and no session |
| `/settings` | `settings` | `privileged_session_max_age` sends it back to `/login?refresh=true` mid-flow |

For every one of them: read `flow.ui.nodes`, group with `hasGroup`, take the
token with `getCsrfToken`, render the messages with `getFlowMessages`, the
per-field ones with `getFieldErrors`, and follow `continueTo` after a success.
`flowState` tells a fresh flow from an expired one. Never post to Kratos from
the browser: the submit is an action, server-side, and the response's
`Set-Cookie` must be carried back — including on a 4xx, which is where Kratos
rotates the CSRF cookie.

## The plumbing is the packages'

`call.server.ts` used to be byte-identical in three apps, and the node readers
were one copy away from a second. They are `@nxgt/ory-sdk/flows` now:

| Import from `@nxgt/ory-sdk/flows` | |
| --- | --- |
| `call`, `forward`, `carry`, `cookieOf` | the funnel that harvests **every** `Set-Cookie`, on the failing branch too — a 4xx is where Kratos rotates the CSRF cookie |
| `createFlows({ kratosPublic })` | read a flow back by id, send a submit |
| `getCsrfToken`, `getFieldErrors`, `getFlowMessages`, `getNodeValue`, `hasGroup`, `flowState`, `continueTo` | reading the node tree Kratos answers with |
| the flow / submit type aliases, `FlowKind`, `FlowLike`, `KratosErrorBody` | Kratos's shapes |
| `BROWSER_INIT_PATH`, `FLOW_PATH` | the ten endpoints, typed against the spec |

and the route guards are `@nxgt/ory-react`: `createSessionGuard`,
`createPermissionGuard`, `loginRedirect` from `/server`, `Forbidden` and
`readDenial` from `/ui`. Two entries, because a route's `middleware` export is
stripped from the client bundle and one entry holding both halves would rely on
tree-shaking to keep it that way.

**What is not in a package yet, stated honestly:** the React half of the flow
plumbing — the form components, `useFlowErrors`, `useFlowReply`, the session
context — is still hand-written in `nxgt-ory`'s `kratos` app. Copying it from
there is the current answer, and extracting it to `@nxgt/ory-react/flows` is the
next piece of work. Write it so that swapping a copy for an import is a change
of import line.

What the app writes itself, because the SDK deliberately refuses to hold it:

- **`flow.server.ts`** — `loadFlow`/`submitFlow` choose between `redirect` and
  `redirectDocument`, and that choice is whether the visitor gets an anti-CSRF
  cookie at all.
- **`context.ts`** — React Router matches contexts by object identity; one
  created inside a linked package is a *different* context. Never import a
  context from a package.
- **`Traits` / `readTraits` / `submitTraits`** — they derive from the identity
  schema, which is **yours**.
- **`urls.server.ts`** — it reads `APP_URL`; the SDK never reads the
  environment.

The long form is `packages/ory-sdk/docs/08-flows.md` and
`packages/ory-react/docs/09-route-guards.md`, in the `nxgt-ory` repository.

---

## Shared machinery (copy from the reference, do not rewrite)

| File | What it is |
| --- | --- |
| `react-router.config.ts` | `ssr: true`; the shared-host variant adds `basename: '/<prefix>/'` and vite `base` |
| `app/server.ts` | Hono + `languageDetector`, a **`/health`** (or `/<prefix>/health`) that answers without a session — probes must never hit `/` (the anonymous 302 chases login forever); the shared-host variant adds the `serveStatic` rewrite of the prefix |
| `app/entry.server.tsx` | Web-streams entry — without it Bun 500s on `renderToPipeableStream` |
| `app/env.server.ts` | zod over `process.env`, **no `VITE_`** — the browser must not learn any of it |
| `app/shared/reply.server.ts`, `app/hooks/use-action-reply.ts` | actions answer `data()` never `redirect()`; `useActionReply` waits for `idle`; `attempt()` turns a thrown `Response` into a fail reply the page toasts |
| `app/modules/api/*.server.ts` | **the only place the API is called**; a non-2xx / GraphQL error becomes a thrown `Response` with the API's own status; a dead socket is a 503 |
| `app/modules/kratos/` | the client, the session bracket, the flow helpers and `Traits` — **not** a call funnel: `call`, `forward`, `carry` and the flow types come from `@nxgt/ory-sdk/flows` |
| `app/root.tsx` | the session middleware, the viewer loader, `ErrorBoundary` pages for 404 / 503 |
| `routes/app/layout.tsx` | the one guard (`requireSession()`); nothing else |
| `shouldRevalidate` on the detail route | skip revalidation after a successful delete, or the loader's 404 lands before the navigation |
| `app/i18n/*`, `AppShell`, `@nxgt/material` forms | as in the reference; a component another app could use goes to `@nxgt/material` (memory: *Reusable UI goes to nxgt-material*) |

## Cookies and env

- **`ory_kratos_session` is Kratos's**, host-only, and the app sets nothing of
  its own to identify a visitor. Commit Kratos's `Set-Cookie` on the way out of
  every request that talked to it — including through a thrown redirect.
- Any cookie the app *does* sign itself (a `return_to`, a flash) is
  **httpOnly**, **`SameSite=Lax`**, and `secure` following **`APP_URL`'s
  scheme** — not `NODE_ENV`, which is `production` in a container serving
  `http://` behind a proxy.
- **`.env.local`, not `.env.development.local`** — Bun loads the first, not the
  second.

---

## Sharing one session across apps on one host

The variant that used to be the first question this skill asked, and the only
reason left to take it:
two apps are meant to share **one** `ory_kratos_session`, so that signing in to
one signs you in to the other. `sellix-monorepo`'s
`apps/bookmarks/bookmarks-ui` does exactly that on kratos-ui's host. If you do
not want that sharing, you want your own host and your own Kratos.

- **`sessionMiddleware` on the root route only**: one `whoami` per request
  with the visitor's cookie forwarded; commits Kratos's `Set-Cookie` on the
  way out, including through a thrown redirect. `requireSession()` on the
  layout, pure, `redirectDocument` to the host's `/login?return_to=<absolute
  URL>` (relative `return_to` is silently ignored by Kratos; strip `.data`).
- **`/logout`** is loader-only: `redirectDocument(<host>/logout?return_to=APP_URL)`.
- **The API call forwards `Cookie`**, whole, from loaders and actions. No
  other header identifies the caller.
- **Numbers**: a free dev port (`ss -ltn`; 5177 kratos-ui, 5179 bookmarks-ui
  — 5178 is free again since the console merged into kratos-ui),
  `APP_URL=http://localhost:<port>/<prefix>`, added to
  `allowed_return_urls` in that stack's `config/kratos.yaml` (`bun docker
  restart kratos` there). Production is the shared host, already listed. When
  that file is in another repo it is its own PR, and nothing in this repo
  fails when you forget it — the redirect just 400s at runtime.
- **Raw URLs carry the prefix by hand** (`links()`, `window.location.assign`,
  the error page's back button); `<Link>` and `navigate()` get it from the
  router.
- **Compose**: a service in the product group's `docker-compose.yaml`, Traefik
  ``Host(`<shared host>`) && PathPrefix(`/<prefix>`)``, `depends_on` the
  API healthy, `<API>_URL=http://<api>:${APP_PORT}/api` container to container.
- **Read `apps/bookmarks/bookmarks-ui/AGENTS.md`** in `sellix-monorepo` — every
  trap of the prefix shape is listed there once.

## A route subtree (the operator console)

**kratos-ui lives in the sibling repo `nxgt-ory`.** This variant is therefore a
change *there*, not here — and it is still the right answer when the UI belongs
to the stack's own product, as `/admin` does. **That repo has its own skill for
it, `add-console-module`; load that one and stop reading this section**, which
stays only so the choice can be made from here.

A path prefix on a shared host costs a `basename` plus a matching Vite `base`,
a `serveStatic` rewrite, a `/<prefix>/health` for probes, `/<prefix>` written by
hand into `links()` and every `window.location.assign`, a second Traefik router
that wins only on rule length, a second dev port in `allowed_return_urls`, and
a second dev server in the e2e config. As a route subtree, **all of it is just
`prefix('admin', …)`** in `app/routes.ts`, because the router is already at the
host root.

What you must put back, because it is what the separate app was buying:

- **One layout carries the guard**, and every route in the subtree sits under
  it: `requireSession()` + `requirePermission(...)`. The unauthenticated
  listeners have no access control of their own, so this layout *is* the
  access control.
- **An import boundary replaces the process boundary.** Add the module to that
  repo's root `biome.json` `noRestrictedImports` override — the mechanism already
  guards `@nxgt/ory-sdk/tuples` and `@nxgt/ory-sdk/admin`. Without it, a future
  public route in the same app can import the admin client and become an
  anonymous dump of whatever it fronts. Verify the rule actually bites by
  adding the import to a public route and running `bun run check`.
- **Do not hand-write the guards.** `@nxgt/ory-react/server` has
  `createSessionGuard`, `createPermissionGuard` and `loginRedirect`;
  `@nxgt/ory-react/ui` has `Forbidden` and `readDenial`. Wire them in
  `app/middlewares/guards.server.ts` — kratos-ui and bookmarks-ui are the two
  worked examples, same-origin and cross-host. `identify` (naming the account
  in the 403 body) is opt-in and belongs to an internal console only.
  `packages/ory-react/docs/09-route-guards.md` is the contract.
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

Do NOT make a different product's UI a route subtree of yours: it would ship
that product's code, dependencies and deploy cadence inside the sign-in path
every visitor of yours depends on.

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
identities through Kratos's admin API and signs them in **through this app's
own screens**, then banks `storageState`. Specs assert against **Keto**
(`isAllowed`) what a save / share / unshare / delete did, not only what the
page shows. The self-service screens are now yours, so they are part of the
suite: a registration that reaches a session, a login that honours `return_to`,
and a settings save that survives the privileged-session bounce.

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

## The production bundle is its own test, and it has failed twice

`bun run dev` proves nothing about `build/`. Two migrations shipped a bundle
that threw on its **first request — `/health` included** — while every check
was green, because nothing boots the artifact.

The failure both times: `@nxgt/material` re-exports a PDF viewer over
`@react-pdf/renderer`, so `pdfkit` is in the server graph whether or not a route
renders a PDF. pdfkit registers its fourteen standard fonts with
`createRequire(import.meta.url)('#standard-fonts/<name>')` — a package-`imports`
specifier private to pdfkit, called at **runtime**, so no bundler resolves it.
The literal survives into the bundle, where `createRequire` is rooted at the
build directory: `Cannot find module '#standard-fonts/Helvetica'`, on every
route. A compose healthcheck that fetches `/` never goes healthy either.

**The cure is upstream, and it is the first thing to check.** `@nxgt/material`
2.0.0 moved those components to `@nxgt/material/print` and made
`@react-pdf/renderer` an optional peer dependency, so an app that does not print
never carries `pdfkit` at all. On that version there is nothing to do — measured
on nxgt-ory's `kratos-ui`: bundle 13.73 MB → 11.90 MB with its local workaround
removed. On an older one, or in an app that DOES print, pick by one fact —
whether the runtime image ships a `node_modules`:

| Runtime image | Fix |
| --- | --- |
| Ships `node_modules` (most product repos) | drop `@nxgt/material` from `ssr.noExternal` **and** add `--external @nxgt/material` to `build:server`. Also cuts the bundle by an order of magnitude (14.45 MB → 1.74 MB measured in content-hub, 14.60 → 1.92 in self-learning) |
| Ships `build/` only (nxgt-ory's `kratos`) | `pdfkitStandardFonts()` from `@nxgt/material/vite` — the same Vite `transform`, published once instead of copied per repo. `nxgt-ory/kratos/vite.config.ts` carried the first copy |

`resolve.alias` does **not** work and is the obvious first attempt: an alias
rewrites specifiers the resolver is asked about, and this one is a string handed
to `createRequire`. Neither does `--external pdfkit`: it is transitive, so the
runtime cannot resolve it from the app's directory.

So, after `bun run build`, always:

```bash
grep -c '#standard-fonts/' build/app.js        # want: 0
<env…> bun ./build/app.js &                    # boot the artifact
curl -o /dev/null -w '%{http_code}\n' localhost:$PORT/health   # want: 200, not 000
```

`000` is the shape of this bug: the process is up, the request dies.

## Documentation (mandatory — part of the same branch)
1. `README.md` — running it (Kratos and Keto, the API, then this),
   *Try it end to end*, the fit, non-goals (no Keto client, no admin listener,
   not an SPA).
2. `docs/README.md` + `01-…` (session / the flow round trip) + `02-…`
   (authorization: why the UI decides nothing) + `03-troubleshooting.md` —
   real failures only.
3. `AGENTS.md` — the imperative; last section is this list.
4. Root `CLAUDE.md` per-app list; and, if you share another stack's host, that
   repo's `config/kratos.yaml` `allowed_return_urls` — its own PR.

## Steps
1. Stack up — your Kratos and Keto, or the host you are sharing — and the API.
2. Copy the reference app; rename; pick the port; write `.env.development`.
3. Write the identity schema and the OPL namespaces your product needs, and
   point every flow `ui_url` at your own routes.
4. Build the five self-service routes against `@nxgt/ory-sdk/flows`; wire the
   guards from `@nxgt/ory-react/server`.
5. Replace the API module (`app/modules/api`) and the domain components.
6. `bun run typecheck`, `bunx biome check --write .`, `bun run build`, boot
   the bundle once and `curl` `/health` and `/` (302). **Boot the artifact, not
   the dev server** — see "The production bundle is its own test": `000` means
   the bug above, not a slow start.
7. Playwright, then documentation, then PR to `develop`.

## Checklist before finishing
- [ ] SSR; nothing `VITE_`-prefixed; no `KETO_*`, no admin URL in the app's runtime env
- [ ] The five self-service routes exist here, and no visitor is sent to another app to sign in
- [ ] One session middleware on the root; the guard on the layout; `redirectDocument` to every other origin
- [ ] Kratos's `Set-Cookie` is carried back on the failing branch too
- [ ] The API is called from `.server.ts` only, with the forwarded cookie; statuses pass through untouched
- [ ] `API_URL` points at the API itself; no `KETO_*` and no admin listener anywhere in the UI env
- [ ] `/health` answers anonymously; probes point there
- [ ] No hand-written `call.server.ts` or node readers — they are `@nxgt/ory-sdk/flows`; the session context stays local
- [ ] `bun run build`, then the bundle booted and `/health` curl'd — no `#standard-fonts/` left in it
- [ ] Playwright signs in through this app's own screens and asserts against Keto
- [ ] README + docs/ + AGENTS.md + CLAUDE.md list
