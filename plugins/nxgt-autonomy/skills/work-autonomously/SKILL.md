---
name: work-autonomously
description: >-
  Work a standing queue of tasks across the nxgt repositories to completion —
  branch, verify, PR and merge each item, then run the auditor, the scout and
  the verifier before stopping. Use when the user says to carry on
  autonomously, to merge until everything is finished, or leaves while work is
  in flight; and at the end of any session that landed something, to leave the
  queue true. It asks interactive questions with recommendations rather than
  guessing, and never starts unapproved work.
---

# Skill: Work autonomously

## Purpose

The user's standing instruction, which does not need repeating: **carry on
without me, merge as you go, finish everything queued.** This skill is what that
means in practice, so it stops being re-negotiated every session.

Three agents do the parts that must not be done by whoever did the work:

| agent | what it is for |
| --- | --- |
| `work-queue-auditor` | reconciles the queue with `git log` and `gh pr list`, and says what remains |
| `improvement-scout` | proposes improvements, applies none |
| `green-bar-verifier` | refuses to call anything done that was not measured |

---

## 1. The queue is a file, and it is the only queue

`~/.claude/projects/<project>/memory/work-queue.md`, found from anywhere with:

```bash
ls ~/.claude/projects/*/memory/work-queue.md
```

Five sections, and each one earns its place:

```markdown
## In flight              what to work on now, most-blocking first
## Blocked on the user    named, with what exactly is needed
## Proposed, not approved  the scout writes here — DO NOT START
## Done                   crossed off with the PR number that proves it
```

**Anything not in the file is not queued.** A task that arrives mid-session is
written into it before it is started, so an interruption cannot lose it. If the
file does not exist, create it from what the conversation establishes and say so.

## 2. One item, one branch, one PR, merged

Per item, in this order, and nothing skipped:

1. **Branch off the default branch** (`develop` everywhere in this parc), named
   for what it does: `feat/…`, `fix/…`, `chore/…`, `docs/…`.
2. **Do the work**, smallest coherent slice first.
3. **Measure it** — the repo's own green bar (`bun run check`, `typecheck`,
   `build`, the tests CI cannot run), and the behaviour itself where behaviour
   changed. Not "should work": a command and its output.
4. **Commit with a message that carries what was learned** — the trap, the
   measurement, the reason a line exists. A reader of `git log` should not need
   the PR.
5. **Open the PR**, wait for CI, **merge it**, delete the branch, pull the
   default branch.
6. **Cross the item off the queue with the PR number.**

A PR that cannot merge (a blocked check, a permission the user must grant) moves
to **Blocked on the user** with the exact blocker — it does not stay in flight
looking like progress.

## 3. What autonomy does not license

- **No new scope.** An improvement found on the way goes to *Proposed, not
  approved*. It is written down, not done. The exception is a fix the queued work
  requires to be correct — then it is part of the item, and the commit says why.
- **Never widen a destructive action.** A live machine, a running stack, a
  registry, someone else's repository: confirm first, every time, even mid-flow.
  Approval for one delete is not approval for the next.
- **Never work around a denied permission.** A classifier refusal or a user "no"
  is an answer. Record it in the queue as a blocker and move on.
- **Never invent a secret's value.** A missing credential is a blocker on the
  user, not a placeholder to generate — unless the tool for generating it says
  otherwise (`@nxgt/env` marks `*_TOKEN` manual for exactly this reason).

## 4. When to stop and ask

Stop mid-queue only when proceeding under any assumption would be unsafe or would
make the work useless if wrong. Otherwise: **do everything that does not depend on
the answer, and ask at the end.**

Ask with `AskUserQuestion`, in the user's language, and:

- **Recommend.** Put the recommended option first and mark it `(recommandé)`.
- **Say what each option costs**, not what it is. "Two passes work but produce a
  history whose paths change mid-way" beats "use two passes".
- **Use a preview** when the options are shapes — a tree, a snippet, a file
  layout. It is what makes a choice comparable at a glance.
- **Never ask what the code can answer.** Measure it instead.

## 5. The end of a run, in this order

When *In flight* is empty, or everything left in it is blocked:

1. **`green-bar-verifier`** — on what this run landed. If it finds an unmeasured
   claim, that item goes back in flight.
2. **`work-queue-auditor`** — reconciles the queue against the repositories.
   Anything it finds that is done-but-not-crossed-off, or crossed-off-but-not-
   merged, is fixed in the file.
3. **`improvement-scout`** — writes into *Proposed, not approved*, and applies
   nothing.
4. **Report**, then stop: what landed with PR numbers, what is blocked and on
   what exactly, what the scout proposes, and the interactive questions.

**If the auditor finds remaining work, continue instead of stopping.** That is
the continuation trigger, and it is the auditor's answer that decides it — not a
feeling that there is more to do.

## 6. What the report says

Short, and in the user's language. For each item: what landed, the PR number,
and the one thing that was surprising. Then blockers, one line each, phrased as
what the user must do. Then the questions.

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
