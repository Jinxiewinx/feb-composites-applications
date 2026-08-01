# FEB Composites, hosted app

Live at https://feb-composites.web.app. It's a tabbed workspace for everything
composites tracks over a season, not just work orders. Everyone signs in with
email and password, and the Firestore database is shared, updating live for the
whole team. Set your photo by clicking your avatar at top right.

## The tabs

Dashboard collects your open items, team deadlines in the next two weeks,
anything behind schedule, watched projects with new activity, and the budget at a
glance. It's read-only, and every row links into the tab it came from.

Work Orders is the manufacturing traveler: layup stack, BOM, step buy-offs
stamped with who signed them, blocker enforcement, and a printable hand-fillable
sheet.

Parts is last season's Part Tracker reborn. Each part carries three parallel
progress stages (CAD, Mold, Layup) plus subteam, layup type and schedule,
engineers, target weight, and a layup deadline.

Above 900px it is a split: an index of every part down the left, the selected
part beside it. Opening a part no longer destroys the list and going back no
longer destroys the part, so you can work down your own parts without the page
swapping under you — `↑`/`↓` or `j`/`k` walk the index, `1`/`2`/`3` advance CAD,
Mold and Layup on whatever is open, `/` searches and `esc` clears. With nothing
selected the right pane is the season instead: how the open parts are spread
across the three stages, and who owns what is behind. Below 900px it collapses to
the older shape — the index is the page, tapping opens the part, back returns.

Each stage is a row of its own enum, and you set it by clicking the step you
want. There is no edit mode for progress, because advancing a stage is the thing
people do most and it used to cost five interactions. Moving forward one step
writes immediately and leaves an undo; moving backwards, declaring a part flat,
or skipping steps asks first and names what it would skip — this is a live shared
database, so the surprising directions are the ones that get a confirmation.

A stage that hasn't started reads grey, never amber. That sounds obvious, but it
was wrong for the whole of SN5: `"N/A (Flat)"` occupies slot 0 of the mold enum,
so `"Not Started"` sat at index 1 and coloured itself as in-progress. Progress
colour is derived from what a value *means* now, never from where it sits in an
array.

Projects is a jira-style tracker for non-part work such as R&D, process fixes and
outreach. Create from a modal with assignee and related-part pickers and a due
date, then drag cards across a Backlog/Active/Blocked/Done board or use list
view. Each project gets its own page with assignees, watchers who get flagged on
new activity, a files section for photos and docs, and a comment thread with rich
text and image attachments.

Timeline is the production schedule as a station by week grid. Assign a part to a
station for a given week.

Budget runs purchase requests through Submitted, Ordered and Reimbursed, with the
season total, an open-orders subtotal, and a flag on anything over $50.

People is the team roster with photos, roles, and each person's live assignments
across parts, projects and work orders. Leads can set roles.

Documents bundles in every reference doc. The 25 manufacturer datasheets and our
CS standards and pain-points all open as PDFs in-app, with the standards rendered
from markdown by pandoc and the .docx still downloadable, plus the shop
printables. Anyone can upload a doc.

Reports does per-dataset CSV export for parts, work orders, projects and budget,
plus a one-click printable Monday-meeting status board.

Cross-links are everywhere: click a chip to jump to the related record. A part's
layup stack and its linked work order's stack stay in sync, so edit either one.

Press ⌘K (Ctrl-K) anywhere for global search. The bell collects @mentions, typed
as `@name` in a project comment, along with project assignments, and shows an
unread count. That's in-app only; email would be a later Cloud Function.

It has a light and a dark theme. It follows your system setting on first load and
you can flip it with the sun/moon button in the header (the ⋯ menu on a phone);
the choice is remembered. The look is FEB's own: the blue-and-gold speed-slash
mark, a navy sidebar, crisp line icons throughout, and the Saira display face on
headings. Printing always comes out black-on-white regardless of theme.

It works on phones and tablets. The blue sidebar folds into a slide-in drawer
behind the ☰ button, and at that same width the account and lead actions (Backup,
Restore, Roster, Sign out) move into a ⋯ menu next to search and the bell. The
wide list tables (work orders, parts, budget, tickets) turn into one card per
row with labeled fields, so nothing runs off the edge; narrow detail tables
scroll sideways instead, and the timeline pins its week column while the
stations scroll. The tickets board stacks its six status columns into full-width
sections. Form controls render at 16px so iOS doesn't zoom on focus, and every
control grows to a 40px tap target on a touch screen, checkboxes to 24px in a
44px row.

On a wide screen the content runs to 1600px rather than the 1180px it used to,
which on a 1920 monitor was leaving 27% of the window empty on every tab. Past
1500px the card grids add a column instead of stretching the ones they have,
and the Parts index rail grows with the window up to 420px. It is still a cap
and not the full width: past about 1600 a table row gets long enough that the
eye loses which row it is reading.

The old single-file `../work-orders.html` stays as the offline backup and archive
viewer, since it still opens any exported JSON anywhere, forever. Don't delete
it.

## How access works

Anyone can create an account at the login page, but a new account can't see or
touch anything until a lead adds their email to the roster using the Roster
button in the header. This is enforced server-side by `../firestore.rules`, not
just by hidden buttons.

There are two roles. A `member` does all day-to-day work across every tab. A
`lead` can also delete records, restore from a backup file, load the SN5 archive
and manage the roster.

When someone leaves the team, remove them from the roster. Their account keeps
existing but stops working.

Firebase Auth handles passwords, including hashing and reset emails. We never see
or store them, and "Forgot password" on the login page works on its own.

## What a buy-off is, and isn't

A work-order buy-off records who was signed in when the button was clicked: name,
email and timestamp. That's much better than typed initials, but be honest about
the limits, and the same applies to every record in every tab. Nothing here is
tamper-proof. Any roster member can edit any record, and there's no version
history inside the app, so the monthly backup files in Drive are the audit trail.

Two mitigations are built in. Edits save per-field, so someone editing a BOM
can't clobber a buy-off saved at the same moment; the remaining race is two
people editing the same field of the same record at once, which is
last-write-wins. And "Reset steps", the one button that erases buy-offs
wholesale, is lead-only in the UI and warns before firing. That one is a UI
restriction rather than a server rule, since the field itself stays writable by
any member, the same category as Restore and Load archive.

If a record ever looks wrong, that's a conversation, not a software bug.
Composites is a dozen-ish people who see each other twice a week.

The rules do genuinely enforce roster membership for everything, lead-only
deletes, lead-only roster changes, roster self-edits limited to avatar and name
so you can't promote yourself, and increment-only id counters.

## Files, photos, and watchers

Uploads (avatars, project files, comment images) live in Firebase Storage, which
requires the project to be on the Blaze plan. Google changed Storage's rules in
February 2026 and now a card is required even to use the free allowance. We set a
Cloud Billing budget cap so it can't surprise-bill, and real usage is a rounding
error against the free tier. Images are downscaled in the browser before upload,
so a phone photo lands at around 150 KB instead of 4 MB.

Comment rich text is sanitized with DOMPurify before it's stored and again before
it's shown, so pasted scripts and handlers can't run for other viewers.

Watcher "new activity" is per-browser. It's tracked in your browser's local
storage, so the unread dot reflects when you last opened this on *this* device.
It isn't synced across devices and it isn't an email. Real email notifications
are a possible follow-on now that Storage put us on Blaze, via a Cloud Function,
but they aren't built.

## One-time project setup

Already done for `feb-composites`. These steps are here for the next person who
has to stand it up again or move it to a team account, and take about 20 minutes.

Use a team Google account if at all possible, or add the next lead as an owner
the day you set it up. The failure mode to avoid is the Firebase project living
in a graduated senior's personal account.

1. At [console.firebase.google.com](https://console.firebase.google.com), Add
   project. Skip Analytics.
2. Build, then Authentication, Get started, Sign-in method, enable
   Email/Password.
3. Build, then Firestore Database, Create database, production mode, region
   `us-west1` or whatever's closest.
3b. Upgrade to the Blaze plan, needed for file and photo uploads: console, gear
   icon, Usage and billing, Modify plan, Blaze, add a card. Then cap it at
   [console.cloud.google.com](https://console.cloud.google.com), Billing,
   Budgets & alerts, Create budget of $1 to $5 with alerts at 50/90/100%. Then
   Build, Storage, Get started with the default rules, which `firebase deploy`
   overwrites with `storage.rules`. The free Storage allowance of 5 GB and 1
   GB/day egress dwarfs our usage, but the budget alert means it can never
   surprise-bill.
3c. Give the bucket a CORS rule, once, from `03 App/`:

   ```
   gcloud storage buckets update gs://feb-composites.firebasestorage.app --cors-file=cors.json
   ```

   **`firebase deploy` does not do this** — it pushes hosting and rules, and CORS
   is bucket configuration, so a deploy alone will not fix it. Without the rule
   the Stock tab's 3D view shows the stock blocks with no mold inside them: the
   browser blocks the `fetch()` of the stored mesh before it is even sent.
   Nothing else in the app notices, because every other Storage URL here is used
   by `<img src>` or `<a href>`, and those need no CORS at all. If you see blocks
   and no mold, the viewer now says so underneath itself — that message is the
   one to act on.
4. Project settings, Your apps, the `</>` web option, register an app, then copy
   the config values into `firebase-config.js` here, replacing the demo values.
   Watch the variable name: the console hands you `const firebaseConfig = {…}`,
   but this app reads `window.FIREBASE_CONFIG`, so the line must start with
   `window.FIREBASE_CONFIG =`. If you see a "Not configured" screen, that's what
   happened. These values aren't secrets; the rules are the security.
5. On your laptop, `npm install -g firebase-tools`, then `firebase login`.
6. In `../`, the folder with `firebase.json`, set the project id in `.firebaserc`
   and run `firebase deploy`. That pushes both the rules and the site, to
   `https://<project-id>.web.app`.
7. Bootstrap the first lead. The roster starts empty and only leads can edit it,
   so it's chicken and egg: open the app, create your account, then in the
   Firebase console go to Firestore, Start collection, id `roster`, doc id set to
   your email exactly as you signed up in lowercase, with fields `name` (string)
   and `role` (string) set to `lead`. Hit "Check again" in the app.
8. Load SN5 archive from the header to bring in the retro work orders, parts and
   last season's timeline. Add the rest of the team to the roster and drop the
   link in #composites.

## Day-to-day

Nothing to run. Edits save automatically and show up live for everyone. If the
shop wifi drops, keep working, because writes queue locally and sync when it's
back. Two habits are worth keeping.

Back up monthly, using Backup in the header, into the team Drive. Firestore is
reliable, but a plain JSON file in Drive is the backup nobody can lock us out of.
Restore, which is lead-only, reads that file back.

Clean up the roster at handoff. The incoming lead gets `lead`, departed members
come off the list, and the new lead gets added as a project owner in the Firebase
console under Project settings, Users and permissions.

## Cost

On Blaze but effectively free. Firestore gives 50k reads and 20k writes per day
with 1 GB stored, and Storage gives 5 GB plus 1 GB/day egress. A heavy build day
is a few thousand reads, a few hundred writes, and a handful of photos. The
budget cap from setup step 3b is the safety net. The card is only there because
Storage requires it, and nothing here approaches paid usage.

## Local development and testing

Everything runs offline against the Firebase emulators, which need Java 11+ and
`firebase-tools`:

```
cd "03 App"
firebase emulators:start --project demo-feb-work-orders
# app on http://localhost:5050, emulator UI on http://localhost:4000
# (5050 not 5000 because macOS AirPlay squats on 5000)
```

The real values shipped in `firebase-config.js` auto-route to the emulators on
localhost, so you develop without touching production data. Emulator accounts and
data are throwaway. Create the bootstrap roster doc in the emulator UI's
Firestore tab, the same as step 7 above.

Tests, from `SN6 Resources/`:

```
node tools/test_app.mjs           # app logic across all tabs (DOM stub + fake backend)
node tools/test_designsystem.mjs  # app CSS vs 06 Design System, no browser
node tools/test_appui.mjs         # layout on 11 tabs x 4 widths x 2 themes
node tools/test_safearea.mjs      # notch / Dynamic Island / home indicator
node tools/shoot_ui.mjs --out .ui-shots --tab all   # PNGs of every tab
node tools/shoot_ui.mjs --out .ui-shots --inset portrait   # ...with a simulated island
cd "03 App" && firebase emulators:exec --only firestore \
  --project demo-feb-work-orders "node '../tools/test_wo_rules.mjs'"
```

`test_designsystem.mjs` is the one that keeps this stylesheet honest. `06 Design
System/` was extracted from it rather than imported by it, so there are two
copies of the same design and nothing but this test holding them together. It
compares every token in all three theme blocks and the look of every shared
component rule, and it fails on a hardcoded value that a token already spells.
It also checks the CSS parses, which sounds pointless until an unterminated
comment silently eats the next rule and the fix you just made does nothing.

`test_appui.mjs` measures what a screenshot can only show: nothing runs off the
side, no tap target is under 40px where there is a thumb, no text drops below
11px, nothing sticky hides behind the topbar, every surface actually changes
colour between light and dark, and `main` is using the window it was given.
960 checks, because eleven tabs at four widths in two themes is the only way a
check on Parts also covers Weekly Plan.

`shoot_ui.mjs` is a camera, not a test — it asserts nothing. It boots the real
app with `fb.js` stubbed at the route, the SN5 archives seeded and
`tools/lib/fixtures.mjs` filling in the four collections that have no archive,
then writes `<label>-<state>-<width>-<theme>.png` at 1920, 1440, 900 and 393 in
both themes. `--tab all` sweeps every tab, list state only; naming one tab
gives you list, list-with-completed, detail and detail-in-edit for it. It
resolves the app relative to itself rather than the cwd, so running it inside a
git worktree photographs that worktree — which is how four competing Parts
designs were shot under identical conditions and compared frame for frame.

Without `tools/lib/fixtures.mjs` five of the eleven tabs photograph as empty
states, because `loadArchive()` only seeds work orders, parts, schedule and
stock. An empty tab is the one state a density audit learns nothing from.

**Two rules for anything new that touches a screen edge**, because the app draws
under the status bar deliberately (`viewport-fit=cover`, standalone PWA,
translucent status bar — that is what lets the topbar meet the Dynamic Island
instead of sitting under a white letterbox):

1. Use the `--sa-t` / `--sa-r` / `--sa-b` / `--sa-l` tokens, never `env()`
   directly. The indirection is what lets `test_safearea.mjs` simulate a phone.
   Insets belong on the base rule, not inside a `max-width` block: a landscape
   Pro Max is 932px, so it takes the desktop rules and still has an island.
2. Anything sticky under the topbar offsets from `--topbar-h`, never a pixel
   count. The topbar's height depends on the top inset, so `top: 62px` is right
   on a laptop and puts the element *behind* the bar on a phone.

Read the images with `.claude/agents/ui-reviewer.md`, a read-only reviewer that
scores a screen 0–5 on eight axes (scan speed, signal-to-ink, colour semantics,
interaction cost, wayfinding, hierarchy, responsive integrity, house fidelity)
and passes only at no-axis-below-3 and average ≥4 — the same bar as the `simon`
reviewer in `00 Agent/`. Worth running before any UI change lands: the string
assertions in `test_app.mjs` will happily pass a screen that draws every fact
twice, and did.

The second proves the rules actually enforce access: non-roster users are
rejected, members can CRUD every collection but can't delete or touch the roster,
a member can set their own avatar and name but not their role or someone else's,
leads can, and id counters are increment-only.

If you add a new app file, add it to the `FILES` list in `tools/test_app.mjs` as
well as to `index.html`, or the harness silently won't see it.

`storage.rules` covers avatar owner-scoping, a content-type allowlist and size
cap for project and document uploads, and denies everything else. Its
deny-critical smoke suite is `tools/test_storage_rules.mjs`, run under `firebase
emulators:exec --only auth,storage`, and it proves sign-in is required and that
writes outside the allowed path trees are denied. The allow-path cases gate on
`contentType`, which the emulator's simple-upload REST endpoint doesn't set, so
those run through the app's Firebase SDK, which does set it, and are verified by
hand.

Regenerate bundled data when the sources change:

- `python3 tools/gen_sn5_seeds.py` rebuilds the SN5 parts and timeline seed JSON.
- `node tools/gen_sample_molds.mjs` rebuilds the three sample molds in `samples/`.
- `python3 tools/gen_docs_manifest.py` copies the datasheets, standards and
  printables into `app/docs/` and rebuilds `docs/manifest.json` for the Documents
  tab. Re-run it whenever a datasheet or CS standard changes.

## Files

| File | What |
|---|---|
| `index.html` | Markup and all screen CSS (sidebar, board, modal, avatars, pickers, doc viewer) plus script includes |
| `vendor/purify.min.js` | DOMPurify 3.2.4, self-hosted with an SRI pin. Was a CDN load, which meant rich text silently fell back to plain text whenever the shop wifi dropped |
| `stlio.js` | Writes binary STL and shrinks a mesh to fit storage. Serves both the stock export and the stored viewer mesh; the slicer's own `parseSTL` reads back what it writes |
| `samples/*.stl` | Three sample molds offered in the "Plan a mold" modal, so the planner can be tried without exporting anything from Fusion first. Built by `tools/gen_sample_molds.mjs`; fetched on demand, not at page load |
| `meshview.js` | The rotatable 3D mold-in-stock view. Hand-rolled WebGL, no dependency: pure camera maths tested under node, thin GL glue that only runs in a browser |
| `drawings.js` | The printable engineering drawing set for a stack plan: general isometric, a third-angle three-view, then one dimensioned sheet per layer showing how far in from each edge of the board below it goes. The mold under the blocks is a silhouette traced off the stored STL. Pure string-building, so the whole set is asserted under node |
| `core.js` | Shell: sidebar and topbar, tab router, auth and roster, modal system, avatars, HTML sanitizer, multi-select picker, shared store |
| `workorders.js` `parts.js` `projects.js` `timeline.js` `budget.js` `dashboard.js` `documents.js` | One tab each; they reach Firebase only through core's `save()` and `del()` and `fb.*` |
| `print.js` `print.css` | The printed work-order traveler. Styles are deliberately outside `@media print` so the sheet can be previewed and reviewed on screen |
| `fb.js` | The only file that imports Firebase (auth, per-collection sync, writes, file upload) |
| `firebase-config.js` | Project config, as `window.FIREBASE_CONFIG` |
| `docs/` | Bundled reference docs and the generated `manifest.json` |
| `sn5-work-orders.json` `sn5-parts.json` `sn5-schedule.json` `sn5-stock.json` | Retro SN5 archives, the seeds for "Load SN5 archive". The stock one is the board rack SN5 left behind — the stack planner picks thicknesses from what you own, so on a fresh project it has nothing to plan against until this is loaded |
| `../firestore.rules` | Server-side access control, the actual security |
| `../storage.rules` | File-upload access control |
| `../firebase.json`, `../.firebaserc` | Hosting, rules and emulator config |
