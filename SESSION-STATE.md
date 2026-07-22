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

The composites app is live at **feb-composites.web.app**, source on GitHub at
**Jinxiewinx/feb-composites-applications** (public, `main`, in sync).

Most recent work: **the printed work-order traveler** — printing a WO now
produces a purpose-built hand-fillable form instead of a screenshot of the app.
Finished and pushed. Tests: `tools/test_app.mjs` at **67 passing**.

## Decisions made (don't relitigate)

### Repo / infrastructure
- **Git root is `SN6 Resources/`, not `03 Work Orders/`.** The `tools/` scripts
  resolve `Path(__file__).parent.parent / "03 Work Orders"`, so they only run
  from one level up. A whitelist `.gitignore` ignores `/*` and re-includes the
  app, `tools/`, `README.md`, and this file.
- **Push over HTTPS, never SSH.** The machine's SSH key authenticates as
  `starbuckgold`; the repo belongs to `Jinxiewinx`, the `gh` CLI account.
  `ssh -T git@github.com` reporting success is misleading here.
- **Repo is public**, Simon's call. Scanned clean — no credentials, no
  `@berkeley.edu` addresses, no member names in seed data.
- `firebase deploy` runs from **inside `03 Work Orders/`**, even though the git
  root is one level up.

### Printed traveler
- **The print document is its own DOM**, built by `app/print.js` into
  `#printroot`, not the screen view restyled. `@media print` only chooses which
  of `#app` / `#printroot` is visible, keyed off `body.sheet`.
- **`print.css` is deliberately NOT inside `@media print`.** The sheet renders
  identically on screen and paper, which is what makes the preview trustworthy
  and lets the design be reviewed from a screenshot. Don't "tidy" it into a
  print-only block — that breaks the whole review loop.
- **Shop-traveler styling, B&W-laser first.** Every distinction must survive
  grayscale: blockers use hatching + heavy rules + the literal word "BLOCKER",
  never colour alone. Berkeley blue/gold are enhancement only.
- **Blank trailing rows are a feature, not slack.** `BLANK_ROWS` /
  `BLANK_FORM_ROWS` in `print.js`. Shrinking them to save paper defeats the
  point — Simon asked for room to add lines by hand.
- Retro records store the literal string `"not recorded (retro)"`. `pv()` maps
  that to empty so it never reaches paper as if it were data.
- Blank forms build their steps from `STD_STEPS`, so a blank is a real procedure
  rather than empty ruling.
- Page numbering is **hand-written** (`Page ___ of ___`). Chrome doesn't support
  `@page` margin-box counters, so there is no reliable way to print it.

## Open questions for Simon

- None blocking.
- The full traveler runs **~3 pages** for a complete WO (2 for a blank). That's
  the cost of the generous fill-in space. Say if it should be tightened.
- Standing offer, low priority: the four doc-only scripts in `tools/`
  (`build_docx.py/.sh`, `check_traceability.py`, `gen_retro_wos.py`) can be
  dropped from the repo if it should hold only app code.

## Notes for whoever picks this up

- **Visual review harness:** `tools/print-preview.html`. Needs a real HTTP
  origin (seed JSON fetch is blocked on `file://`):
  `cd "SN6 Resources" && python3 -m http.server 8777`, then
  `http://localhost:8777/tools/print-preview.html`. It has toggles for blank
  form, B&W proof, margin guides and page breaks, plus a readout of approximate
  page count and horizontal overflow.
- **Test harness gotcha:** `tools/test_app.mjs` concatenates the app's classic
  scripts into one indirect `eval`. Top-level `const` stays lexical and is
  invisible to tests, so the harness rewrites a named list
  (`STD_STEPS|WO_STATUSES|PROCESSES|BLANK_ROWS|BLANK_FORM_ROWS`) into implicit
  globals. **Adding a new app file means adding it to `FILES` too**, or the
  harness silently won't see it.
- `firebase.json`'s no-cache header now covers `css` as well as `html|js|json`.
  It previously didn't, which would have served `print.css` stale for an hour —
  the same class of cache bug that bit Simon during initial setup.
- Storage-backed features (avatar/file upload) still need the Firebase **Blaze**
  plan. Built and tested against the emulator.
- Emulator hosting port is **5050** — macOS AirPlay squats on 5000.

## Next up (not started)

- Port the traveler to the offline single-file `work-orders.html`, which still
  has the old weak print CSS.
- `reports.js` "Print status board" still calls raw `window.print()`.
- `05 Printables/printables.html` is open to redesign — Simon said it is not a
  house style to conform to.
