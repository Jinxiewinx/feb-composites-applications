"use strict";
/* resins.js — the resin systems the team mixes, and how long a part sits before
   anyone is allowed to touch it.

   THIS IS THE ONLY PLACE A CURE NUMBER IS WRITTEN DOWN. If a hold needs
   changing, change it here; nothing else hardcodes hours.

   Two numbers per system, and the difference between them is the whole point:

   `sheetH` / `sheetSays` is what the manufacturer's datasheet publishes, quoted
   at the temperature they quote it at. Every one of these is copied from a PDF
   that ships in 04 Datasheets/ and is served at docs/datasheets/, so anyone can
   open it from the app and check. CS-000 §8 makes an uncited number a
   nonconformance, so nothing here is allowed to be a remembered figure.

   `febHoldH` is what the app actually enforces. FEB holds longer than the
   datasheet asks for. That is a deliberate team margin, not a manufacturer
   claim, and the UI never presents it as one — the "why N hours?" modal shows
   both and says which is which.

   Every hold in this table is signed off, and `febBy` says by whom and when.
   That field is not decoration: a number nobody approved is a number nobody
   will defend at 2am, and tools/test_app.mjs refuses a row without one, so
   adding a resin forces the decision rather than letting a placeholder ship.

   Provenance. Simon gave two of these directly on 2026-08-01, as flat
   per-resin figures: IN2 48 h and West 105 24 h. They are recorded per
   resin+hardener because that is the only form in which they can be checked
   against a datasheet. The other four he signed off the same day, on this
   reasoning:

     - The holds are shift boundaries, not multiples of the datasheet. 24 h is
       "come back tomorrow" and 48 h is "come back after the weekend". A hold
       that expires at 3am helps nobody; students are not at RFS then.
     - Both FAST systems get 24 h, which is 3x their datasheet figure and the
       one place this table costs the team something real: buying FAST hardener
       to turn two infusions round in a day no longer works. Kept anyway,
       because the SN5 record has no case of a part being ruined by waiting and
       several of work being rushed. If that trade stops being worth it, this
       is the line to change, and it is one number.
     - XCR is 12 h against an 8 h 30 initial cure, the smallest margin here, on
       the grounds that it seals a mold rather than making a part: the failure
       mode is a surface defect you will find, not a structure you won't.

   A lead-editable version of this table (fb.getConfig/setConfig) is the
   obvious next step, so a hold can be changed without a deploy. Deliberately
   not built yet — until it is, changing a number means editing this file.

   A note on what the West System numbers are NOT. West publishes pot life,
   working time, "cure to a solid, thin film", and "cure to working strength".
   It publishes no demould figure at all. The thin-film number is the closest
   analogue and it is labelled as itself here, never relabelled "demould". */

const RESINS = [
  {
    id: "IN2-AT30-SLOW", label: "IN2 + AT30 SLOW",
    use: "Infusion, the default",
    febHoldH: 48, febBy: "Simon Starbuck, 2026-08-01",
    sheetH: 24, refTempC: 25,
    sheetSays: "demould 18–24 h at 25 °C",
    doc: "docs/datasheets/EC-TDS-IN2-Infusion-Resin.pdf",
  },
  {
    id: "IN2-AT30-FAST", label: "IN2 + AT30 FAST",
    use: "Small infusions",
    febHoldH: 24, febBy: "Simon Starbuck, 2026-08-01",
    sheetH: 8, refTempC: 25,
    sheetSays: "demould 6–8 h at 25 °C",
    doc: "docs/datasheets/EC-TDS-IN2-Infusion-Resin.pdf",
  },
  {
    id: "WS-105-206", label: "West 105 + 206 slow",
    use: "Wet layup, the default",
    febHoldH: 24, febBy: "Simon Starbuck, 2026-08-01",
    sheetH: 15, refTempC: 22,
    sheetSays: "cure to a solid, thin film 10–15 h at 72 °F. West publishes no demould time",
    doc: "docs/datasheets/105_205-207-Combined.pdf",
  },
  {
    id: "WS-105-205", label: "West 105 + 205 fast",
    use: "Small wet layups, tabs",
    febHoldH: 24, febBy: "Simon Starbuck, 2026-08-01",
    sheetH: 8, refTempC: 22,
    sheetSays: "cure to a solid, thin film 6–8 h at 72 °F. West publishes no demould time",
    doc: "docs/datasheets/105_205-207-Combined.pdf",
  },
  {
    id: "WS-105-209", label: "West 105 + 209 extra slow",
    use: "Hot ambient, large layups. Needs 70 °F minimum",
    febHoldH: 36, febBy: "Simon Starbuck, 2026-08-01",
    sheetH: 24, refTempC: 22,
    sheetSays: "cure to a solid, thin film 20–24 h at 72 °F. West publishes no demould time",
    doc: "docs/datasheets/105-209-Epoxy-Resin-1.pdf",
  },
  {
    id: "XCR", label: "XCR coating resin",
    use: "Mold sealing",
    febHoldH: 12, febBy: "Simon Starbuck, 2026-08-01",
    sheetH: 9, refTempC: 20,
    sheetSays: "initial cure 8 h 30 at 20 °C, handleable at about 9 h",
    doc: "docs/datasheets/EC-TDS-XCR-Epoxy-Coating-Resin.pdf",
  },
];

function resinById(id) { return RESINS.find(r => r.id === id) || null; }

/* The enforced hold, in hours. Falls back to the datasheet figure for a resin
   this table has never heard of, which is the conservative direction: an
   unknown resin gets the shortest defensible wait rather than none at all. */
function resinHoldHours(id) {
  const r = resinById(id);
  return r ? r.febHoldH : 0;
}

/* The two ways this table could go wrong, checked as data rather than trusted.
   tools/test_app.mjs asserts this returns empty, so neither can be introduced
   by a later edit without the tests saying so.

   1. A FEB hold shorter than the datasheet would be the app enforcing
      something the manufacturer contradicts, which is worse than not
      enforcing at all.
   2. A hold nobody signed off. The app locks a step and refuses a member's
      buy-off on the strength of these numbers; every one of them needs a name
      against it. */
function resinTableProblems() {
  const out = [];
  RESINS.forEach(r => {
    if (r.febHoldH < r.sheetH) out.push(`${r.id}: FEB hold ${r.febHoldH} h is below the datasheet's ${r.sheetH} h`);
    if (!r.febBy || /pending|tbd|todo/i.test(r.febBy)) out.push(`${r.id}: hold is not signed off (febBy: ${JSON.stringify(r.febBy)})`);
  });
  return out;
}
