# Changelog

Every released version of the FEB Composites app, newest first.

Releases are cut with `node tools/release.mjs <version>`, which tags the commit,
deploys hosting and prints a Slack note for `#composites` — with one or two
pictures to attach to it, on every Major and Minor. See
[the release section of the tools README](tools/README.md).

## What the numbers mean

The app is a shop tool, not a library, so the scale is about **what the team has
to learn**, not about API compatibility:

- **Major** (`2.0.0`) — a new top-level area, or the way the team works changes.
  Navigation moves. People need telling before they open it.
- **Minor** (`1.1.0`) — a new capability inside an area that already exists. Worth
  a Slack note; nobody has to relearn anything.
- **Patch** (`1.0.1`) — fixes and copy. Nothing new to learn.

---

## v4.0.0 — 2026-08-28

- Release prep for v4.0.0: What's New, the two pictures, and a wasm MIME fix
- Compare reports the precision it was given, not two decimals
- The R&D bench: coupons get a home that is not a work order
- The splash becomes a gate, and the lights go out to open it
- SESSION-STATE: v3.2.0 is cut and live; the announce press and Slack note are Simon's, pending

---

## v3.2.0 — 2026-08-28

- Release prep for v3.2.0: WHATS_NEW and the two pictures
- Inventory sections become their own cards; phones put the name first
- EH&S import: per-row unticks, and the location sections get room to breathe
- Inventory round 2 lands whole: scan-into-field, and the materials table
- Inventory Select…: mass delete for jugs, open to the whole roster
- Inventory round 2, first landing: grouped containers, sections, co-storage, iOS zoom

<details><summary>8 more</summary>

- EH&S barcodes, phase 4: the RSS export imports, and reconciliation exports back
- EH&S barcodes, phase 3: iPhones get camera scanning through vendored zxing-wasm
- SESSION-STATE: EH&S phases 1-2 live and verified; 3-4 paused per Simon, handoff posted in chat
- EH&S barcodes, phase 2: the scanner reads the university's tag
- EH&S barcodes, phase 1: the UC tag becomes a second identity for chemicals
- Step buy-off cluster stops poking into the landscape safe-area inset
- The mold's stage becomes a stepper, in the Parts idiom
- SESSION-STATE: v3.1.0 is live, and one Announce covers both releases

</details>

---

## v3.1.0 — 2026-08-27

- What's New: v3.0.0 was an hour ago, not last week
- Season: one part per line, on columns you can scan down
- SESSION-STATE: v3.0.0 is live, and nobody has been told yet

---

## v3.0.0 — 2026-08-27

- Write the v3.0.0 What's New and shot list
- Guest mode is switched on, and the app is publicly readable
- The program and the shop's footer go side by side, and team lore gets a surface
- The guest door recognises the code the SDK actually throws
- The guest door catches, so a refusal is a sentence rather than silence
- Re-shoot the dashboard and season mockups, and their captions

<details><summary>9 more</summary>

- View as guest: the whole app, read-only, with no account
- The dashboard becomes a pit board: four lanes, and none of them can vanish
- The dashboard learns what you can actually do right now
- The splash waits, the blueprint became a read, the cut list reached paper
- AUDIT_NET, and the sanitizer suite stops waiting on a CDN
- test_q_landing was talking to production Firestore, not to nothing
- The app loads per file, so coverage can finally name one
- SESSION-STATE: v2.2.2 is live and main matches it
- The two v2.2.2 release pictures

</details>

---

## v2.2.2 — 2026-08-27

- SESSION-STATE: main is ahead of live, and the printed note is stale
- The R&D chip swaps the list instead of adding to it
- The two v2.2.1 release pictures

---

## v2.2.1 — 2026-08-27

- release.mjs: --shots, for a patch that does have something to look at
- R&D is out of the rails by default, and the list fade stops eating the last row
- The two v2.2.0 release pictures

---

## v2.2.0 — 2026-08-27

- What's New for v2.2.0: the R&D build, in the team's words
- Rebuild the CS docx, and fix the encoding bug that made it unsafe
- R&D parts: real work that is not a season deliverable

---

## v2.1.2 — 2026-08-26

- Datasheets back on the Documents tab, printables guide off
- SESSION-STATE: the Season WIP banner is meant to come off

---

## v2.1.1 — 2026-08-26

- Mark the Season tab a work in progress
- The #composites note is WHATS_NEW, not commit subjects
- SESSION-STATE: v2.1.0 is out, and the Slack note still guesses

---

## v2.1.0 — 2026-08-25

- What's New for the board and work-order release
- A shelf card reads top of the pile down
- One row per board on the rack, not one row per size
- Sort the rack, plan molds across a density range, and delete work orders cleanly
- Write down what v2.0.0 actually was, and what shipping it taught

---

## v2.0.2 — 2026-08-25

- The release script stops writing the team's release note for them. It bumps
  the version and checks that a human rewrote What's New since the last tag,
  rather than generating it from commit subjects and overwriting the rewrite on
  the next release.

---

## v2.0.1 — 2026-08-25

- What's New reads like a note to a person rather than a changelog.
- The deploy's live-check retries instead of failing on a good deploy that the
  CDN had not finished serving yet.

---

## v2.0.0 — 2026-08-25

The season plan moves into the app, and the board is rebuilt around the app that
exists after v1.0.0.

### Added

- **The Season tab** — the blueprint, and the end of running the season off the
  Composites Master Tracker spreadsheet. One row per part the team means to
  make, thirteen columns, most cells empty by design: a row that exists with
  nothing in it is a commitment to build the thing. A row **is** a real part
  from the moment it exists, so there is no promotion step — "making the real
  part file" just means filling the row in. Every cell edits in place; the three
  stage columns are colour-coded and still go through the evidence gate and the
  skip-ahead confirm; the part name stays pinned while the other twelve columns
  scroll. This season only, and the Google Sheet is downstream now.
- **Photos on an issue after it is raised**, from the work order — a thumb strip
  and a camera button on each row, joining the run's lightbox set.

### Changed

- **The dashboard stopped saying things twice.** Shop status is now only what is
  blocked and what is curing; the inventory counters became Stock & housekeeping
  at the bottom, where a monthly habit belongs. The alert strip owns the T-minus
  outright. And an issue folds into the run it holds up, leaving a flag with the
  count still open — every issue has a work order, so the board had been listing
  the same run twice, the same double-count that once overstated "behind
  schedule" by about 40% for parts and work orders.
- **Creating or editing a part opens on Details**, instead of below Progress,
  the layup stack, the materials plan and the runs. The same fix work orders got
  in v1.0.0.
- The dashboard's Season module is now **Build progress**, which is what its
  three bars show. The tab took the word.

### Fixed

- The three stage columns carried their state class on the `<select>` rather
  than on a wrapper, which matched no rule in the stylesheet — so the colour
  coding rendered plain white while looking entirely correct in the DOM.
- Test fixtures described a part list with no current season in it (all 33 are
  `retro`), so the Season tab and the Google Sheet feed — which both exclude
  retro — were photographed empty by every screenshot and browser suite.

---

## v1.0.0 — 2026-08-25

The first named release. Also the release that turned the app from a project
tracker into a work tracker.

### Changed

- **Issues live on the work order now.** A work order has an Issues section:
  what is open, what it was disposed as, and a button to raise the next one.
  Resolving from there goes through the same CS-003 gate as everywhere else, so
  a run still cannot complete over an undisposed issue.
- **The Tickets tab is shelved.** The app stopped being a place to track
  projects. Every existing ticket is still in Firestore and still opens from a
  link or a chip — it is only off the sidebar. See
  [`03 App/app/SHELVED.md`](03%20App/app/SHELVED.md) for what was paused and how
  to bring it back.
- **Work Orders filter on open issues**, so "which runs are held up" is one chip.
- **Creating or editing a work order opens on Details.** It used to open below a
  seven-step list, scrolled past the only fields a new run has.
- **A loading screen**, instead of a white page then a bare "Connecting…" card.
  It lays up the two plies of the mark and shows a line of the team's own shop
  lore while Firebase connects.
- **"Load SN5 archive" is off the toolbar**, for leads too. A one-click bulk
  import has no business next to Sign out now that the app holds the season the
  team is actually running. The function and the seed files remain — the
  screenshot and mockup tooling depends on them.

### Added

- **The app knows its version.** It is in the ⋯ menu, so a bug report can name
  the build. A What's New panel opens once per version, and a lead can announce
  a release from the same menu — anyone still running an older build then gets a
  "reload to get it" banner without having to be told in person.

### Fixed

- Work order sections 7 and 8 were unreachable from the keyboard: the hint said
  `1`–`6` and the regex said `[1-7]` over seven sections. Both now agree, and a
  test keeps them agreeing.

---

## 0.x — before versioning

The first 36 days, 2026-07-21 to 2026-08-25: 243 commits, no tags, one author.
Recorded here so a future lead can place a change in time; the detail is in
`git log`, whose commit bodies are the real record.

| When | What landed |
|---|---|
| 07-21 | The original single-file printable work-order traveler |
| 07-22 | Mobile and the design system: drawer nav, tokens, dark mode, self-hosted fonts, installable PWA |
| 07-24 | Mold stack planner: board inventory, STL slicer, exploded stack view, cut list |
| 07-27 | **Tickets** — projects and issues, with the CS-003 disposition gates |
| 07-30 | 3D mold view and ISO 3098 engineering drawings |
| 07-31 | **It went live.** First hosting deploy; the design system and screenshot tooling |
| 08-01 | Document-grade comments and rich text; cure holds enforced against the datasheet |
| 08-02 | The dashboard rebuilt as a grouped list |
| 08-03 | **Labels, QR and scanning** — molds, materials and items become physical records |
| 08-04 | Tabs consolidated, and **Inventory** becomes the storage map; the receiving wizard |
| 08-05 | The part/run/mold data model: the part is the parent |
| 08-06 | Master–detail rails everywhere |
| 08-07 | The dashboard becomes the board: countdown, launchpad, activity feed |
| 08-11 | Widescreen layout, budget goals and category caps |
| 08-15 | Work-order photos, the training matrix, and the Google Sheet tracker mirror |
| 08-19 | **BOM costing** and the first backend: a `parseReceipt` Cloud Function |
| 08-23 | Windows portability, and the receiving desk |
| 08-24 | Boards leave Molds for Inventory; the docs split in two |

By the scale above, several of those were majors — going live, labels and
scanning, the tab consolidation, the backend. They are left untagged: v1.0.0 is
a starting line, not a re-reading of the past. The next change of that size gets
a confident `2.0.0`.
