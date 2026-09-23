# OAuth2 and Hydra — the reference, and deliberately not a skill

> **No skill loads this file, on purpose, and none ever will.** This is the
> destination, not a waiting room. `create-ory-native-ui` carries one line
> pointing here and nothing more, so the material costs no always-on tokens and
> triggers nothing.
>
> It is what was removed from `create-ory-native-ui` and `admin-screen-pattern`
> on 2026-09-22, when this plugin became about **identities and permissions
> only**. Until 2026-09-23 it said it would move into a `nxgt-ory-oauth2`
> plugin. **That plugin was dropped** — see *Why there is no plugin* at the
> bottom.
>
> Nothing here is known to be wrong. Three apps run exactly this today:
> `self-learning/apps/ui`, `content-hub/apps/ui`,
> `nxgt-federation/apps/notes/notes-ui`.

The one shape that left `create-ory-native-ui`, as its table stated it:

| | OAuth2 client of Hydra, own host |
| --- | --- |
| Reference | **`nxgt-federation/apps/notes/notes-ui`** |
| Served at | its own host / port |
| Who is signed in | a Hydra token set in the app's own signed cookie |
| Sign-in screen | Hydra → kratos-ui's `/oauth2/login` + `/oauth2/consent` |
| API receives | `Authorization: Bearer` |
| Extra moving parts | a registered Hydra client, `SESSION_SECRET`, refresh |
| Pick when | the UI cannot live on the Kratos host (another domain, another team's host, a machine-facing surface) |

---

## Shape (b) — OAuth2 client of Hydra (`nxgt-federation/apps/notes/notes-ui`)

- **`@nxgt/ory-sdk/oauth2`**: `createOAuth2Client({ issuer: HYDRA_PUBLIC_URL,
  clientId, clientSecret, redirectUri: `${APP_URL}/auth/callback`, scope:
  'openid offline email profile' })`. Every endpoint from discovery. Read
  `packages/ory-sdk/docs/03-oauth2-client.md` in `nxgt-ory`.
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
- **`offline` and `offline_access` are two different scopes**, not one name
  with a synonym. Hydra refuses `invalid_scope` when the authorization request
  asks for a scope the registered client does not list, so the client's `scope`
  must be a superset of what `oauth2.server.ts` sends — and a client declared
  in **both** `register-client` and nxgt-ory's `kratos/scripts/clients.seed.ts`
  must list every name either side uses. Seeding narrowed a working client to
  `offline_access` once and the next login failed with nothing wrong in the app.
- **Cookie**: httpOnly, `SameSite=Lax` (the callback is a cross-site
  redirect), `secure` following `APP_URL`'s scheme (not `NODE_ENV`).
- **`.env.local`, not `.env.development.local`** — Bun loads the first, not
  the second.

The last two are not about OAuth2 and did not only live here: they are also
stated, without Hydra, in `create-ory-native-ui`'s *Cookies and env*. They are
kept in this list so this file stands on its own, which it now does
permanently.

---

## A secret that exists once

Hydra returns `client_secret` only in the creation response and stores a hash.
The create screen therefore does **not** navigate away on success: it shows the
id and the secret with `CopyValue` and waits for the operator to dismiss the
panel. Never put the secret in a summary type or a loader — a field that can be
read back is a field somebody will assume can be read back. The spec asserts
this both ways: the panel shows it, and Hydra's own `GET /admin/clients` does
not.

`admin-screen-pattern` keeps the lesson without the instance, as *A write-once
value must not be loader-readable*.

---

## The API half — what the two API skills gave up

Not a lift: the API skills never had an OAuth2 section, they simply had Hydra
threaded through them. Assembled here so a later author starts from it rather
than re-deriving it.

- **`createOry({ …, hydraAdminUrl })`** is what turns the Bearer branch on. The
  option is optional, and `resolve` ignores `Authorization` entirely without it
  — answering `null`, never an error.
- **`resolve` looks at `Authorization` first**: first credential *present*
  wins, not first credential *valid*. A stale Bearer beside a live cookie is
  anonymous, not silently rescued. Introspection answering `active: false` is a
  `null` (anonymous), never a 503.
- The subject of a token is the **client's** id for `client_credentials`, and
  the end user's identity id for an authorization-code token.
- `HYDRA_ADMIN_URL` in `src/env.ts` (making it five Ory URLs, not four),
  `accessToken` on the Hono context, `token` on the Yoga context, and a
  `Bearer` security scheme in the OpenAPI document.
- **The specs' second actor was a `client_credentials` token**, and it was
  replaced rather than merely cut: a client id is a subject no product
  namespace ever writes a tuple for, so it exercised the middleware and nothing
  else. Its replacement is a real Kratos session token, which is also the one
  branch of `resolve` nothing else covered.

---

## Why there is no plugin

`nxgt-ory-oauth2` was planned, then **dropped on 2026-09-23**. The reasoning,
recorded so nobody re-proposes it as an oversight:

- **A skill earns its keep by being loaded.** Three apps run shape (b), all three
  are already wired, and none of them is likely to be rewired. A skill that
  fires once every several months is a file that drifts between the times it is
  read — and drifted guidance is worse than a reference somebody opens knowing
  its date.
- **Hydra left the doctrine.** The 2026-09-22 lot took it out of
  `ory-in-one-page.md`, out of both API skills and out of the env tables. A
  plugin would have put a whole marketplace entry behind a component the parc has
  decided not to lead with.
- **The material is a single flow, not a decision tree.** Everything above reads
  top to bottom: wire the client, bank the pending values, exchange, refresh,
  commit the cookie. There are no branches for a skill to steer between, which is
  what a skill is for.
- **This file is already the shape it needs.** It stands on its own — that was
  the constraint it was written under, back when it expected to move — so the
  move would have been a rename.

So: **this file is where the OAuth2 material lives.** Keep it accurate, date the
changes, and read it whole before wiring a relying party. If it ever does become
a skill, the trigger is a *fourth* app needing shape (b) and asking a question
this file does not answer — not tidiness.

### What was never this file's, and still is not

The operator console's Hydra client screens stay live in `nxgt-ory/kratos` under
that repo's `add-console-module`, and `admin-screen-pattern` keeps the
write-once-value and whole-record-`PUT` lessons, now taught on Kratos.

### Where the material lives, for whoever reads this

`self-learning/apps/ui`, `content-hub/apps/ui`,
`nxgt-federation/apps/notes/notes-ui`, `nxgt-ory/kratos/app/routes/oauth2/`,
`nxgt-ory/kratos/scripts/clients.seed.ts`, `@nxgt/ory-sdk`'s `./oauth2` and
`./hydra`, and `nxgt-ory/packages/ory-sdk/docs/03-oauth2-client.md`.

---

## What else named Hydra

The sentences removed elsewhere on 2026-09-22, so that whoever writes
`nxgt-ory-oauth2` knows what to put back rather than rediscovering it:

| Where | What was there |
| --- | --- |
| `references/ory-in-one-page.md`, ports | `Hydra 4444 public / 4445 admin` |
| same, *Who is calling* | a second door: `a Bearer → Hydra introspection`, whose subject was *the Kratos identity id or a machine client's id* |
| same, the unauthenticated listeners | the count was **three**: Hydra admin `4445` was the third |
| same, the host-run `sh` prefix | `HYDRA_ADMIN_URL=http://localhost:4445` |
| same, the entry-point table | `stx-sdk/ory/oauth2` — `createOAuth2Client`, *a relying party of Hydra*, for *a UI on another host*. It is `@nxgt/ory-sdk/oauth2` now and still published |
| `create-ory-native-rest-api`, `create-ory-native-graphql-api` | `HYDRA_ADMIN_URL` / `hydraAdminUrl` / `HYDRA_PUBLIC_URL` in the env tables; *and/or machines holding Hydra tokens*; the `accessToken` row; **the specs' second actor was a `client_credentials` token** — it is a real Kratos session token now |
| same, counted | the env list said **five Ory URLs**; it is four |
| `admin-screen-pattern`, pagination | Hydra paged by `Link: rel="next"`, alongside Kratos |
| same, filters | Hydra's `client_name` and `owner`, both exact |
| same, the whole-record `PUT` | Hydra's `PUT /admin/clients/{id}`, and the `grant_types` / `response_types` a form never shows |

None of it was deleted for being wrong. `/admin` in `nxgt-ory/kratos` still
operates Hydra clients today; `add-console-module` in that repo is what covers
those screens. And since no plugin is coming to put any of it back, this table is
the record — not a to-do list.
