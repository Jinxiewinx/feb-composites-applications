# FEB Composites App

> This folder is named "03 Work Orders" for historical reasons. It started as
> just the work-order tool and now holds the whole composites app, of which work
> orders are one tab. The name is kept so deploy paths don't move.

Two versions live here.

`app/` is the hosted, multi-user app, live at https://feb-composites.web.app.
Everyone signs in with email and password, and a shared Firestore database on the
free tier backs six tabs (Dashboard, Work Orders, Parts, Projects, Timeline,
Budget) that update live for the whole team. This is the day-to-day tool. Setup,
deploy and the data model are in `app/README.md`.

`work-orders.html` is the original single-file work-order tool. No server, no
account, and data lives in that browser's localStorage. It's kept as the offline
backup and archive viewer, since it opens any exported work-order JSON anywhere,
forever. It is not the team record. Don't run both as sources of truth.

## What the app does

The list view shows every work order with status and subteam filters plus search.
This is the Monday-meeting part board (CS-013 §7.4).

New Work Order pre-fills the standard step list for the chosen process type
(infusion, wet layup, and so on), including blocker steps like stack freeze, mold
design review and drop test, which hold up later buy-offs until they're signed.

The detail view carries overview fields, the mold record with its live `location`
field (update it every time a mold moves), a layup-stack table with a visual,
BOM, steps with buy-offs, quality checks with pass/fail, timeline and notes.

Printing a work order produces a hand-fillable shop traveler: ruled boxes for
every field, an initial-and-date cell on each step, and blank rows so plies,
steps and BOM lines can be added at the bench. Print blank traveler gives empty
forms with the standard step list already on them. Both are built for a
black-and-white laser.

The sheet is capped at two pages. `print.js` renders it, measures the result, and
walks down a ladder of progressively tighter layouts until it fits, so the
writing space flexes with how full the work order is instead of the page count
flexing. `tools/print-preview.html` has an Audit all button that runs every seed
work order and every blank form through that loop and reports the page counts,
which is how the cap gets verified after a layout change.

Load SN5 archive seeds the retro SN5 data: 26 work orders, 33 parts from the
Master Tracker, and last season's production timeline. Everything is marked
`retro`, and unverifiable fields are left blank or say "not recorded (retro)" by
design. They're honest references, not fabricated exemplars. The single-file
version loads only the 26 work orders.

The hosted version alone has accounts and a roster allowlist (the lead controls
who's in), roles, live multi-user sync, shared numbering, and buy-offs that
record the name, email and timestamp of the signed-in member. In the offline
version, buy-offs are typed initials and data stays in that one browser.

One honest caveat on hosted buy-offs: they record identity, but they aren't
tamper-proof. Any roster member can edit any work order, and the JSON exports in
Drive are the only version history. Details and mitigations are in
`app/README.md` under "What a buy-off is, and isn't".

## Data: where it actually lives

For the hosted app, Firestore is the record. Still export JSON monthly into the
season's Drive folder, because a plain file in Drive is the backup nobody can
lock us out of.

For the single-file version, localStorage is a cache, not a record. Clearing
browser data, switching browsers or switching computers loses it, so export JSON
weekly if you're actually working out of it (CS-013 §7.4). Import JSON merges a
file back in, overwriting same-ID records and adding new ones.

`data/sn5-work-orders.json` is the standalone copy of the SN5 archive. The hosted
app's copy is `app/sn5-work-orders.json`. Keep them in sync if either changes.

## JSON schema (one work order)

```
{
  id: "WO-SN6-001",            partName, subteam, revision: "A",
  status: Draft|Released|InWork|Complete|OnHold,
  processType: MoldInfusion|GlassInfusion|MoldWetLay|FoamWrapped|Other,
  moldEngineer, manufacturingEngineer, createdDate, dueDate,
  mold: { moldId, layers, density, sealingType, location } | null,
  layupStack: [ { material, orientation, coverage, notes } ],
  stackNote, bom: [ { item, qty, unit, source, estCost } ],
  standardsRefs: [ "CS-004", ... ],
  steps: [ { seq, title, csRef, status, buyoff:{name,date,...}, notes, photoRefs:[{caption,filename}] } ],
  qualityChecks: [ { criterion, target, actual, pass } ],
  weightTargetG, weightActualG,
  timeline: [ { date, note } ],
  notes, retro: false
}
```

Hosted buy-offs add `email`, `uid` and `time` to `buyoff`, and the app stamps
`updatedAt` and `updatedBy` on each record. Photos are references, meaning
filenames and captions. Put the actual photos in the part's Drive folder and
write the filename on the step.

## Conventions

- IDs are `WO-SN6-###`, auto-assigned. The hosted app draws from a shared counter so two laptops can't mint the same number. Never reuse one.
- A deviation from a frozen spec means bumping `revision`, so it stays visible and counted (CS-013 §7.2).
- Small cross-team jobs get work orders too, using `processType: Other`. See WO-SN5-026 (catch can) for why.
- The governing standard is CS-013, Work Orders and Part Traceability.

## Testing

From `SN6 Resources/`, run `node tools/test_app.mjs` for app logic across all
tabs, which needs no Firebase. The rules suite is described in `app/README.md`
and needs the Firebase emulator.

## Future ideas (deliberately not built, keep this tool boring)

Photo storage, dashboards and charts, Slack integration. Multi-user sync,
accounts and shared numbering graduated off this list in July 2026 and live in
`app/`. If something else becomes necessary, revisit it, but most of this tool's
value is that it stays boring and keeps working.
