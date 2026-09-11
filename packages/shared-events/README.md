# @nxgt/shared-events

The event payload types and BullMQ queue plumbing shared by the two monorepos —
one vocabulary for the messages they exchange, so a producer in one repository
and a consumer in the other cannot drift.

## Install

```bash
bun add @nxgt/shared-events
```

Public on npmjs; no token needed to install. TypeScript is a peer, pinned to
`^6.0.3` across every `@nxgt/*` package — the set is unsatisfiable if one of
them widens it.

## Subpaths

| Subpath | What is in it |
| --- | --- |
| `@nxgt/shared-events` | queue helpers and the re-exported domains |
| `@nxgt/shared-events/core` | `EventPayload`, `EventActor`, `createQueue`, `createWorker`, `createQueueEvents` |
| `@nxgt/shared-events/sales` | `SALES_EVENT_NAMES`, `QUEUE_SALES_EVENTS`, `createSalesEventsQueue` |
| `@nxgt/shared-events/finance` | `FINANCE_EVENT_NAMES`, `QUEUE_FINANCE_EVENTS`, `createFinanceEventsQueue` |
| `@nxgt/shared-events/entities` | `ENTITIES_EVENT_NAMES`, patient and customer queues |

The root re-exports every domain. Import from a subpath when you want one
domain and not the others.

## Events

| Domain | Names |
| --- | --- |
| sales | `order.confirmed`, `order.shipped`, `order.cancelled`, `order.returned`, `purchase.received` |
| finance | `invoice.created`, `invoice.posted`, `invoice.paid`, `payment.created`, `payroll.posted` |
| entities | `patient.created`, `customer.provisioned` |

Every payload is `EventPayload<T>`: `{ data: T, user?: EventActor | null }`.
`EventActor` is `{ name?, sub?, username? }` — deliberately not `Principal`.
A job queue has no business knowing the shape of an authenticated caller, and
importing it made this package and `@nxgt/shared` depend on each other.

```ts
import { SALES_EVENT_NAMES, createSalesEventsQueue } from '@nxgt/shared-events/sales';
import { createWorker, createQueue, createQueueEvents } from '@nxgt/shared-events/core';

const queue = createSalesEventsQueue(redisUrl);
await queue.add(SALES_EVENT_NAMES.ORDER_CONFIRMED, { data: { order, items }, user });
```

`./core` re-exports `Job`, `Queue` and `Worker` from `bullmq`. Take them from
here, not from `bullmq` directly, so there is one copy. `createWorker` defaults
its Redis connection to `redis://localhost:6379` when you omit one.

Patient and customer events are **two queues** (`patient-events`,
`customer-events`). A BullMQ worker competes for every job on the queue name
it is attached to, so `health` and `platform` cannot share one queue without
racing each other for jobs meant for the other side.

## Things that bite

- **Adding an event is a release of this package before it is a change in
  either consumer.** A type added in one monorepo and imported from `src/`
  will typecheck there and 404 in the other.
- **Do not import `Principal` here.** The cycle is what this package was split
  to break.
