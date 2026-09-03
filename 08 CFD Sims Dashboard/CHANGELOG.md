# Changelog

Every released version of the FEB CFD app, newest first. Tags are
`cfd-vX.Y.Z`; the bare `vX.Y.Z` series in the root `CHANGELOG.md` belongs to
the composites app. Same rubric for the numbers: Major when the team has to
relearn navigation, Minor for a new capability, Patch for fixes and copy.

---

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
