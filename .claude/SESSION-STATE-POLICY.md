# What belongs in SESSION-STATE.md

Written 2026-08-25, after `SESSION-STATE.md` reached 3,183 lines and 188 KiB —
roughly 48,000 tokens, paid by every session that opened it. Its own header
already said "keep it short, durable state only, not a transcript"; that was
not enough, because there was no test for what "durable" meant and no cap to
enforce. This file is the test and the caps.

This is an internal working file for whoever is editing the repo. It is not
team documentation — `README.md` and `HANDOFF.md` are.

## The failure mode this prevents

Nothing here got in by being wrong. Each session appended an honest, well
written report of what it had just done, and each report was useful *that
week*. The file grew because nothing was ever the thing that got removed. The
result was a file where the durable material — decisions, open questions, next
steps — sat below 2,900 lines of superseded status.

So: **adding is not the job. Adding and removing is the job.** If you append to
this file without deleting from it, you have done half of an edit.

## The keep test — all five must hold

1. **Non-derivable.** You could not learn it by reading the code, running the
   tests, or reading `git log`. "`packer.js` has no access to `core.js`" is
   derivable — skip it. "Mold density is a string and board density a number
   *on purpose*, so there is no migration" is not — keep it.
2. **Costly to rediscover.** It took a bug, a screenshot, a live experiment, or
   a wrong assumption to learn. If the next session would trip the same wire,
   keep it.
3. **Still true.** The file, function, or flag it names still exists. `grep`
   before you keep. An entry describing deleted code is worse than no entry,
   because it will be believed.
4. **Not already written down elsewhere.** Check `README.md`, `SETUP.md`,
   `HANDOFF.md`, `tools/README.md`, `06 Composites App/app/README.md`, `CLAUDE.md`,
   `.design-sync/NOTES.md`. If it is there, delete it here. If it *belongs*
   there and isn't, **put it there** — those files are maintained and read by
   humans; this one is neither.
5. **Load-bearing for a decision.** It would stop someone reversing a
   deliberate choice, or unblock them. Knowledge with no decision attached is
   trivia, however interesting.

## Retire on sight

- **Superseded status.** "NOT DEPLOYED YET", "in flight", "OPEN" items that a
  later entry closed. When something ships, the entry saying it hadn't goes.
- **Test pass counts.** `test_app 547, appui 1242, …`. The suites are the
  truth; a number in prose is stale the day it is written and tells a future
  reader nothing they can act on.
- **Narrative of work done.** What was built, in what order, and why it was
  good. That is `git log`, and `git log` is better at it.
- **Anything duplicated in a README.** Delete here, keep there. No summary line
  and no pointer left behind — this file should not become a table of contents
  for the docs.
- **Resolved questions and closed items**, including ones "kept for the
  reasoning". The reasoning is in the commit that closed them.
- **Framing prose.** The paragraph explaining why a change mattered, once the
  change has shipped.

## Caps

| Section | Cap |
|---|---|
| Whole file | **400 lines** |
| `Now` | 400 words |
| `Open questions for Simon` | 150 words |
| `Next up` | 15 single-line items |
| One `Constraints` entry | **60 words** |
| `Constraints` total | 25 entries |
| One `Recent log` entry | **80 words** |
| `Recent log` depth | **5 sessions** — the sixth is deleted, not demoted |

A constraint that will not fit in 60 words is not a constraint; it is README
prose. Write it there and link nothing.

## The sections, and what goes in each

1. **Now** — unshipped, broken, in flight. The only section expected to churn
   every session. If a deploy happens, this is the section that shrinks.
2. **Open questions for Simon** — things only he, or a human with a real
   device, can settle. Delete each one the moment it is answered.
3. **Next up** — not started. One line each, no rationale.
4. **Constraints — don't relitigate** — the durable core. This section should
   grow very slowly and almost never shrink.
5. **Recent log** — five sessions, newest first, 80 words each, as orientation
   only. It is not a changelog and must not be treated as one.

## Nothing is lost when you cut

`SESSION-STATE.md` is committed on main. Every word ever removed is one command
away:

```bash
git log -p --follow -- SESSION-STATE.md
```

Do **not** create `SESSION-STATE-ARCHIVE.md`. An archive file is the same
188 KiB under a new name, and the next session will read it out of diligence,
which is exactly the cost this policy exists to remove.

## When to re-run this cleanup

When the file passes 400 lines, or when `Recent log` holds a sixth entry.
Re-reading this file and applying the keep test takes about ten minutes; it is
much cheaper than the tokens a bloated handoff burns on every session that
follows.
