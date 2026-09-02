# Handoff: FEB Team Website

> **Archival.** This is the design handoff as it was delivered, kept for
> reference. The site it describes has been built and lives in `../site/`;
> see `../README.md`. Nothing links here and nothing needs doing here.

## Overview
Public website for Formula Electric at Berkeley (FSAE Electric team). Audiences: sponsors and new recruits. Tone: playful-technical — copy reads like shop-floor engineering docs (work orders, travelers, build logs) but stays friendly. Includes scroll animations and a set of easter eggs.

## About the Design Files
The files in this bundle are **design references created in HTML** — prototypes showing intended look and behavior, not production code to copy directly. The task is to **recreate these designs in the target codebase's environment** (e.g. a static site, Astro/Next, or plain HTML/CSS/JS on Firebase Hosting like the team's existing `feb-composites.web.app` app) using its established patterns. If no environment exists yet, a static site generator or plain HTML/CSS/JS is entirely appropriate — there is no app state.

- `FEB Website.dc.html` — the primary deliverable: the full home page as one scrolling site with working animations and easter eggs. Implement this.
- `Team Website Mockups.dc.html` — the exploration board: 3 home-page directions (1a–1c) plus static mockups of all 8 pages (2a–2h: Home, About, Cars, Subteams, Sponsors, Join, News, Contact). Use these for the secondary pages.
- `_ds/feb/` — the FEB Composites design system: `styles.css` (entry, @imports the rest), `tokens/tokens.css` (all design tokens, light/dark/print), `_ds_bundle.css` (component classes), `fonts/` (self-hosted Saira + Inter variable fonts). **Link `styles.css` as-is** — it is the same system used by the team's work-order app (repo: `Jinxiewinx/feb-engineering-apps`, `05 Design System/`).

Note: the `.dc.html` prototypes use a small templating runtime (`{{ }}` holes, `<x-dc>`); ignore that plumbing — the markup, inline styles, and the logic in the `<script data-dc-script>` class (scroll observers, count-ups, konami handler) are the reference behavior.

## Fidelity
**High-fidelity.** Colors, type, spacing, and copy are final-intent. Photography is placeholder (dashed-border blocks with captions describing the intended shot) — swap in real photos with the same crops. Recreate pixel-perfectly against the design system classes/tokens.

## Site structure
Single scrolling home page (`FEB Website.dc.html`) with sticky nav anchoring to sections; secondary pages per mockups 2b–2h.

Sections in order: sticky nav → hero → shop-feed ticker → stats row → The season → The garage (cars) → Eight crews (subteams) → Sponsors → Join (Op 030) → Build log → Contact → footer.

## Key components & layout
- **Sticky nav**: white at 92% opacity + backdrop blur, 1px bottom border `var(--line)`, 13px/600 links in `var(--muted)`, active link Berkeley Blue with 3px `var(--gold)` underline. Logo: 28px wheel (conic-gradient blue/gold quarters, 4px blue border) + Saira 800 16px "FORMULA ELECTRIC @ BERKELEY" (@ BERKELEY in #B0851A). "Join" is `button.gold.sm`.
- **Hero**: 2-col grid (1.1fr/1fr) on `var(--blue)` (#003262). Eyebrow: 12px/600, letter-spacing .14em, uppercase, gold. H1: Saira 800 58px/1.03, second line gold. Body: 16px/1.65 #c4d0e0, max 46ch. CTAs: `button.gold` + outlined transparent white button. Right cell: photo placeholder over diagonal navy stripes, 10px gold slash strip along the bottom (105° hard-stop gradient). Decorative parallax slash overlay on the right.
- **Ticker**: #002b50 bar, ui-monospace 12px, infinitely scrolling marquee (duplicate content, translateX -50%, 28s linear loop).
- **Stats**: 4 `.stat-tile` in a grid, `.bignum` counts up on first reveal (900ms, cubic ease-out).
- **Season**: 4 `.card`s (Design/Build/Test/Compete); Compete card uses `var(--gold-bg)` + `var(--warn-border)`.
- **Garage**: full-width SN6 feature card (photo + spec list with `.pill.warn` "In build"), then SN5/SN4/SN1–SN3 cards with `.pill.ok`/`.pill.retro`.
- **Subteams**: 8 `.card`s, each `.kind` tag + title + one-liner + `.status` badge (with the required `<span class="dot">`). Hover: translateY(-3px) + `var(--shadow-md)`.
- **Sponsors**: 3 tier cards with 4px colored top borders (gold / navy-2 / border-2), tiers named Monocoque / Structural ply / Surface veil ($10k+/$5k+/$1k+ or in-kind). On `var(--card)` band with top/bottom borders.
- **Join**: `table.list` traveler (steps 10–40) with `.stage-bar` fills animating to 100/66/33% on reveal; `.gate` callout hinting the konami code.
- **Build log**: 3 blog cards (photo strip + `.kind` + title + monospace date); third is "Classified" with redacted █ text.
- **Contact**: 2-col — labeled contact rows (uppercase 11px labels in `var(--faint)`) + map placeholder. Fax row says "no".
- **Footer**: #002b50, 12px #c4d0e0, battery SOC indicator on the right.

## Interactions & Behavior
- **Scroll reveals**: every `[data-reveal]` element starts opacity 0 / translateY(22px), transitions to visible over .6s `cubic-bezier(.2,.6,.2,1)` when 18% enters viewport (IntersectionObserver, one-shot).
- **Count-ups**: `.bignum` animates 0→target over 900ms with cubic ease-out on first reveal; suffixes ("+", " kW", " pg").
- **Stage bars**: animate width 0→target over 1s with 150ms stagger on reveal.
- **Parallax**: hero gold slash translates X at -0.18× scrollY.
- **Nav/CTAs**: smooth-scroll to section anchors (60px offset for sticky nav).
- **Hover**: cards lift -3px with `var(--shadow-md)`, .17s.

### Easter eggs (all implemented in the prototype)
1. **Konami code** (↑↑↓↓←→←→BA): gold full-screen flash, smooth-scroll to Join, toast "Fast-track unlocked… application pre-filled: ↑↑↓↓←→←→BA". In production: also pre-fill a "how did you find this?" field.
2. **Scroll battery**: footer SOC drains 100%→4% with scroll depth; fill turns red below 25%; regenerates scrolling up.
3. **Console message**: styled `console.log` recruiting devtools-openers (gold on Berkeley Blue).
4. **Vacuum pump ticker item**: clicking "vacuum pump: ON??" changes it to "off. thank you." + toast.
5. **SN1's 88 mph** (garage): clicking the SN1–SN3 card toggles sepia "archive mode" on the whole page; click again to return.
6. **Redacted build-log post**: click reveals "SN7 concept: four hub motors and torque vectoring" + toast.
7. **Fax: no**: click → dial-up toast. (Prototype uses toast; audio optional.)
8. **Logo wheel**: click spins it (2 × .5s rotations).
- Toasts: fixed bottom-center, #003262 bg, white 13px/600, 8px radius, auto-dismiss ~3.2s.

## State Management
None beyond ephemeral UI (observer flags, konami key buffer, archive-mode toggle). No data fetching. Ticker content could later come from the team's Firebase app but is static copy here.

## Design Tokens
Use `_ds/feb/tokens/tokens.css` verbatim. Core values: Berkeley Blue #003262 (`--blue`), California Gold #FDB515 (`--gold`), sidebar navy #002b50, canvas #eef1f6, ink #141d2b, muted #515f74, line #dde3ec, accent #2f6be4. Type: Saira (display, 800 for headlines) + Inter (UI); ui-monospace for shop-feed/dates. Radii 6/9/14px; shadows/motion tokens in the file. Dark theme exists (`[data-theme="dark"]`) but the site ships light.

## Assets
- Fonts: self-hosted `saira-var.woff2`, `inter-var.woff2` (in `_ds/feb/fonts/`).
- All photos are placeholders with captions describing intended shots (SN6 monocoque out of mold, SN6 studio, comp podium, mold stack, team photo, RFS map). Source real photos from the team's Drive.
- Logo wheel is pure CSS (conic-gradient) — replace with the real team mark if one exists.

## Files
- `FEB Website.dc.html` — full home page, animations + eggs (primary reference)
- `Team Website Mockups.dc.html` — all page mockups (1a–1c, 2a–2h)
- `_ds/feb/styles.css` + imports — the design system (link as-is)
