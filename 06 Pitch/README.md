# The SN6 pitch deck

A 25-minute walkthrough of the app for the lead and the other leads, ending in
four decisions. Not a sponsor deck and not a tutorial: the audience has run this
shop for a season, so nothing here explains composites.

## Files

| File | What it is |
|---|---|
| `sn6-app-deck.pptx` | The deck. Editable — open it and change the presenter name and date on slide 1. |
| `sn6-app-deck.pdf` | Export for sending. Regenerate it after any edit. |
| `content.mjs` | Every word and every number in the deck, in one place. Edit copy here, not in the .pptx. |
| `build_deck.mjs` | Renders `content.mjs` into the .pptx. `node build_deck.mjs`. |
| `capture_shots.mjs` | Screenshots the running app into `shots/`. |
| `shots/` | The screenshots. All captured from the real app, none drawn. |

## Rebuilding

```bash
cd "06 Pitch"
node capture_shots.mjs          # only if the app's UI changed
node build_deck.mjs
python /root/.claude/skills/pptx/scripts/office/soffice.py --headless --convert-to pdf sn6-app-deck.pptx
```

`capture_shots.mjs` needs Playwright and its Chromium, same as
`tools/test_drawings.mjs`; it skips loudly without them. It serves `03 App/app`
read-only and stubs `fb.js` at the route, so it writes nothing into the app.

## Where the screenshots come from

Every screen in the deck is the real app rendering real SN5 records — the
archive that ships in `03 App/app/sn5-*.json`, 26 work orders and 33 parts.
Three things are seeded by the capture script instead, and it matters that the
difference is known:

- **One live SN6 work order** (`WO-SN6-004`). Every buy-off in the SN5 archive
  reads "not recorded (retro)", which is the right thing for an archive to say
  and useless on a slide about buy-offs carrying a name. Blocker enforcement is
  also deliberately switched off on retro records
  (`workorders.js` `blockerOpenBefore`), so a retro record cannot demonstrate it.
- **Dates on the schedule.** SN5 weeks ship with `weekOf` blank, because retro
  records leave unverifiable fields empty rather than guessing. Weekly Plan is a
  day grid and correctly refuses to draw undated weeks.
- **Tickets, purchases, roster, weekly goals and carpools.** No archive carries
  them. The names are the real roster; the records are plausible, not historical.

No number on a slide comes from any of that seeded data.

## Every number in the deck, and the file that proves it

| Claim | Source |
|---|---|
| 14 standards, CS-000 to CS-013 | `02 CS Standards/src/` |
| 10 root-caused pain points | `01 Pain Points and Improvements/src/pain-points.md` |
| 25 manufacturer datasheets | `04 Datasheets/INDEX.md` |
| 42 reference docs bundled in the app | `03 App/app/docs/manifest.json` |
| 8,900 lines of app source | `03 App/app/` — `cat *.js index.html print.css \| wc -l` |
| 1 vendored dependency (DOMPurify, SRI-pinned) | `03 App/app/vendor/purify.min.js`, `index.html` |
| SN5 archive: 26 work orders, 33 parts, 11 weeks, 8 boards | `03 App/app/sn5-*.json` |
| 1,917-line app test | `tools/test_app.mjs` |
| 8 mold fixtures checked for legibility | `tools/test_drawings.mjs` |
| 4 device widths, every printable | `tools/test_print_mobile.mjs` |
| 83 lines of server-side rules | `03 App/firestore.rules` |
| ShopSabre ~6in cut depth, 5×10 ft bed | `00 Agent/simon.md`, CS-005 |
| ~2 molds + 2 infusions per week | `00 Agent/simon.md` |
| SN5 ran ~$5.3k through a personal card | `00 Agent/simon.md` |
| Purchases over $50 need approval | `00 Agent/simon.md`, CS-012 |
| ~109 lb order held in customs | `pain-points.md` PP-02 |
| $120 of ACP rods, ~$400 to expedite | `pain-points.md` PP-02 |
| CS-001/007/008/009 outlined, not drafted | `02 CS Standards/CS-INDEX.md` |
| Firebase Blaze, effectively $0, $1–5 cap | `03 App/app/README.md` |

If you change a number on a slide, add its row here. A claim with no row is a
claim nobody can check in a year.

## Speaker notes

Every slide has notes, and they carry more than the slide does — that is the
design. The slides hold the claim; the notes hold the reasoning, the war story,
and the thing to say if someone pushes back. Read them before presenting; the
deck is thin on purpose and will not carry the talk on its own.

Two notes worth reading twice: the buy-offs slide, where the honest boundary is
that it records who was signed in and does not prove who held the part; and the
limits slide, which goes in unprompted. A lead who finds a limitation
themselves, after adopting it, stops trusting everything else in the deck.
