# FEB Team Website

The public site for Formula Electric at Berkeley, aimed at sponsors and new
recruits. Static HTML, CSS, and one JavaScript file. No framework, no build for
the pages themselves, no data fetching.

Built from the design handoff in `design_handoff_team_website/`, on the design
system in `../06 Design System/`.

## Run it

```bash
node "08 Website/build.mjs"          # copies the design system into site/_ds/feb/
python3 -m http.server 8000 --directory "08 Website/site"
```

Then open http://localhost:8000. Run `build.mjs` once after cloning; after that
only when `../06 Design System/` changes. Opening `site/index.html` straight off
disk works too, once the design system has been copied in.

## Layout

| Path | What it is |
|------|-----------|
| `site/index.html` | The home page. One long scroll: hero, ticker, stats, season, garage, subteams, sponsors, join, build log, contact. |
| `site/about.html` … `site/contact.html` | The seven secondary pages. |
| `site/assets/site.css` | Everything the design system does not already cover: layout, the hero, the ticker, reveals, responsive rules. |
| `site/assets/site.js` | Scroll reveals, count-ups, stage bars, parallax, the footer battery, and the easter eggs. |
| `site/_ds/feb/` | **Generated.** The design system, copied from `../06 Design System/` by `build.mjs`. Gitignored. Never edit it here. |
| `build.mjs` | Copies the design system in, then checks the shared nav and footer for drift. |
| `firebase.json` | Hosting config. Not deployed yet, see below. |
| `design_handoff_team_website/` | The original handoff, exactly as delivered. Reference only, nothing links to it. |

## The design system

The site links `../06 Design System/` rather than carrying its own copy of the
tokens. `build.mjs` copies `tokens.css`, `components.css`, and `fonts/` into
`site/_ds/feb/` and writes a `styles.css` that imports them. The handoff shipped
its own `_ds/feb/` bundle; it is byte-identical to what the build produces, so
there is one source of truth and it lives in `06 Design System/`.

Two places where the site extends the system rather than using it as-is, both in
`site.css` and both built on the same tokens:

- **`a.btn.gold` and `a.btn.primary`.** The design system scopes its button
  variants to the element (`button.gold`), so an anchor carrying `.btn` gets the
  base outlined look and nothing else. Navigation belongs in links, so the two
  variants the site needs are restated for anchors.
- **The `table.list` narrow-screen collapse.** `06 Design System/README.md` says
  that rule lives in the consuming app, so it is carried across here. Every
  `<td>` in a `table.list` needs a `data-label`; the label stacks above the
  value on phones.

## The shared nav and footer

The pages are hand-written with no templating, which keeps them openable and
editable by anyone. The cost is that the nav and footer are copied into all
eight. They are wrapped in `<!-- shared:nav -->` / `<!-- shared:footer -->`
markers, and `build.mjs` fails if any page's copy drifts from `index.html`
(ignoring the per-page active-link markers). Change the nav in `index.html`,
paste it into the other seven, and let the build confirm you got them all.

## Tests

```bash
node tools/test_website.mjs
```

88 checks: the design system loads on every page, no console errors, every
scroll reveal fires, all eight easter eggs work, the page is readable with
JavaScript disabled, `prefers-reduced-motion` shows everything immediately, and
nothing overflows a 390px phone.

It needs Playwright and skips with a message when it is missing:
`npm i -g playwright && npx playwright install chromium`.

## Deploying

Not deployed. `firebase.json` is ready but points at a hosting site
(`feb-team-website`) that does not exist yet. To ship it:

1. Create the site: `firebase hosting:sites:create feb-team-website`
   (or pick another id and update `firebase.json`).
2. `node "08 Website/build.mjs"`
3. `firebase deploy --only hosting` from inside `08 Website/`.

The app at `feb-composites.web.app` deploys separately from `03 App/` and is
unaffected.

## Still to do

- **Photos.** Every image is a dashed placeholder with a caption describing the
  intended shot: SN6 monocoque out of the mold, SN6 studio, comp podium, mold
  stack, team photo, RFS map. Source them from the team Drive and swap them in
  with the same crops.
- **The application form** on `join.html` posts to a `mailto:`. Point it at the
  real recruiting form. The Konami easter egg pre-fills its "how did you find
  this?" field, so keep the `data-referral` attribute on whatever replaces it.
- **The logo** is a pure-CSS conic-gradient wheel. Replace it if the team has a
  real mark.
- **Copy** is the handoff's, and reads as final-intent rather than reviewed.
  Someone on the team should check the numbers, in particular the stats row and
  the SN4/SN5 results.

## Easter eggs

Eight, all working and all covered by the test suite:

1. **Konami code** (↑↑↓↓←→←→BA) anywhere: gold flash, jump to Join, toast. On
   `join.html` it also fills the referral field.
2. **Scroll battery** in the footer drains 100% → 4% with scroll depth, turns
   red below 25%, and regenerates on the way back up.
3. **Console message** for anyone who opens devtools.
4. **Vacuum pump** in the ticker: click it and it switches off. The marquee
   pauses on hover so the item can actually be clicked.
5. **SN1's 88 mph** on the garage card: turns the whole page sepia. Click again
   to come back.
6. **Redacted build-log post**: click to declassify.
7. **Fax line** on the contact page says no, loudly.
8. **Logo wheel** spins when clicked.
