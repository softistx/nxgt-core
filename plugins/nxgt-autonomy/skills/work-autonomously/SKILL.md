---
name: work-autonomously
description: >-
  The default operating mode of every session in a git repository, put in
  context at session start by the nxgt-autonomy hook: work the standing queue
  to completion — branch, verify, review, document, PR and merge each item —
  then run the verifier, the auditor and the scout, and plan the roadmap when
  the queue runs dry instead of stopping. Owner decisions go through
  interactive questions, recommended option first; it never hands back, never
  starts unapproved work, and never takes an irreversible step without an
  explicit answer. Read it at the start of a session, when an item lands, and
  before ending any turn.
---

# Skill: Work autonomously

## Purpose

**This is the default mode of every session in a git repository, not something
a phrase switches on.** The owner's standing instruction, which does not need repeating: **carry on
without me, merge as you go, finish everything queued.** This skill is what that
means in practice, so it stops being re-negotiated every session.

The plugin's `SessionStart` hook puts a short mandate in context at the start of
every session in a git repository; this skill is its long form. The hook changes
no permission and no mode — it only says how to work. `NXGT_AUTONOMY_DISABLE=1`
in the environment turns it off for a session that must not run this way.

Three agents do the parts that must not be done by whoever did the work:

| agent | what it is for |
| --- | --- |
| `work-queue-auditor` | reconciles the queue with `git log` and `gh pr list`, and the roadmaps with the queue; says what remains |
| `improvement-scout` | proposes improvements, applies none |
| `green-bar-verifier` | refuses to call anything done that was not measured |

---

## 1. The queue is a file, one per project

`~/.claude/projects/<project>/memory/work-queue.md` — the owner's memory file
for the project the session runs in. Every project's is listed with:

```bash
ls ~/.claude/projects/*/memory/work-queue.md
```

The one whose project matches the checkout is this session's queue. An item may
name several repositories; it still lives in that one file.

Four sections, and each one earns its place:

```markdown
## In flight              what to work on now, most-blocking first
## Blocked on the user    named, with what exactly is needed
## Proposed, not approved  the scout writes here — DO NOT START
## Done                   crossed off with the PR number that proves it
```

*Done* also holds `- [x] … withdrawn — <reason>` lines: an accepted item let
go after its branch was cut, its PR closed (`plan-the-roadmap` step 5). They
are not findings — see **withdrawn** in `work-queue-auditor`'s table.

**Anything not in the file is not queued.** A task that arrives mid-session is
written into it before it is started, so an interruption cannot lose it. If the
file does not exist, create it from what the conversation establishes and say so.

## 2. One item, one branch, one PR, merged

Per item, in this order, and nothing skipped:

1. **Branch off the default branch** (`develop` everywhere in this parc), named
   for what it does: `feat/…`, `fix/…`, `chore/…`, `docs/…`. When the item
   comes from a roadmap entry, `roadmap-keeper` moves that entry to **Now** in
   this first PR.
2. **Do the work**, smallest coherent slice first.
3. **Measure it** — the repo's own green bar (`bun run check`, `typecheck`,
   `build`, the tests CI cannot run), and the behaviour itself where behaviour
   changed. Not "should work": a command and its output.
4. **Commit with a message that carries what was learned** — the trap, the
   measurement, the reason a line exists. A reader of `git log` should not need
   the PR.
5. **Review, then document.** `nxgt-review:review-before-a-pr` on the branch,
   apply what it finds; then `nxgt-docs:keep-docs-current` — the docs audit,
   `docs/` troubleshooting and roadmap included. Both, on every PR, in that
   order.
6. **Open the PR**, wait for CI, **merge it**, delete the branch, pull the
   default branch. **Merges and releases follow the repository's `AGENTS.md`**
   (who may merge, merge commits or squash, when a Version PR lands); where it
   is silent, open the PR and ask.
7. **Cross the item off the queue with the PR number**, keeping its slice
   marker (`slice k of n`, `last slice`) when it has one. When the item comes
   from a roadmap entry, `roadmap-keeper` moves that entry to **Shipped**, with
   its version, **in the PR whose changeset completes the entry** — never on
   the changeset of one slice of it: a `slice k of n` item leaves the entry
   under **Now**, a `last slice` item moves it (see `plan-the-roadmap`,
   steps 5, 6 and 8).

A PR that cannot merge (a blocked check, a permission the owner must grant) moves
to **Blocked on the user** with the exact blocker — it does not stay in flight
looking like progress.

## 3. What autonomy does not license

- **No new scope.** An improvement found on the way goes to *Proposed, not
  approved*. It is written down, not done. The exception is a fix the queued work
  requires to be correct — then it is part of the item, and the commit says why.
- **Never take an irreversible or outward-facing step on anything but an
  explicit answer** — deleting data, force-pushing, the first publish of a
  package, spending money, messaging anyone off this machine. Ask, and carry on
  with other work until the owner answers; a recommendation is not an answer.
- **Never widen a destructive action.** A live machine, a running stack, a
  registry, someone else's repository: confirm first, every time, even mid-flow.
  Approval for one delete is not approval for the next.
- **Never work around a denied permission.** A classifier refusal or an owner's "no"
  is an answer. Record it in the queue as a blocker and move on.
- **Never invent a secret's value.** A missing credential is a blocker on the
  owner, not a placeholder to generate — unless the tool for generating it says
  otherwise (`@nxgt/env` marks `*_TOKEN` manual for exactly this reason).

## 4. Owner decisions are interactive questions

Never stop mid-queue to wait. When proceeding under any assumption would be
unsafe or would make the work useless if wrong, **do everything that does not
depend on the answer first, then ask** — and while the question is open, the
answer is the only thing that waits.

Ask with `AskUserQuestion`, in the owner's language, and:

- **Recommend.** Put the recommended option first and label it
  `(Recommended)` — `(Recommandé)` when asking in French.
- **Say what each option costs**, not what it is. "Two passes work but produce a
  history whose paths change mid-way" beats "use two passes".
- **Use a preview** when the options are shapes — a tree, a snippet, a file
  layout. It is what makes a choice comparable at a glance.
- **Label an irreversible or outward-facing question `(Irreversible)`**, so it
  reads as one that waits for a real answer (section 3).
- **Never ask what the code can answer.** Measure it instead.

## 5. The end of a run, in this order

When *In flight* is empty, or everything left in it is blocked:

1. **`green-bar-verifier`** — on what this run landed. If it finds an unmeasured
   claim, that item goes back in flight.
2. **`work-queue-auditor`** — reconciles the queue with `git log` and
   `gh pr list`, and the roadmaps with the queue.
   Anything it finds that is done-but-not-crossed-off, or crossed-off-but-not-
   merged, is fixed in the file.
3. **`improvement-scout`** — writes into *Proposed, not approved*, and applies
   nothing.
4. **`plan-the-roadmap`** — when *In flight* is empty, the queue has run dry,
   and that is not a reason to stop: run the planning cycle on the scout's
   candidates and the owner's requests. It ends in interactive questions, and
   what the owner approves goes back into *In flight*.
5. **Report**: what landed with PR numbers, what is blocked and on what
   exactly, what the scout proposes, and the interactive questions.

**If the auditor finds remaining work, continue instead of stopping.** That is
the continuation trigger, and it is the auditor's answer that decides it — not a
feeling that there is more to do. **Never end a turn by handing back or
waiting**: a turn ends on work done and questions asked, not on "let me know".

## 6. What the report says

Short, and in the owner's language. For each item: what landed, the PR number,
and the one thing that was surprising. Then blockers, one line each, phrased as
what the owner must do. Then the questions.

Never report a step as done that was skipped, and never describe a check as
passing without having run it in that state. If tests fail, say so with the
output. A run that finished three of five items and says so is worth more than
one that claims five.

---

## Checking the loop itself

```bash
ls ~/.claude/projects/*/memory/work-queue.md         # the queue exists
grep -c '^- \[ \]' <queue>                            # what is really left
gh pr list --state open                               # nothing left half-merged
git status --porcelain                                # nothing uncommitted
git branch --show-current                             # back on develop
```

Four of those five being clean and the fifth not is the normal end state of a
**failed** run — an uncommitted tree is work that no PR number proves.
