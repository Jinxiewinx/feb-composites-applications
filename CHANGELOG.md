# Changelog

Every released version of the FEB Composites app, newest first.

Releases are cut with `node tools/release.mjs <version>`, which tags the commit,
deploys hosting and prints a Slack note for `#composites`. See
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
