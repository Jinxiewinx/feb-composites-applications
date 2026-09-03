# Changelog

Every released version of the FEB CFD app, newest first. Tags are
`cfd-vX.Y.Z`; the bare `vX.Y.Z` series in the root `CHANGELOG.md` belongs to
the composites app. Same rubric for the numbers: Major when the team has to
relearn navigation, Minor for a new capability, Patch for fixes and copy.

---

## cfd-v0.2.0 — 2026-09-03

A Dashboard, saved views, and the composites app's shell.

- The app now opens on a Dashboard: the latest design point's downforce,
  drag and L/D as tiles, two trend charts by design point, the saved views,
  and a card for every report in the library with a thumbnail of its
  `stat-car-0` contour, its date, analyst and mesh size, a note, and its
  numbers. Clicking a card opens the report in the viewer.
- Every upload reads the force numbers out of the report's own Report
  Definitions page and renders the thumbnail from the open PDF. Reports
  uploaded before this catch up the first time anyone opens them.
- Save view: what is open, with the tab, the plot and the overlay, becomes a
  named view on the Dashboard that anyone can open.
- The same sidebar, topbar, cards and light/dark toggle as the composites
  app, with the CFD mark in the sidebar. The viewer's page canvas stays dark
  in both themes.
- A note asked after upload, editable later, shown on the card.

## cfd-v0.1.0 — 2026-09-02

The desktop CFD viewer, hosted. Everything `07 CFD PDF Viewer` did (Pages,
Panels, Overlay blend/swipe/difference, Summary, Search) now runs at
https://feb-cfd.web.app with a shared report library.

- Reports opened here are uploaded to a library the whole team sees; the
  next person opens them from the list instead of hunting for the PDF.
- The address bar carries what is open, the tab and the plot, so a link is a
  comparison.
- The same PDF uploaded twice is recognised by its hash and not stored twice.
- Swipe works on a touch screen.
- No sign-in for anything, by decision. The bucket accepts only PDFs under
  60 MB.
