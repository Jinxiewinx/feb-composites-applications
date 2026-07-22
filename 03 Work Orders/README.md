# FEB Composites App

> This folder is named "03 Work Orders" for historical reasons — it started as
> just the work-order tool. It now holds the whole composites app (work orders
> are one tab of six). The folder name is kept so deploy paths don't move.

Two versions live here:

- **`app/` — the hosted, multi-user app. Live at https://feb-composites.web.app.**
  Everyone signs in with email + password; a shared cloud database (Firestore,
  free tier) backs six tabs — **Dashboard, Work Orders, Parts, Projects,
  Timeline, Budget** — that update live for the whole team. This is the
  day-to-day tool. Setup, deploy, and the data model are in `app/README.md`.
- **`work-orders.html` — the original single-file work-order tool.** No server,
  no account; data lives in that browser's localStorage. Kept as the offline
  backup and archive viewer (it opens any exported work-order JSON anywhere,
  forever). It is not the team record — don't run both as sources of truth.

## What the app does (both versions)

- **List view** of every work order with status/subteam filters and search — this is the Monday-meeting part board (CS-013 §7.4).
- **New Work Order** pre-fills the standard step list for the chosen process type (infusion, wet layup, etc.), with **blocker steps** (stack freeze, mold design review, drop test) that hold up later buy-offs until they're signed.
- **Detail view**: overview fields, mold record (with the live `location` field — update it every time a mold moves), layup-stack table with a visual, BOM, steps with buy-offs, quality checks with pass/fail, timeline, notes.
- **Print** any work order — the print stylesheet produces a clean shop-floor packet with signature lines. Keep it with the part.
- **Load SN5 archive** (hosted app) — seeds the retro SN5 data: 26 work orders,
  33 parts (the Master Tracker Part Tracker), and last season's production
  timeline. Everything's marked `retro`; unverifiable fields are left blank or
  say "not recorded (retro)" by design — honest references, not fabricated
  exemplars. The single-file version loads only the 26 work orders.

Hosted-only: the full six-tab app (see `app/README.md`), accounts + roster
allowlist (lead controls who's in), roles (lead/member), live multi-user sync,
shared numbering, buy-offs recording name + email + timestamp of the signed-in
member. Offline-only differences: work orders only, buy-offs are typed
initials, and data stays in that one browser.

One honest caveat on hosted buy-offs: they record identity, but they're not
tamper-proof — any roster member can edit any WO, and the JSON exports in
Drive are the only version history. Details and mitigations in
`app/README.md` ("What a buy-off is — and isn't").

## Data: where it actually lives

**Hosted app:** Firestore is the record. Still **Export JSON monthly** into the
season's Drive folder — a plain file in Drive is the backup nobody can lock us
out of.

**Single-file version:** localStorage is a cache, not a record. Clearing
browser data, switching browsers, or switching computers loses it — Export
JSON weekly if you're actually working out of it (CS-013 §7.4). Import JSON
merges a file back in (same-ID records overwritten, new ones added).

`data/sn5-work-orders.json` is the standalone copy of the SN5 archive (the
hosted app's copy is `app/sn5-work-orders.json` — keep them in sync if either
ever changes).

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

Hosted buy-offs add `email`, `uid`, `time` to `buyoff`, and the app stamps
`updatedAt`/`updatedBy` on each record. Photos are **references**
(filenames/captions) — put the actual photos in the part's Drive folder and
write the filename on the step.

## Conventions

- IDs: `WO-SN6-###` auto-assigned (hosted: from a shared counter, so two laptops can't mint the same number); never reuse.
- A deviation from a frozen spec = bump `revision` (visible, counted — CS-013 §7.2).
- Small cross-team jobs get WOs too (`processType: Other`) — see WO-SN5-026 (catch can) for why.
- Governing standard: **CS-013 Work Orders & Part Traceability**.

## Testing

From `SN6 Resources/`: `node tools/test_app.mjs` (app logic across all tabs, no
Firebase needed) and the rules suite in `app/README.md` (needs the Firebase
emulator).

## Future ideas (deliberately NOT built — keep this tool boring)

Photo storage, dashboards/charts, Slack integration. Multi-user sync, accounts,
and shared numbering graduated off this list in July 2026 and live in `app/`.
If something else becomes genuinely necessary, revisit — but most of the tool's
value is that it stays boring and keeps working.
