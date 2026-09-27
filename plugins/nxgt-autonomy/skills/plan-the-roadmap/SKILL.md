---
name: plan-the-roadmap
description: >-
  The planning cycle of the nxgt repositories: discover candidates (the
  improvement-scout and the owner's requests), frame each as a roadmap entry
  in the package's docs/roadmap.md, plan it with a Plan agent, validate the
  owner decisions through interactive questions with recommendations, queue
  what is approved, then execute through work-autonomously and ship. Use when
  the work queue runs dry, when the owner asks for something new or asks what
  comes next for a package, or when a roadmap entry needs a plan before it can
  be queued.
---

# Skill: Plan the roadmap

## Purpose

`work-autonomously` finishes what is queued. This skill decides what gets
queued next, so an empty queue leads to a plan the owner approves in a few
clicks rather than to a stop. It never starts work: its output is approved
queue items, and `work-autonomously` does the rest.

## Vocabulary, stated once

| term | what it is | where it lives |
| --- | --- | --- |
| **candidate** | something that might be worth doing, not yet framed | the scout's report, or the owner's request |
| **roadmap entry** | a candidate phrased as what a consumer of the package gets | `docs/roadmap.md` of that package, under Now, Next, Later, Not planned or Shipped |
| **plan** | how an entry gets done: steps, files, public API, tests, docs | the Plan agent's output, summarised in the queue item |
| **owner decision** | a choice in a plan that only the owner can make | an `AskUserQuestion`, recommended option first |
| **queue item** | an approved plan, ready to execute | the work queue, under *In flight* |

The two files, and why there are two:

- **Roadmaps are per package and public**: `packages/<name>/docs/roadmap.md`
  in whichever repository holds the package — or `docs/roadmap.md` at the root
  of a single-package repository. They ship to npm, so the rules of
  `nxgt-docs:keep-docs-current` apply: no dates, no private names, phrased for
  a consumer.
- **The queue is one private file across every repository**: the owner's
  memory file `~/.claude/projects/<project>/memory/work-queue.md`, the same one
  `work-autonomously` works — found from anywhere with
  `ls ~/.claude/projects/*/memory/work-queue.md`, sections *In flight*,
  *Blocked on the user*, *Proposed, not approved*, *Done*.

A roadmap entry says *what* a consumer gets; the queue item says *how, where,
and which PR*. Each names the other: the queue item names the package and the
entry's bold name; the entry never names the queue.

## The cycle

### 1. Discover

Gather the candidates:

- run the **`improvement-scout`** agent — it writes into *Proposed, not
  approved*, with evidence;
- take the **owner's requests**: what he asked for in this conversation, and
  what already sits in *Proposed, not approved* or in a roadmap's Next and
  Later;
- read the queue first, so a candidate that is already queued, blocked or done
  is not proposed twice.

### 2. Frame each candidate as a roadmap entry

Run the **`roadmap-keeper`** agent (plugin `nxgt-docs`) on the package the
candidate concerns, with the candidates as the caller's plan. It writes each as
an entry under **Next** or **Later** of that package's `docs/roadmap.md` —
**bold name** and what a consumer gets, in one sentence. A candidate that is
not consumer-facing (a CI step, a script, a refactor) has no roadmap entry; it
goes straight to step 3, and its queue item says so.

A candidate the owner has already refused goes to **Not planned**, with the
reason, so it is not proposed again.

### 3. Plan each entry

Run a **`Plan`** agent per entry — in parallel when the entries are
independent. Ask it for:

1. the steps, smallest coherent slice first;
2. the files it touches, per repository;
3. the public API it adds or changes, and whether that is a breaking change;
4. the tests that prove it, and the repository's green bar;
5. the docs — README section, `docs/` guide, troubleshooting entry;
6. **the owner decisions**: every choice the plan cannot make on its own, each
   with the options, what each costs, and its recommendation.

A plan whose only owner decision is "should we do this at all" still has that
one.

### 4. Validate with the owner

Ask the owner decisions with `AskUserQuestion`, as `work-autonomously`
section 4 says: in the owner's language, the recommended option first and
labelled `(Recommended)` / `(Recommandé)`, what each option costs, a preview
when the options are shapes. Group up to four per call, most consequential
first.

An entry whose plan includes an irreversible or outward-facing step — deleting
data, force-pushing, the first publish of a package, spending money, messaging
anyone off this machine — is labelled `(Irreversible)` and waits for an
explicit answer. Keep planning the other entries meanwhile.

- **Approved** → step 5.
- **Refused** → `roadmap-keeper` moves the entry to **Not planned**, with the
  owner's reason.
- **Deferred** → the entry stays in Next or Later; nothing is queued.

### 5. Queue the approved items

Write each approved plan into *In flight*, most-blocking first: one line with
the repository, the package, the roadmap entry's bold name, the decisions the
owner took, and the first step. Remove it from *Proposed, not approved* if it
was there.

When work on an item starts — its branch is cut — `roadmap-keeper` moves the
entry to **Now**, in that item's first PR.

### 6. Execute, verify, ship

`work-autonomously` takes it from here: one item, one branch, one PR, review
then docs, merged per the repository's `AGENTS.md`. Then:

- **`green-bar-verifier`** on what landed;
- **`work-queue-auditor`** to reconcile the queue;
- **on release**, `roadmap-keeper` moves the entry to **Shipped**, with the
  version the changeset produced, in the PR that ships it.

When the queue runs dry again, the cycle starts over at step 1.

## Checking the cycle

```bash
ls ~/.claude/projects/*/memory/work-queue.md             # one queue
grep -n '^## ' packages/*/docs/roadmap.md                # every roadmap has its sections
grep -c '^- \[ \]' <queue>                                # approved and not done
```

An entry under **Now** with no queue item in flight, or a queue item naming an
entry that is still under **Next**, is a cycle that skipped a step — the
auditor reports it; fix whichever side is wrong.
