# FEB CFD Sims Dashboard

Started 2026-09-02. A shared dashboard for the aero team's CFD work: every
simulation the team runs, its inputs, its results, and its plots, in one place
that many people can read and update at once.

Nothing here runs yet. This folder holds the brief, the decisions made so far,
and the layout the app will grow into. Read `DECISIONS.md` before changing
the shape of it.

## What it is for

The aero team runs Fluent design points by the dozen, and the record of what
was run, with what settings, and what came out, lives in file names, report
PDFs, and people's heads. The `07 CFD PDF Viewer/` sibling solves one narrow
piece of that (comparing two reports visually). This app is the wider thing:

- A registry of every sim: design point, geometry revision, mesh, solver
  settings, who ran it, when, on which machine, and status (queued, running,
  converged, failed, superseded).
- Result numbers per sim (CL, CD, L/D, balance, per-element loads, residuals)
  in a form you can sort, filter, and plot across sims, not one PDF at a time.
- Plots and contour images attached to each sim and viewable side by side.
- Fast enough with hundreds of sims and gigabytes of attachments, which sets
  the storage design (see `DECISIONS.md`).
- Multi-user from day one, on the same roster model as the composites app.

## Shape of the folder

| Path | What goes here |
|---|---|
| `README.md` | This file: brief and status |
| `DECISIONS.md` | Why it is a web app on Firebase, how data is split between Firestore and Storage, and other calls that should not be silently reversed |
| `app/` | The web app. Same stack as `03 App/`: static HTML, CSS, and ES modules, no bundler, Firebase SDK from the CDN, design tokens from `06 Design System/` |
| `ingest/` | The uploader that runs next to Fluent: reads a finished case's report and CSV exports and pushes a sim record plus attachments. Starts as a Node script; a Python twist is fine if the aero workstations prefer it |
| `design/` | Mockups and screenshots, dated, as in the other folders |

## Status

- 2026-09-02: folder created, brief and decisions written. No code yet.
  Firebase project not yet created. Data model not yet written down beyond
  the sketch in `DECISIONS.md`.

## Next

1. Confirm the Firebase project choice (new project `feb-cfd` vs reusing the
   composites one). `DECISIONS.md` recommends new.
2. Write the sim record schema and the Firestore rules for it.
3. Get one real Fluent export from aero and build `ingest/` against it before
   any UI, so the app is designed around data that exists.
4. First screen: the sim table with filters and a sparkline per result column.
