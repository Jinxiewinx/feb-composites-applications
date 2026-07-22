# Session state

Running handoff file, per working rule 2 in `CLAUDE.md`. If a session was cut off
by a usage limit, **read this first** — it is the successor's briefing. Update it
as work proceeds, not just when stopping.

Keep it short. Durable state only: decisions made, work in flight, open
questions. Not a transcript.

---

**Last updated:** 2026-07-21
**Status:** ✅ No work in flight. Clean stopping point.

## Where things stand

The composites app is live at **feb-composites.web.app** and its source is now on
GitHub at **Jinxiewinx/feb-composites-applications** (public, `main`, in sync).

Everything below is finished and pushed. A new session can start fresh on
whatever Simon asks next.

## Decisions made this session (don't relitigate)

- **Git root is `SN6 Resources/`, not `03 Work Orders/`.** The `tools/` scripts
  resolve `Path(__file__).parent.parent / "03 Work Orders"`, so they only run
  from one level up. A whitelist `.gitignore` ignores `/*` and re-includes the
  app, `tools/`, `README.md`, and this file. Moving the root down means
  repointing those path constants first.
- **Push over HTTPS, never SSH.** The machine's SSH key authenticates as
  `starbuckgold`; the repo belongs to `Jinxiewinx`, which is the `gh` CLI
  account. `gh auth setup-git` is configured and the HTTPS remote works.
  `ssh -T git@github.com` reporting success is misleading here.
- **Repo is public**, Simon's call. Scanned clean: no credentials, no
  `@berkeley.edu` addresses, no member names in seed data (retro work-order
  assignees are all `"not recorded (retro)"`). The Firebase `apiKey` in
  `app/firebase-config.js` is a public web config by design — security lives in
  `firestore.rules`.
- **All of `tools/` is tracked**, including the four doc-only scripts
  (`build_docx.py/.sh`, `check_traceability.py`, `gen_retro_wos.py`).
  `gen_retro_wos.py` generated the seed data that is tracked, so it is
  provenance. Simon was told and can ask to drop them.
- Commits are authored `Doctor Who <starbuck@berkeley.edu>` — the global git
  identity. Left as-is deliberately; set a repo-local `user.name` if a real name
  is ever wanted on team-facing history.

## Open questions for Simon

- None blocking.
- Standing offer, low priority: the four doc-only scripts in `tools/` can be
  dropped from the repo if he'd rather it hold only app code.

## Notes for whoever picks this up

- `firebase deploy` runs from **inside `03 Work Orders/`** (that's where
  `firebase.json` is), even though the git root is one level up.
- Storage-backed features (avatar/file upload) still need the Firebase **Blaze**
  plan. Built and tested against the emulator; live uploads wait on the upgrade.
- Two test suites, both run from `SN6 Resources/`:
  `node tools/test_app.mjs` and `node tools/test_wo_rules.mjs`
  (the latter inside `firebase emulators:exec`, from `03 Work Orders/`).
