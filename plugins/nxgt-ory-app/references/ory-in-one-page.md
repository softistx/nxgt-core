# Ory in one page

The model, and the parts that are the same whichever transport you build.
All three of `create-ory-native-rest-api`, `create-ory-native-graphql-api` and
`create-ory-native-ui` open by sending you here; read it once, then read the
one for your transport. Everything on this page is framework-free — it is what
a Vue or Nuxt front would need to know too.


| | |
| --- | --- |
| **Who runs the stack** | The sibling repo `nxgt-ory` — `cd ../nxgt-ory && bun run setup`. **Its files are not in this repo: changing a namespace is a PR there.** Kratos `4433` public / `4434` admin, Keto `4466` read / `4467` write / `4469` OPL, Mailpit `8025`. |
| **Who is calling** | `@nxgt/ory-sdk`'s `resolve(headers)`: a Kratos cookie or an `X-Session-Token` → `whoami`. Either way an `OryPrincipal` whose **`subject`** is the Kratos identity id. One person is one string, whichever transport. A machine caller bearing an OAuth2 token is not this plugin's subject — see `references/oauth2-on-hold.md`. |
| **May they** | Keto: `isAllowed({ namespace, object, relation }, subject)` on `/relation-tuples/check/openapi`. A permit is about **one object**; nothing path-shaped can express it. |
| **Two listeners are unauthenticated** | Kratos admin `4434` and Keto write `4467`. Server code only — never `VITE_`-prefixed, never Traefik-routed, never reached from a browser. Holding `ketoWrite` is holding the power to grant. |
| **Nothing sits in front of you** | There is no gateway. Two have existed — Ory Oathkeeper, then nxgt-ory's own `edge` service — and both were removed: a path-shaped gate can only ask `App:<app>#use`, and a 403 from it on an object id would undo your 404. **You resolve your own caller and ask Keto yourself.** Nothing erases inbound `X-User-*` any more either, so never read an identity out of a request header. |
| **Unavailable is never anonymous or denied** | `OryUnavailable` → **503**. `null` from `resolve` = credential dishonoured (anonymous). `false` from Keto = denied. Confusing any two is the bug the whole design exists to prevent. |
| **Who writes tuples** | The API, in **one file** (`src/ory/tuples.ts`), built by `createTuples` from `@nxgt/ory-sdk/tuples`, for its own objects, in two shapes: ownership at creation, a share on an object the caller already edits. `@nxgt/ory-sdk` — the object every service holds — cannot write at all, on purpose. |
| **The model** | Your namespace in nxgt-ory's `config/keto.namespaces.ts` (OPL). Check syntax on `4469`, `bun docker restart keto` **from nxgt-ory**. Keto answers `false`, not an error, for a relation it does not know. |

Host vs container: `src/env.ts` defaults the Ory URLs to the host-published
`localhost` ports, while the compose/runtime env of each repository carries
the container names (`http://kratos:4433`…) — `docker/shared.env` and
`oxfile.toml` in sellix-monorepo, the app's own compose env in
nxgt-federation. This machine's shell profile exports the
container names into the host shell (root `AGENTS.md`, *Shell profile shadows
compose vars*) — prefix every host run, never edit the profile:

```sh
KRATOS_PUBLIC_URL=http://localhost:4433 KRATOS_ADMIN_URL=http://localhost:4434 \
KETO_READ_URL=http://localhost:4466 KETO_WRITE_URL=http://localhost:4467 \
bun run dev
```

---

## Which package entry point

Two packages, published from `nxgt-ory`'s `packages/` to npmjs. An app depends
on those and on nothing else of the stack's: there is no shared UI to route
through, and no source to link against.

| Import | For | Who may hold it |
| --- | --- | --- |
| `@nxgt/ory-sdk` | `createOry` — `resolve`, `isAllowed`, `requireAllowed`, `createTupleReader` | everyone; it cannot write |
| `@nxgt/ory-sdk/tuples` | `createTuples` — grant / revoke / heldBy / subjectsOf | `src/ory/tuples.ts` **only**, enforced by `noRestrictedImports` |
| `@nxgt/ory-sdk/admin` | `createIdentityAdmin` — Kratos's admin listener | `src/config/ory.ts` only |
| `@nxgt/ory-sdk/flows` | the self-service flows — what **your own** screens submit to | a UI, never an API |
| `@nxgt/ory-react/server` | `createSessionGuard`, `createPermissionGuard`, `loginRedirect` | a React Router UI, from `*.server.ts` |
| `@nxgt/ory-react/ui` | `Forbidden`, `readDenial` — the 403 page | the same UI's client tree |

The separation IS the guarantee, not filing. Reaching for the wrong one is
supposed to feel like a decision.

**`stx-sdk/ory*` was the previous home of all of this, and `stx-sdk@3.0.0`
removed it.** `./ory`, `./ory/flows`, `./ory/tuples`, `./ory/react/*`,
`./kratos`, `./keto` and `./hydra` are gone from that package; its README's
"Ory — Moved out in 3.0.0" section names the two `@nxgt/*` packages instead. So
an import of one of those paths now fails to resolve, which is the good failure.

**The bad failure needs an app pinned to `stx-sdk@<3`**, and it is measured: two
copies of this layer in one process are two `OryUnavailable` classes, so
`instanceof` misses, and an Ory outage answers 500 instead of 503 — with a green
build and green types. A migration therefore moves the dependency and every
import in one commit, never a subset. (`stx-sdk/oauth/*` is a different, legacy
module against `oauth-api`; it is still published and is not what this warns
about.)

The React half is **`@nxgt/ory-react`**. A Vue or Nuxt sibling does not exist
yet; when it does, this page is what it shares with the React one.

---

## Owning the self-service flows

An app that renders its own registration, login, recovery, verification and
settings screens rests on four facts about Kratos, none of them React's:

- **`accept: application/json` is what makes it possible.** Kratos's browser
  endpoints answer a plain request with a **303 to the instance's `ui_url`** —
  somebody else's screen. With that header they answer the same outcomes as
  JSON: 200 with the session, 400 with the flow and its messages, 422 with
  `redirect_browser_to`. `forward(request)` from `@nxgt/ory-sdk/flows` sets it
  on every call, and that is the whole reason that helper exists. So the flow
  is driven **from your server**, never from the browser.
- **Carry every `Set-Cookie` back, including on the 4xx branch** — `carry()`,
  which uses `getSetCookie()`. Kratos routinely sends two or three at once (a
  rotated `csrf_token_<hash>`, `ory_kratos_session`, a continuity cookie), and
  `get('set-cookie')` folds them into one string no browser parses back apart.
  A 4xx is precisely where the CSRF cookie rotates.
- **The session cookie has no `Domain`, deliberately** (`config/kratos.yaml`,
  `cookies:`). It is host-only, so it belongs to whichever origin served the
  response. Two consequences, and the second is the price of the doctrine:
  owning your screens means **owning your session**, and there is therefore
  **no single sign-on between two apps that each own theirs**. One sign-in
  across origins is what OIDC buys, and that is not in this plugin.
- **Every `ui_url` is absolute and instance-wide.** One Kratos instance has
  exactly one UI origin that can complete a *browser* flow; a second is 303'd
  back mid-flow and loops. So the emailed recovery / verification **link**, the
  error UI and Kratos's own `session_refresh_required` redirect always land on
  that instance's UI, whatever your app does. An app that wants all of it
  **runs its own Kratos** and points those `ui_url`s at its own routes. Sharing
  someone else's instance is workable — `use: code` means your screen can take
  the code out of the email rather than follow the link — but never build a
  flow that depends on a URL Kratos generated.

`allowed_return_urls` is the other cross-repo hop: if you hand Kratos a
`return_to` at all, your origin has to be listed by the instance that serves
you (nxgt-ory's `EXTRA_RETURN_URLS`). Nothing fails at build time when you
forget — the redirect 400s at runtime.

---

## `src/ory/tuples.ts` — the only writer

**Do not write this by hand.** It is one call to `createTuples` from
`@nxgt/ory-sdk/tuples`, and the whole file is:

```ts
export const NAMESPACE = '<Object>';

export const { permission, grant, revoke, revokeAll, heldBy, subjectsOf } =
  createTuples({
    ketoRead: ory.clients.keto,
    ketoWrite,                                    // the app's only write client
    namespace: NAMESPACE,
    relationsByPrecedence: ['owners', 'viewers'], // WRITABLE, strongest first
    permits: ['view', 'edit'],                    // askable only, never written
    onWrite: ({ action, tuple }) => logger.info(`${action} ${tuple}`),
  });
```

`relationsByPrecedence` does two jobs on purpose: it is the source of the
relation type (`grant(id, 'admins', s)` will not compile) **and** the rank
`heldBy` applies when a subject holds several relations on one object. Do not
alphabetise it — that produces no type error and no test failure.

Hand-writing this file is how the two reference APIs ended up with **twelve
divergences and three bugs**: `subjectsOf` paginating in neither (a shares list
truncated at the page size), one of them logging no grant or revoke at all, and
the precedence rule written twice at two different layers. All of that is in
the factory now.

Add the Biome guard in the repo's `biome.json`, so "written in one file" is CI
rather than a convention:

```jsonc
{ "overrides": [{
  "includes": ["**", "!**/src/ory/tuples.ts"],
  "linter": { "rules": { "style": { "noRestrictedImports": {
    "level": "error",
    "options": { "paths": { "@nxgt/ory-sdk/tuples": "Tuples are written in src/ory/tuples.ts and nowhere else." } }
  } } } }
}] }
```

Routes and resolvers never import this file. The long form is
`packages/ory-sdk/docs/06-tuples.md` in the `nxgt-ory` repository.

