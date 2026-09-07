---
name: admin-screen-pattern
description: >-
  Build a screen that lists, filters and edits records — an admin or operator
  console — with the @nxgt/material shell, DataTable and load-more, filters in
  the URL rather than in Redux, and actions that answer data(). Use for any
  console screen; it is not Ory-specific, though an Ory console is made of it.
---

# Skill: The admin/console screen pattern

## Purpose

Any UI that lists, filters and edits records. It was written from the Ory
`/admin` console, but nothing in it is about Ory — load it for a console screen
in any of the repositories, alongside whichever skill covers that app's auth.

The one Ory-shaped constraint worth stating up front, because it is why the
data layer differs from `oauth-admin`'s: an Ory console calls **unauthenticated
admin listeners**, so it cannot fetch from the browser. Everything below is
loaders and actions.

For any UI that lists, filters and edits records — the `/admin` console is the
reference — follow `apps/oauth/oauth-admin`'s **structure**, not its data
layer. That app is a SPA (`ssr: false`) fetching from the browser with TanStack
Query + Redux; an Ory console cannot be, because the listeners it calls are
unauthenticated. So: **the shapes are oauth-admin's, the plumbing is loaders
and actions.**

## The shell comes from `@nxgt/material`

`ActivityLayout`, `ActivityContent`, `AppHeader`, `AppSidebar`,
`AppBreadcrumb`, `MenuItem`. Do **not** copy them into the app — that is what
kept them duplicated in three apps before they were extracted.

- `ActivityLayout` is mounted **once**, in the guarded layout route, with
  `items` from the app's own `useMenuItems()`; leaf routes render only
  `ActivityContent`.
- `MenuItem.label` is an already-translated node — the package resolves only
  its reserved `material.*` namespace. `MenuItem.footer` pins an entry to the
  bottom.
- Breadcrumbs come from each route's `handle.breadcrumb`, built with
  `translate()` (it is called outside React).

## Lists: `DataTable` + "load more", and that is not a preference

`DataTable` (TanStack Table v9) keeps its pagination state internally, and
`PaginationBar` needs a `pageCount`. **No Ory service can give you one**:
Kratos and Hydra page by `Link: rel="next"` header, Keto by
`next_page_token` — opaque cursors, no total, no jumping to page N. So the
only pagination that works is `onLoadMore` / `isLoadingMore`, which renders a
`LoadMoreButton`, with `onLoadMore={next ? load : undefined}` to hide it on
the last page.

The SSR version of oauth-admin's `use-infinite-<f>.ts` is
`app/hooks/use-infinite-list.ts` (kratos-ui): the route's `loader` returns
`{ items, nextPageToken }` — fixed keys, so the hook needs to know nothing about
the rows — a `useFetcher` re-requests the same route with `?page_token=…`, and
the hook accumulates. It resets whenever the loader answers a **different first
page**, which covers both a filter change and a revalidation after a delete;
the pages after a stale cursor mean nothing.

Per module, mirroring oauth-admin: `<f>-list.tsx` (the `DataTable` wrapper,
`useColumnHelpers` for the `select`/`expand` columns, `useDeleteRowsHandler`
for the delete dialog, a toolbar via `actions`), `<f>-form.tsx`, `partials.tsx`
for the expanded row, `components/utils.ts` for the zod schema and
`getInitialValues`.

**Every list is this, with no exceptions for "simple" data.** The permissions
page was the counter-example that proved the rule: a relation tuple is one line
of Keto notation — `namespace:object#relation@subject` — and it shipped as a
plain `<ul>` of those lines, with the argument written into the component that
"columns would say less than the notation does". They say more. Split, the
parts line up down the page, they sort, and the subject stops hiding at the end
of a run of punctuation. The notation survives as the row id, which is the one
job it is actually good at, because the four parts together *are* a tuple's
identity — Keto gives it no id of its own.

Three rules fall out of that, and they are what "the same pattern" means:

- **One column per field**, resolved by a `summarise<F>()` in the module's
  `utils.ts` — the same shape as `summariseClient` — so a cell reads a field
  instead of re-deriving one.
- **A destructive row action is an `IconButton` in the `actions` column**, never
  a labelled button in the row and never a bare `onClick={() => onDelete(...)}`:
  it goes through `useDeleteRowsHandler`'s `handleDelete([row])`, the same
  confirmation the bulk button uses. A row action that deletes on the first
  click has no undo behind it.
- **A row that cannot take the action renders the button `disabled`**, with the
  reason in a comment. A Keto tuple whose subject is a *set* is the case here:
  it comes from the OPL model, Keto deletes by the exact subject, and the
  console's action only knows how to send a subject id — so that button used to
  render enabled and silently do nothing.

A component with two consumers takes the difference as a prop rather than
forking: `PermissionsList` is the console's page *and* the identity detail
card, with `hideSubject` (every row there shares one) and an optional `toolbar`
(that card grants nothing).

## Filters live in the URL, not in Redux

`Filter` from `@nxgt/material` in `variant="dialog"`, fed by a
`use<F>Request()` returning `{ filter, schema, handleFilterChange }` — the same
signature as oauth-admin's, backed by `useSearchParams()` instead of a slice
(`app/hooks/use-filter-params.ts` is the shared half). The loader reads the
params, which is the whole point: an SSR list must render filtered on the first
request, and a Redux slice is not available to it. Applying a filter drops
`page_token`, because a cursor only means anything for the query that made it.

**Offer only the filters the service actually has.** Kratos's
`/admin/identities` has exactly one, `credentials_identifier`, and it is an
exact match — no substring search, no state or verified filter. Hydra has
`client_name` and `owner`, also exact. Keto's `/relation-tuples` has all four
parts of a tuple, which is why the permissions page is the one with a real
filter dialog. Filtering the accumulated rows client-side looks like a filter
and behaves like one only for the pages already fetched, which under cursor
pagination is a lie.

## Mutations are actions, and they answer `data()`

One `action` per route, dispatched on `intent`, every branch wrapped in
`attempt()` (`app/shared/reply.server.ts`), read back with `useActionReply`.
**Never `redirect()` from an action a fetcher reads** — it is swallowed and the
loading toast never closes. This replaces oauth-admin's `useMutationCallbacks`;
cache invalidation is free, because loaders revalidate.

`shouldRevalidate` must return `false` after a successful delete on a detail
route, or its loader 404s before the navigation lands.

## Dialogs

`ConfirmationDialog` embeds a zod-validated react-hook-form
(`formOptions: { schema, defaultValues, renderForm }`) and already wraps it in
`.form-grid-layout` — that is the "add a permission" dialog. Its `confirmText`
/ `cancelText` and `ConfirmDialog`'s `confirmLabel` / `cancelLabel` default to
**hardcoded English**: always pass translated ones.

## A secret that exists once

Hydra returns `client_secret` only in the creation response and stores a hash.
The create screen therefore does **not** navigate away on success: it shows the
id and the secret with `CopyValue` and waits for the operator to dismiss the
panel. Never put the secret in a summary type or a loader — a field that can be
read back is a field somebody will assume can be read back. The spec asserts
this both ways: the panel shows it, and Hydra's own `GET /admin/clients` does
not.

## A whole-record PUT clears what it omits

Both Kratos's `PUT /admin/identities/{id}` and Hydra's `PUT /admin/clients/{id}`
replace the record. So the update action sends back fields the form never
showed — the identity's own `schema_id`, the client's `grant_types` and
`response_types` — and the spec asserts on the SERVICE, not on the page, that
the untouched fields survived. Kratos has no "use the default schema" sentinel
either: `default` is a literal id, so the value comes from a named constant
tied to nxgt-ory's `config/kratos.yaml` `identity.default_schema_id`.

