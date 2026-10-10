---
name: work-autonomously
description: >-
  The default operating mode of every session in a git repository, put in
  context at session start by the nxgt-autonomy hook: work the standing queue
  to completion — branch, verify, review, document, PR and merge each item —
  then run the verifier and the auditor, refill the queue (the queue-refiller
  when the owner said to keep going, else the scout) and plan the roadmap
  instead of stopping. Owner decisions go through interactive questions,
  recommended option first; a question unanswered after 5 minutes goes to
  the unanswered-question-resolver. It never hands back, never starts
  unapproved work, and never takes an irreversible step without an explicit
  answer. Read it at the start of a session, when an item lands, and
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

Five agents do the parts that must not be done by whoever did the work:

| agent | what it is for |
| --- | --- |
| `work-queue-auditor` | reconciles the queue with `git log` and `gh pr list`, and the roadmaps with the queue; says what remains |
| `improvement-scout` | proposes improvements, applies none |
| `green-bar-verifier` | refuses to call anything done that was not measured |
| `queue-refiller` | when the queue is empty and the owner said to keep going: reconciles, sweeps for improvements and features, and writes the top items into the queue — approved by mandate only when the owner pre-approved recommendations and the item is reversible (section 5) |
| `unanswered-question-resolver` | when a question got no answer in 5 minutes: takes the recommendation (or the owner's tick) if it is reversible and inside the autonomy mandate (a public-API addition also needs the queue's `Mandate:` line to cover features) and records it under *Assumed, not answered*; otherwise waits under *Blocked on the user* with a holding step (section 4) |

---

## 1. The queue is a file, one per project

`~/.claude/projects/<project>/memory/work-queue.md` — the owner's memory file
for the project the session runs in. Every project's is listed with:

```bash
ls ~/.claude/projects/*/memory/work-queue.md
```

The one whose project matches the checkout is this session's queue. An item may
name several repositories; it still lives in that one file.

Five sections, and each one earns its place, under an optional `Mandate:`
line:

```markdown
Mandate: <date> "<owner's words>" — covers: improvements | improvements and features — repos: <names | all> — until: <date | revoked>
## Assumed, not answered  decisions taken on a recommendation (or a ticked option) after the question timed out — the owner confirms or reverses each
## In flight              what to work on now, most-blocking first
## Blocked on the user    named, with what exactly is needed
## Proposed, not approved  the scout and the refiller write here — DO NOT START
## Done                   crossed off with the PR number that proves it
```

The **`Mandate:` line** is the owner's pre-approval of your recommendations
("adopt your recommendations", « j'approuve tes recommandations »), written
when he gives it, with his words, what it covers and until when. It is the
only thing that lets `queue-refiller` write into *In flight*; he revokes it
by striking it out. A question the resolver decides to wait on goes to
*Blocked on the user*; only a taken one goes to *Assumed, not answered*.

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
   this first PR. Work on it in a worktree of its own when the main checkout
   is busy or another session is in the repository — under
   `~/workspace/worktrees/<repository>/<branch-slug>`, **never beside the
   repositories in `~/workspace/dev/`**.
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
   default branch, and **remove the item's worktree** if it had one
   (`git worktree remove`, `git worktree prune`, and its
   `~/workspace/worktrees/<repository>/` folder once empty). **Merges and releases follow the repository's `AGENTS.md`**
   (who may merge, merge commits or squash, when a Version PR lands); where it
   is silent, "Merges and releases" in `~/.claude/CLAUDE.md` decides — a slice
   into its `feat/*` once green, `develop`, `main` and every publish on the
   owner's yes. With neither, open the PR and ask.
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
  What `queue-refiller` writes into *In flight* is not new scope: the owner
  approved it in advance, by the queue's `Mandate:` line (section 1), and the
  line says so.
- **Never take an irreversible or outward-facing step on anything but an
  explicit answer** — deleting data, force-pushing, the first publish of a
  package, spending money, messaging anyone off this machine. Ask, and carry on
  with other work until the owner answers; a recommendation is not an answer.
  The 5-minute rule of section 4 never reaches these: its resolver waits on
  every one of them.
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

Ask with `AskUserQuestion`. "Questions to the owner" in `~/.claude/CLAUDE.md`,
when there is one, sets the language and the label and wins over this list;
otherwise ask in the owner's language, and:

- **Recommend.** Put the recommended option first and label it
  `(Recommended)` — `(Recommandé)` when asking in French.
- **Say what each option costs**, not what it is. "Two passes work but produce a
  history whose paths change mid-way" beats "use two passes".
- **Use a preview** when the options are shapes — a tree, a snippet, a file
  layout. It is what makes a choice comparable at a glance.
- **Label an irreversible or outward-facing question `(Irreversible)`**, so it
  reads as one that waits for a real answer (section 3).
- **Never ask what the code can answer.** Measure it instead.

### A question left unanswered for 5 minutes

The owner's standing rule: **5 minutes without an answer, take the
recommendation — when it can be undone.** Claude Code gives that one
mechanism, and this skill claims no other:

- **`askUserQuestionTimeout: "5m"`** — a Claude Code setting (`/config` →
  *Question auto-continue timeout*; `"60s"`, `"5m"`, `"10m"` or `"never"`,
  default `"never"`). With it, a question left idle for 5 minutes continues
  on its own, with **no submitted answer** — only any option the owner had
  ticked. That result is the trigger: note the time before asking and after
  (`date -Iseconds`), then run **`unanswered-question-resolver`** with the
  question, its options in order, both times, the timeout, whether it was
  labelled `(Irreversible)`, and what the owner had ticked. It waits on
  anything irreversible, outward-facing or breaking, and on an addition to a
  published package's public API unless the `Mandate:` line covers
  features. Act on its `DECISION`; if
  it says wait, take its holding step and carry on with the rest of the
  queue.
- **Without that setting, nothing fires.** `AskUserQuestion` holds the turn
  until the owner answers. A background command keeps running meanwhile, but
  nothing — no timer, `sleep`, `Monitor` or scheduled wake-up — can answer
  the question or let the session act before it is answered. So at the start
  of an autonomous run, read the setting —

  ```bash
  grep -h '"askUserQuestionTimeout"' ~/.claude/settings.json .claude/settings.json .claude/settings.local.json 2>/dev/null
  ```

  — and when it is `"never"` or absent, say so in the first report and ask
  the owner to set it to `"5m"` in `/config`; `"60s"` or `"10m"` also fire,
  and the resolver records the value that did. The grep does not see managed
  (policy) settings or `--settings`: when `/config` does not offer the entry,
  a managed setting holds it, and only its administrator can change it.
  **Never edit a settings file for it yourself**:
  it is the owner's setting, and a question that blocks is his to shorten.
  Until he does, the older rule is the only one that works: everything that
  does not depend on the answer is done **before** asking.

An owner's answer that arrives later, in the chat, replaces the assumed one:
if they differ, queue the undo and remove the *Assumed, not answered* line.

## 5. The end of a run, in this order

When *In flight* is empty, or everything left in it is blocked:

1. **`green-bar-verifier`** — on what this run landed. If it finds an unmeasured
   claim, that item goes back in flight.
2. **`work-queue-auditor`** — reconciles the queue with `git log` and
   `gh pr list`, and the roadmaps with the queue.
   Anything it finds that is done-but-not-crossed-off, or crossed-off-but-not-
   merged, is fixed in the file.
3. **`queue-refiller`** — when *In flight* has no actionable item and the
   owner has said to keep going. Pass it the queue's path, the owner's
   go-ahead quoted with its date, and the auditor's report; it reads the
   queue's `Mandate:` line itself. It writes the top items into *In flight*
   (approved by mandate: covered by the `Mandate:` line **and** reversible,
   and not planned by another session) or *Proposed, not approved*
   (anything irreversible, outward-facing beyond PR, merge and release,
   breaking without a mandate, a feature the mandate does not cover, or no
   mandate), and returns `LAUNCH NEXT`. With `nxgt-crew`, record each *In
   flight* line that has a roadmap entry with `/crew announce --kind plan`
   (`plan-the-roadmap` step 5) — the refiller cannot — then launch those
   items through section 2, in order. It also names the **sibling sessions that
   look idle**; it cannot message them. For each, send one `SendMessage`
   naming the candidates it found for that session's repository — first line
   self-contained, one message per session, no follow-ups; in the main
   conversation `ListAgents` (and `notify_when_idle`) are yours to check
   first when it could not. Without the owner's go-ahead, run
   **`improvement-scout`** instead — it writes into *Proposed, not
   approved*, and applies nothing.
4. **`plan-the-roadmap`** — on whatever sits in *Proposed, not approved*: the
   queue running dry is not a reason to stop. It ends in interactive
   questions, and what the owner approves goes back into *In flight*.
5. **Report**: what landed with PR numbers, what is blocked and on what
   exactly, what the refiller or the scout proposes, and the interactive
   questions.

**If the auditor finds remaining work, continue instead of stopping.** That is
the continuation trigger, and it is the auditor's answer that decides it — not a
feeling that there is more to do. **Never end a turn by handing back or
waiting**: a turn ends on work done and questions asked, not on "let me know".

## 6. What the report says

Short, and in the owner's language. **It leads with every *Assumed, not
answered* line** — the decisions taken on a recommendation while he was
away — so he can reverse one before it has consequences. Then, for each
item: what landed, the PR number, and the one thing that was surprising.
Items the refiller queued by mandate say so. Then blockers, one line each, phrased as
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
