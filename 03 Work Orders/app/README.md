# FEB Composites — hosted app

Live at **https://feb-composites.web.app**. A tabbed workspace (left sidebar)
for everything composites tracks over a season, not just work orders. Everyone
signs in with email + password; the database is shared (Firestore) and updates
live for the whole team. Set your photo by clicking your avatar (top right).

## The tabs

- **Dashboard** — your open items, team deadlines in the next two weeks,
  anything behind schedule, watched projects with new activity, and the budget
  at a glance. Read-only; every row links into the tab it came from.
- **Work Orders** — the manufacturing traveler: layup stack, BOM, step
  buy-offs stamped with who signed them, blocker enforcement, printable packet.
- **Parts** — last season's Part Tracker reborn: each part carries three
  parallel progress stages (CAD → Mold → Layup), subteam, layup type/schedule,
  engineers, target weight, and a layup deadline.
- **Projects** — a jira-style tracker for the non-part work (R&D, process fixes,
  outreach). Create from a modal (assignee + related-part pickers, due date);
  drag cards across a Backlog/Active/Blocked/Done board (or use list view); each
  project has its own page with assignees, **watchers** (get flagged on new
  activity), a **files section** (upload photos/docs), and a **comment thread**
  with rich text and image attachments.
- **Timeline** — the production schedule as a station × week grid; assign a
  part to a station for a given week.
- **Calendar** — a month grid overlaying every part / project / work-order
  deadline plus timeline milestones; click an item to jump to it.
- **Budget** — purchase requests through Submitted → Ordered → Reimbursed,
  with the season total, open-orders subtotal, and a >$50 approval flag.
- **People** — the team roster with photos, roles, and each person's live
  assignments (parts, projects, work orders); leads can set roles.
- **Documents** — every reference doc bundled in: the 25 manufacturer
  datasheets and our CS standards + pain-points all open as PDFs in-app (the
  standards are rendered from markdown by pandoc; .docx still downloadable),
  plus the shop printables. **Anyone can upload** a doc (+ Upload document).
- **Reports** — per-dataset CSV export (parts / work orders / projects /
  budget) and a one-click printable Monday-meeting status board.

Cross-links everywhere: click a chip to jump to the related record. A part's
layup stack and its linked work order's stack stay in sync — edit either.

**Global search:** press ⌘K (Ctrl-K) anywhere to jump to any record.
**Notifications:** the 🔔 bell collects @mentions (type `@name` in a project
comment) and project assignments; unread count shows on the bell. (In-app only;
email is a later Cloud Function.)

The old single-file `../work-orders.html` stays as the offline backup / archive
viewer — it still opens any exported JSON anywhere, forever. Don't delete it.

## How access works

- Anyone can create an account at the login page, but a new account can't see
  or touch anything until a **lead adds their email to the roster** (Roster
  button in the header). This is enforced server-side by `../firestore.rules`,
  not just hidden buttons.
- Roles: `member` (all day-to-day work across every tab) and `lead` (also:
  delete records, restore from a backup file, load the SN5 archive, manage the
  roster).
- When someone leaves the team, remove them from the roster. Their account
  keeps existing but stops working.
- Passwords are handled (hashed, reset emails, the works) by Firebase Auth. We
  never see or store them. "Forgot password" on the login page works on its own.

## What a buy-off (and any record) is — and isn't

A work-order buy-off records who was signed in when the button was clicked
(name, email, timestamp). That's much better than typed initials, but be honest
about the limits, and the same applies to every record in every tab: **nothing
here is tamper-proof.** Any roster member can edit any record, and there's no
version history inside the app — the monthly backup files in Drive are the
audit trail. Two mitigations are built in: edits save per-field (so someone
editing a BOM can't clobber a buy-off saved at the same moment — the remaining
race is two people editing the *same* field of the same record at once, which
is last-write-wins), and "Reset steps" — the one button that erases buy-offs
wholesale — is lead-only in the UI and warns before firing (that one is a
UI-only restriction, not a server rule: the field itself stays writable by any
member, same category as Restore/Load-archive). If a record ever looks wrong,
that's a
conversation, not a software bug; composites is a dozen-ish people who see each
other twice a week.

The rules genuinely enforce: roster membership for everything, lead-only
deletes, lead-only roster changes, roster self-edits limited to avatar/name (you
can't promote yourself), and increment-only id counters.

## Files, photos, and watchers

- **Uploads (avatars, project files, comment images)** live in Firebase Storage,
  which requires the project be on the **Blaze plan** (Google changed Storage's
  rules in Feb 2026 — a card is required even to use the free allowance). We set
  a Cloud Billing budget cap so it can't surprise-bill; real usage is a rounding
  error against the free tier. Images are downscaled in the browser before
  upload, so a phone photo lands as ~150 KB, not 4 MB.
- **Comment rich text** is sanitized (DOMPurify) before it's stored and again
  before it's shown — pasted scripts/handlers can't run for other viewers.
- **Watcher "new activity" is per-browser.** It's tracked in your browser's
  local storage, so the unread dot reflects "since you last opened this on *this*
  device," not a synced-across-devices or emailed notification. Real email
  notifications are a possible follow-on now that Storage put us on Blaze
  (a Cloud Function) — not built yet.

## One-time project setup

Already done for `feb-composites`. These steps are here for the next person who
ever has to stand it up again (or move it to a team account). Takes ~20 minutes.
Use a **team Google account** if at all possible, or add the next lead as an
owner the day you set it up — the failure mode to avoid is "the Firebase
project lives in a graduated senior's personal account."

1. [console.firebase.google.com](https://console.firebase.google.com) → Add
   project. Skip Analytics.
2. Build → **Authentication** → Get started → Sign-in method → enable
   **Email/Password**.
3. Build → **Firestore Database** → Create database → production mode, region
   `us-west1` (or whatever's closest).
3b. **Upgrade to the Blaze plan** (needed for file/photo uploads): console →
   ⚙ → Usage and billing → Modify plan → Blaze; add a card. Then **cap it**:
   [console.cloud.google.com](https://console.cloud.google.com) → Billing →
   Budgets & alerts → Create budget ($1–5, alert at 50/90/100%). Build →
   **Storage** → Get started (default rules; `firebase deploy` overwrites them
   with `storage.rules`). The free Storage allowance (5 GB, 1 GB/day egress)
   dwarfs our usage, but the budget alert means it can never surprise-bill.
4. Project settings (gear) → Your apps → **</> (web)** → register an app → copy
   the config values into `firebase-config.js` here, replacing the demo values.
   **Watch the variable name:** the console hands you `const firebaseConfig =
   {…}`, but this app reads `window.FIREBASE_CONFIG` — so the line must start
   with `window.FIREBASE_CONFIG =`, not `const firebaseConfig =`. If you see a
   "Not configured" screen, that's what happened. (These values are not
   secrets — the rules are the security.)
5. On your laptop: `npm install -g firebase-tools`, then `firebase login`.
6. In `../` (the folder with `firebase.json`): set the project id in
   `.firebaserc`, then `firebase deploy`. That pushes the rules **and** the
   site. URL: `https://<project-id>.web.app`.
7. **Bootstrap the first lead** (the roster starts empty, and only leads can
   edit the roster — chicken and egg): open the app, create your account, then
   in the Firebase console → Firestore → Start collection: id `roster`, doc id
   = your email exactly as you signed up (lowercase), fields `name` (string)
   and `role` (string) = `lead`. Hit "Check again" in the app.
8. Load SN5 archive (header button) to bring in the retro work orders, parts,
   and last season's timeline; add the rest of the team to the roster; drop the
   link in #composites.

## Day-to-day

Nothing to run. Edits save automatically and show up live for everyone. If the
shop wifi drops, keep working — writes queue locally and sync when it's back.
Two habits worth keeping:

- **Back up monthly** (header → Backup) into the team Drive. Firestore is
  reliable, but a plain JSON file in Drive is the backup nobody can lock us out
  of. "Restore" (lead-only) reads that file back.
- **Roster cleanup at handoff**: incoming lead gets `lead`, departed members
  come off the list, and the new lead gets added as a project owner in the
  Firebase console (Project settings → Users and permissions).

## Cost

On Blaze but effectively free: Firestore gives 50k reads / 20k writes per day
and 1 GB stored; Storage gives 5 GB + 1 GB/day egress. A heavy build day is a
few thousand reads, a few hundred writes, and a handful of photos. The budget
cap (setup step 3b) is the safety net. The card is only there because Storage
requires it — nothing here approaches paid usage.

## Local development / testing

Everything runs offline against the Firebase emulators (needs Java 11+ and
`firebase-tools`):

```
cd "03 Work Orders"
firebase emulators:start --project demo-feb-work-orders
# app on http://localhost:5050, emulator UI on http://localhost:4000
# (5050 not 5000 because macOS AirPlay squats on 5000)
```

The shipped `firebase-config.js` real values still auto-route to the emulators
on localhost, so you develop without touching production data. Emulator
accounts and data are throwaway. Create the bootstrap roster doc in the
emulator UI (Firestore tab) same as step 7 above.

Tests, from `SN6 Resources/`:

```
node tools/test_app.mjs           # app logic across all tabs (DOM stub + fake backend)
cd "03 Work Orders" && firebase emulators:exec --only firestore \
  --project demo-feb-work-orders "node '../tools/test_wo_rules.mjs'"
```

The second proves the rules actually enforce access (non-roster users rejected;
members can CRUD every collection but can't delete or touch the roster; a member
can set their own avatar/name but not their role or someone else's; leads can;
id counters are increment-only).

`storage.rules` (avatar owner-scoping; project + document content-type allowlist
+ size cap; everything else denied) has a deny-critical smoke suite:
`tools/test_storage_rules.mjs` (run under `firebase emulators:exec --only
auth,storage`) proves sign-in is required and writes outside the allowed path
trees are denied. The allow-path cases gate on `contentType`, which the
emulator's simple-upload REST endpoint doesn't set — those run through the app's
Firebase SDK (which does set it) and are verified manually.

Regenerate bundled data when the sources change:
- `python3 tools/gen_sn5_seeds.py` — SN5 parts + timeline seed JSON.
- `python3 tools/gen_docs_manifest.py` — copies the datasheets / standards /
  printables into `app/docs/` and rebuilds `docs/manifest.json` for the
  Documents tab. Re-run whenever a datasheet or CS standard changes.

## Files

| File | What |
|---|---|
| `index.html` | Markup + all CSS (sidebar, board, modal, avatars, pickers, doc viewer, print) + script includes; loads DOMPurify (CDN) |
| `core.js` | Shell: sidebar/topbar, tab router, auth/roster, modal system, avatars, HTML sanitizer, multi-select picker, shared store |
| `workorders.js` `parts.js` `projects.js` `timeline.js` `budget.js` `dashboard.js` `documents.js` | One tab each; talk to Firebase only through core's `save()`/`del()`/`fb.*` |
| `fb.js` | The only file that imports Firebase (auth, per-collection sync, writes, file upload) |
| `firebase-config.js` | Project config — `window.FIREBASE_CONFIG` |
| `docs/` | Bundled reference docs + `manifest.json` (generated) |
| `../storage.rules` | File-upload access control |
| `sn5-work-orders.json` `sn5-parts.json` `sn5-schedule.json` | Retro SN5 archives (seeds for "Load SN5 archive") |
| `../firestore.rules` | Server-side access control — the actual security |
| `../firebase.json`, `../.firebaserc` | Hosting/rules/emulator config |
