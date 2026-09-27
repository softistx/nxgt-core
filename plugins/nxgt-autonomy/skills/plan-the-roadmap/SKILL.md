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
| **queue item** | an accepted plan, ready to execute | the work queue, under *In flight* |

The two files, and why there are two:

- **Roadmaps are per package and public**: `packages/<name>/docs/roadmap.md`
  in whichever repository holds the package — or `docs/roadmap.md` at the root
  of a single-package repository. They ship to npm, so the rules of
  `nxgt-docs:keep-docs-current` apply: no dates, no private names, phrased for
  a consumer.
- **The queue is private and per project**: the owner's memory file
  `~/.claude/projects/<project>/memory/work-queue.md` of the project the
  session runs in — the same file `work-autonomously` works, with the
  sections *In flight*, *Blocked on the user*, *Proposed, not approved*,
  *Done*. `ls ~/.claude/projects/*/memory/work-queue.md` lists every
  project's; the one whose project matches the checkout is this session's.
  An item may name several repositories; it still lives in this one file.

A roadmap entry says *what* a consumer gets; the queue item says *how, where,
and which PR*. Each names the other: the queue item names the package and the
entry's bold name; the entry never names the queue.

## The cycle

Eight steps — the same numbering `nxgt-crew`'s README uses when it aligns this
cycle across sessions.

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

**When `nxgt-crew` is enabled**, run `/crew align` first: it reads the
roadmaps and announced plans of every live session, and flags an entry another
session already planned, a plan waiting on another session's release, or an
entry already Shipped or Not planned. What it finds goes into the question, so
the owner decides knowing what the other sessions do. Without `nxgt-crew`,
skip this.

Then ask the owner decisions with `AskUserQuestion`, as `work-autonomously`
section 4 says: in the owner's language, the recommended option first and
labelled `(Recommended)` / `(Recommandé)`, what each option costs, a preview
when the options are shapes. Group up to four per call, most consequential
first.

An entry whose plan includes an irreversible or outward-facing step — deleting
data, force-pushing, the first publish of a package, spending money, messaging
anyone off this machine — is labelled `(Irreversible)` and waits for an
explicit answer. Keep planning the other entries meanwhile.

- **Accepted** → step 5.
- **Refused** → `roadmap-keeper` moves the entry to **Not planned**, with the
  owner's reason.
- **Deferred** → the entry stays in Next or Later; nothing is queued.

### 5. Queue the accepted entries

Write each accepted plan into *In flight* as a queue item, most-blocking
first: one line with the repository, the package, the roadmap entry's bold
name, the decisions the owner took, and the first step. Remove it from
*Proposed, not approved* if it was there.

**When `nxgt-crew` is enabled**, run `/crew align` again — the other sessions
may have moved while the owner answered — then record each queued entry, so
other sessions read it as taken:

```bash
/crew announce --kind plan --entry "<bold name>" --scope <repo|package> --needs <pkg@version> "<text>"
```

`--entry` is the bold name exactly as in `docs/roadmap.md`; `--needs` names a
release the entry waits on, and is left out when there is none. **Record only
after the owner has accepted** — an announcement made before his answer is a
claim nobody approved. Without `nxgt-crew`, skip this.

**When an accepted entry is let go** — the owner drops or defers it later, or
it goes to another session after an alignment — withdraw its announcement, so
other sessions stop reading it as taken:

```bash
/crew announce --kind plan --entry "<bold name>" --scope <repo|package> --drop
```

Remove its queue item too. When the owner let it go, have `roadmap-keeper`
move the entry back to **Next** or **Later**, or to **Not planned** with his
reason. When another session took it, leave the roadmap to that session.
Without `nxgt-crew`, skip the announcement.

### 6. Execute

`work-autonomously` takes each queue item: one branch, one PR, review then
docs, merged per the repository's `AGENTS.md`. When the item's branch is cut,
`roadmap-keeper` moves the entry to **Now**, in that item's first PR.

### 7. Verify

- **`green-bar-verifier`** on what landed;
- **`work-queue-auditor`** to reconcile the queue — including the roadmap
  against it (an entry under **Now** with no item in flight, or an item in
  flight whose entry is still under **Next**).

### 8. Ship

`roadmap-keeper` moves the entry to **Shipped**, with the version its
changeset produces, **in the PR whose changeset completes the entry**. A
changeset for one slice of a larger entry does not promote it; the entry stays
under **Now** until the last slice's.

When the queue runs dry again, the cycle starts over at step 1.

## Checking the cycle

```bash
ls ~/.claude/projects/*/memory/work-queue.md             # one queue per project
grep -n '^## ' packages/*/docs/roadmap.md                # every roadmap has its sections
grep -c '^- \[ \]' <queue>                                # approved and not done
```

An entry under **Now** with no queue item in flight, or a queue item naming an
entry that is still under **Next**, is a cycle that skipped a step —
`work-queue-auditor` reports it; fix whichever side is wrong.
