# FEB CFD Viewer

Compare Fluent CFD reports without opening two PDFs side by side and hunting for
the same plot in each.

Load two or more design points. The reports scroll together, every named plot is
matched across them, and you can put the same contour side by side or lay one
over the other to see what actually moved.

## What it does

Pages view puts one report per column, scrolling together. Unlock the toggle to
scroll one on its own when you want a closer look at a single report, then
Re-sync snaps everything back to the column you last touched.

Panels view is the one to reach for. Pick a plot by name and you get that plot
from every open report, cropped identically and scaled the same, so the eye can
do the comparing.

Overlay lays two reports on top of each other three ways. Blend fades between
them. Swipe puts a draggable divider down the middle, which is the best way to
judge a boundary because a discontinuity across a straight edge is obvious.
Difference computes the per-pixel change, amplified, and tells you what fraction
of the panel moved. Two identical reports read exactly 0.00%, so the number is
trustworthy.

Summary skips the pictures. Mesh counts, solver settings, iterations, inlet
velocity and final residuals from every report in one table, with changed values
highlighted. Often this answers the question before you look at a plot at all.

Search covers plot names and the full document text. Typing `vc3` finds
`velo-car-3`, and picking a result moves every report to it at once.

Zoom with pinch on the trackpad, Cmd-scroll, or the toolbar buttons. When
tracking is on every column zooms together; unlock it and each zooms on its own.

Keys: `/` search, `j` and `k` next and previous plot, `s` toggle sync, `r`
re-sync, `1` to `4` switch view.

## Running it

As a desktop app:

```
npm install
npm start
```

As a plain web page, with nothing installed beyond Python:

```
npm run serve          # or: python3 -m http.server 8123 --directory app
open http://localhost:8123/index.html
```

It has to be served over HTTP rather than opened as a file. pdf.js is an ES
module and starts a module worker, and browsers refuse to load module scripts
from a `file://` origin. The Electron build works around this by serving the app
over a custom `app://` protocol, which is why the packaged app and the browser
page run identical code.

## Building

```
npm run build:mac      # .dmg and .zip in dist/
npm run build:win      # .exe installer and portable build in dist/
```

The macOS build is verified: it produces a 115 MB .dmg and .zip, and the packaged
app boots and indexes a report. It is not code-signed, so the first launch needs
right-click then Open, or Gatekeeper will refuse it.

The Windows target is configured but has not been built or tested. Cross-building
Windows from macOS needs Wine, so it stays unverified until someone runs it on a
Windows machine or through CI.

`npm run smoke` drives a running desktop build over the DevTools protocol and
checks that a report actually loads and indexes in the window. Start the app with
`npx electron . --remote-debugging-port=9333` first. That test exists because
launching Electron and seeing a window is not proof the app works: the risky part
is pdf.js starting a module worker, which depends on the page origin.

## How the matching works

Fluent exports these reports through Chromium and every export has the same
shape, which is the only reason automatic comparison is possible. Two properties
of that layout do the work:

Panel titles are set much larger than body text and sit against the left margin.
In the sample every one lands at 26.8125 pt, so a tolerance band around that
picks out all 59 named panels (36 contours, 6 vectors, 17 convergence plots)
without parsing layout.

Panels sit on a roughly uniform 502.5 pt pitch and flow continuously down the
document, so a panel can start near the bottom of one page and finish on the
next. Nothing in the app may assume a panel lives on one page.

That pitch is a typical spacing, not a rule. Where a page break falls inside a
panel it pushes the plot down, and 28 of the 58 panels in the sample then occupy
more of the strip than the pitch suggests, by up to 152 pt. Panel height is
therefore measured from where the next panel or section heading actually begins.
Assuming the pitch cropped the bottom off half the contours.

So pages are stacked into a single continuous strip of PDF points, and a panel is
a window into that strip. Rendering one is a crop that may composite two page
canvases, which handles vector convergence plots, raster contours and
page-straddling panels through one path.

Panels match across reports by name, falling back to position. A plot present in
one report and missing from another shows as an explicit gap rather than
silently pairing with the wrong thing.

If Fluent's export ever changes shape, `test/test_indexer.mjs` is what breaks
first. It runs the real indexer over `DP_22.pdf` and checks page geometry,
section detection, the full contour naming grid, the measured pitch, panels that
cross a page break, and the matching fallbacks.

```
npm test
```

## Files

| Path | What |
|---|---|
| `app/index.html` `styles.css` | Shell and the dark theme |
| `app/core.js` | State, document loading, tabs, keyboard, drag and drop |
| `app/indexer.js` | Reads panels out of a report and matches them across reports |
| `app/render.js` | Page and panel rasterisation with a bounded canvas cache |
| `app/pages.js` | Side-by-side page view and the scroll sync |
| `app/panels.js` | One named plot from every report |
| `app/compare.js` | Blend, swipe and difference |
| `app/search.js` `summary.js` | Search, and the numeric comparison table |
| `app/vendor/` | pdf.js, committed so the browser path works from a clone |
| `electron/main.js` `preload.cjs` | Desktop shell, `app://` protocol, native dialog, menu |
| `tools/vendor-pdfjs.mjs` | Refresh the vendored pdf.js after an upgrade |
| `tools/make-test-variant.mjs` | Perturbed copy of the sample, so the diff has something to find |

## Notes

The app uses ES modules, unlike the composites app in `03 Work Orders/`, which
uses classic scripts sharing global scope. pdf.js forces it.

Only one report exists so far, `DP_22.pdf`. Testing uses it against itself, where
the difference must be exactly blank, and against a Ghostscript-perturbed copy
that re-encodes the contour images while leaving the text layer alone. Real
report-to-report variation stays unverified until a second design point lands,
and panel matching is the part most likely to need adjusting when it does.

The dark chrome and neutral grey canvas are not decoration. Contour plots are
vivid rainbow images and a bright white surround shifts how those colour scales
read, which is why ParaView, EnSight and Fluent all do the same thing.
