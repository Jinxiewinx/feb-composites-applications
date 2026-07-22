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

Projects is a jira-style tracker for non-part work such as R&D, process fixes and
outreach. Create from a modal with assignee and related-part pickers and a due
date, then drag cards across a Backlog/Active/Blocked/Done board or use list
view. Each project gets its own page with assignees, watchers who get flagged on
new activity, a files section for photos and docs, and a comment thread with rich
text and image attachments.

Timeline is the production schedule as a station by week grid. Assign a part to a
station for a given week.

Calendar is a month grid overlaying every part, project and work-order deadline
plus timeline milestones. Click an item to jump to it.

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
cd "03 Work Orders"
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
cd "03 Work Orders" && firebase emulators:exec --only firestore \
  --project demo-feb-work-orders "node '../tools/test_wo_rules.mjs'"
```

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
- `python3 tools/gen_docs_manifest.py` copies the datasheets, standards and
  printables into `app/docs/` and rebuilds `docs/manifest.json` for the Documents
  tab. Re-run it whenever a datasheet or CS standard changes.

## Files

| File | What |
|---|---|
| `index.html` | Markup and all screen CSS (sidebar, board, modal, avatars, pickers, doc viewer) plus script includes; loads DOMPurify from CDN |
| `core.js` | Shell: sidebar and topbar, tab router, auth and roster, modal system, avatars, HTML sanitizer, multi-select picker, shared store |
| `workorders.js` `parts.js` `projects.js` `timeline.js` `budget.js` `dashboard.js` `documents.js` | One tab each; they reach Firebase only through core's `save()` and `del()` and `fb.*` |
| `print.js` `print.css` | The printed work-order traveler. Styles are deliberately outside `@media print` so the sheet can be previewed and reviewed on screen |
| `fb.js` | The only file that imports Firebase (auth, per-collection sync, writes, file upload) |
| `firebase-config.js` | Project config, as `window.FIREBASE_CONFIG` |
| `docs/` | Bundled reference docs and the generated `manifest.json` |
| `sn5-work-orders.json` `sn5-parts.json` `sn5-schedule.json` | Retro SN5 archives, the seeds for "Load SN5 archive" |
| `../firestore.rules` | Server-side access control, the actual security |
| `../storage.rules` | File-upload access control |
| `../firebase.json`, `../.firebaserc` | Hosting, rules and emulator config |
