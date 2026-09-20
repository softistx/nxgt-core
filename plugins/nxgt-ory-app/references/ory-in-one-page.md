# Ory in one page

The model, and the parts that are the same whichever transport you build.
Both `create-ory-native-rest-api` and `create-ory-native-graphql-api` open by
sending you here; read it once, then read the one for your transport.


| | |
| --- | --- |
| **Who runs the stack** | The sibling repo `nxgt-ory` — `cd ../nxgt-ory && bun run setup`. **Its files are not in this repo: changing a namespace is a PR there.** Kratos `4433` public / `4434` admin, Keto `4466` read / `4467` write / `4469` OPL, Hydra `4444` public / `4445` admin, Mailpit `8025`. |
| **Who is calling** | `stx-sdk/ory`'s `resolve(headers)`: a Kratos cookie or `X-Session-Token` → `whoami`; a `Bearer` → Hydra introspection. Either way an `OryPrincipal` whose **`subject`** is the Kratos identity id (or a machine client's id). One person is one string, whichever door. |
| **May they** | Keto: `isAllowed({ namespace, object, relation }, subject)` on `/relation-tuples/check/openapi`. A permit is about **one object**; nothing path-shaped can express it. |
| **Three listeners are unauthenticated** | Kratos admin `4434`, Keto write `4467`, Hydra admin `4445`. Server code only — never `VITE_`-prefixed, never Traefik-routed, never reached from a browser. Holding `ketoWrite` is holding the power to grant. |
| **Nothing sits in front of you** | There is no gateway. Two have existed — Ory Oathkeeper, then nxgt-ory's own `edge` service — and both were removed: a path-shaped gate can only ask `App:<app>#use`, and a 403 from it on an object id would undo your 404. **You resolve your own caller and ask Keto yourself.** Nothing erases inbound `X-User-*` any more either, so never read an identity out of a request header. |
| **Unavailable is never anonymous or denied** | `OryUnavailable` → **503**. `null` from `resolve` = credential dishonoured (anonymous). `false` from Keto = denied. Confusing any two is the bug the whole design exists to prevent. |
| **Who writes tuples** | The API, in **one file** (`src/ory/tuples.ts`), built by `createTuples` from `stx-sdk/ory/tuples`, for its own objects, in two shapes: ownership at creation, a share on an object the caller already edits. `stx-sdk/ory` — the object every service holds — cannot write at all, on purpose. |
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
HYDRA_ADMIN_URL=http://localhost:4445 bun run dev
```

---

## Which stx-sdk entry point

| Import | For | Who may hold it |
| --- | --- | --- |
| `stx-sdk/ory` | `createOry` — `resolve`, `isAllowed`, `requireAllowed`, `createTupleReader` | everyone; it cannot write |
| `stx-sdk/ory/tuples` | `createTuples` — grant / revoke / heldBy / subjectsOf | `src/ory/tuples.ts` **only**, enforced by `noRestrictedImports` |
| `stx-sdk/ory/admin` | `createIdentityAdmin` — Kratos's admin listener | `src/config/ory.ts` only |
| `stx-sdk/ory/flows` | the browser self-service flows | a UI, never an API |
| `stx-sdk/ory/oauth2` | `createOAuth2Client` — a relying party of Hydra | a UI on another host |

The separation IS the guarantee, not filing. Reaching for the wrong one is
supposed to feel like a decision.

---

## `src/ory/tuples.ts` — the only writer

**Do not write this by hand.** It is one call to `createTuples` from
`stx-sdk/ory/tuples`, and the whole file is:

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
    "options": { "paths": { "stx-sdk/ory/tuples": "Tuples are written in src/ory/tuples.ts and nowhere else." } }
  } } } }
}] }
```

Routes and resolvers never import this file. The long form is
`docs/ory/06-tuples.md` in the `stx-sdk` repository.

