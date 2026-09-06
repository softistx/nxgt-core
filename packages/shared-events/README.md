# @nxgt/shared-events

The event payload types and BullMQ queue plumbing shared by the two monorepos —
one vocabulary for the messages they exchange, so a producer in one repository
and a consumer in the other cannot drift.

## Subpaths

| Subpath | What is in it |
| --- | --- |
| `@nxgt/shared-events` | queue helpers and the re-exported domains |
| `@nxgt/shared-events/core` | the base event envelope and its types |
| `@nxgt/shared-events/sales` | order and cart events |
| `@nxgt/shared-events/finance` | invoicing and payment events |
| `@nxgt/shared-events/entities` | entity lifecycle events (`*.provisioned`, …) |

Adding an event is a release of this package before it is a change in either
consumer: the producer and the consumer must agree on the payload, and the only
way they can is through a published version.

## Install

```bash
bun add @nxgt/shared-events
```

Public on npmjs; no token needed to install. TypeScript is a peer, pinned to
`^6.0.3` across every `@nxgt/*` package — the set is unsatisfiable if one of
them widens it.
