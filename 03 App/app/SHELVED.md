# Shelved: the project tracker

What is paused, why, what is still here, and exactly how to bring it back.

Shelved 2026-08-25, in **v1.0.0**. The last commit where the Tickets tab was
live in the sidebar is the one before `d96c1c6`.

---

## What was shelved

The **Tickets** tab — the project-tracking half of the `projects` collection.

The tab held two kinds of record behind one `kind` field:

- **Project** tickets (`kind` absent or `"project"`) — R&D tasks, process fixes,
  outreach. This is the half that is paused.
- **Issue** tickets (`kind: "issue"`) — a nonconformance on a run, carrying a
  required `workOrderId`, a CS-003 disposition and a "what happened". **This
  half is not shelved.** It moved to the work order it holds up.

## Why

The team decided to stop running projects out of the app. The app tracks the
work of building the car — parts, runs, molds, inventory, the schedule — and a
second, parallel task tracker was one more place to keep current. What the shop
actually needed from Tickets was the issue: the thing that stops a run from
closing. So the issue went where the run is, and the rest went quiet.

## What is still here

**Everything.** Nothing was deleted.

- **The data.** Every `PROJ-SN6-###` document is untouched in Firestore,
  including project tickets, their sub-tickets, comments, files and history.
  `firestore.rules` is unchanged — the roster can still read and write them.
- **The code.** `projects.js` is intact and still loaded: the rail, the kanban
  board, the detail page, the create/edit modals, the sub-ticket machinery.
- **The links.** The TABS row keeps `coll: "projects"`, so `#/PROJ-SN6-014`
  still opens the record, `chip("projects", …)` from a work order still
  navigates, `PROJ` is still in `ID_TO_COLL`, and stored notifications still
  resolve. **The tab renders; it is only unlisted.**

## What changed around it

| Where | Change |
|---|---|
| `core.js` TABS | `hidden: true` on the `projects` row |
| `core.js` sidebar | the unread pip had no row left to sit on |
| `core.js` search | ⌘K indexes issues only |
| `dashboard.js` | deadlines, feed and watched list are issues only; the "My tickets" tile is now "Open issues" |
| `reports.js` | the CSV export is `issues`, and carries `workOrderId` + `resolutionMethod` |
| `people.js` | the assignment column lists open issues |
| `weeklyplan.js` | auto rows and the goal picker offer issues only |
| `workorders.js` | a new `issues` section, `openWOIssue()` to raise one, `view.woIssues` to filter the rail |

Old `goal.ticketId` and `week.doneTickets[]` entries in the `schedule`
collection that name a shelved project simply stop matching a rendered row.
They are dead, harmless, and correct again the moment the tab returns.

## The one trap

The `projects` row is **not** the same kind of hidden row as `stock`, `items`,
`lots` and `weekplan`, which sit right below it in `TABS`.

Those four are **aliases**: hidden *and* normalised away in `render()`, so their
own `render` never runs — they exist only to keep old links resolving.

`projects` is hidden **but still renders itself**, because the issue detail page
lives on it. If someone "tidies up" by adding

```js
if (view.tab === "projects") view.tab = "workorders";   // DO NOT
```

to `render()`, every link to every issue dies silently. The comment on the TABS
row says this; this file says it twice.

## Bringing it back

1. Delete `hidden: true` from the `projects` row in `core.js` and restore its
   `tip`. That is the whole shelf — the tab is in the sidebar again, and the
   board, rail and detail page work exactly as they did.
2. Then walk back the `isIssue` filters listed in the table above, depending on
   how much of the project half you want visible again. Each one is a single
   `.filter(isIssue)` or an `isIssue(p) &&` in a condition.
3. Restore the kind `<select>` in `projects.js` if you want the
   All / Projects / Issues filter back. `view.tkFilter` and `projMatch()` were
   left alone, so the filter still works the moment the control returns.
4. Delete this file.
