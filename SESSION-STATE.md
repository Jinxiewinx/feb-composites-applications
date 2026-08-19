# Session state

Rolling handoff file, per working rule 2 in `CLAUDE.md`. If a session got cut off
by a usage limit, read this first. Update it as work proceeds, not just when
stopping.

Keep it short. Durable state only: decisions made, work in flight, open
questions. Not a transcript.

---

Last updated: 2026-08-15 (round: folds/trainings/issues + polish)
Newest: **Polish round after Simon's live review (2026-08-15, night).** His
five asks, all shipped: (1) matrix grant affordance is now a PILL — dashed
＋ .tpill.mtx-add capsule (hover firms to ok) / filled ✓ .tpill.mtx-yes
(hover dims toward revoke red); (2) the fold caret is a 28px circular chip
(.wosec-hd::after with surface-2 bg + hairline), label 12.5→13.5px —
components.css MIRRORS the .wosec-hd recipe and the designsystem parity
test catches drift, so the shared copy was rewritten too (it was still the
details-era version); (3) detail text fills the cards: .mddetail
.wosec-body 15px, its table.sub 14px, .grid .f .ro 15px — scoped, labels/
tny/meta keep their explicit sizes; (4) steps denser: padding 10→6px,
title 15px, meta 13px, spine trims to 6/34, and ALL controls moved to the
right cluster — stepPhotoStrip split into stepThumbs (imgs + "+N more",
keeps data-photo-slot for the upload ghost) in the body and stepActions
(camera + ⚑) appended inside .buyoff for every state; mobile: buy-off
stretches via .buyoff button:not(.ib){flex:1}, icons ride beside; (5) run
carry-over: + New run → startRunForPart (no runs = instant, unchanged;
else openNewRunModal: "Start fresh" / "Use a previous run" select +
checkboxes mold/files/stack/BOM/quality, all default-ticked), submitNewRun
reads the form BEFORE the allocId await, newRunForPart(partId, opts)
applies carries — mold block + moldRef, files re-referenced under fresh
F… ids (same blobs, zero uploads — test asserts no upload call), stack
deep-copied as stackSource "asbuilt" + "carried from <id>" note (honest
drift), BOM deep copy, quality criteria with actuals blanked; toast names
what was carried. The WO rail's "+ Start run" buttons stay direct
newRunForPart on purpose (they only render for zero-run parts, and a test
pins the onclick string). Suites: app 448 (+3), designsystem 23 (after the
components.css sync), detailui 885, appui 1242, print_mobile 14, green.

Previous newest: **Issue lifecycle streamlined (2026-08-15, chunk 3 of 3 — round
complete).** One write path in projects.js beside setTicketStatus:
setIssueDisposition (field-scoped, disposed-but-open is a real state — it's
what undisposedIssuesForWO checks), resolveIssue(id, method, narrative?) —
narrative undefined = leave whatHappened alone; a plain write CLEARS
whatHappenedHtml so the siblings can't disagree; returns statusGate's string
verbatim or closes via the one choke point (single announceIfResolved) —
and reopenIssue, which CLEARS resolutionMethod (Simon's fork) so a reopened
issue gates its WO again, old method preserved as a comment. Ticket detail:
resolve band replaces the read-only resolution line (select saves onchange,
gate words in the band, one Resolve button; Done state = "Resolved — X" +
quiet Reopen). Step capture: ⚑ button in stepPhotoStrip beside the camera →
openStepIssue purpose-built modal (title prefilled "step: ", photos AT
creation via fb.upload after allocId — form read fully BEFORE the await,
the offline-confirm footgun), writes p.stepRef {seq,index,title} (NEVER
parentId — sub-tickets can't be issues), stays on the WO; stepIssues(wo,s)
chips on the step (⚑ open / ✓ disposed) + counted into done-row folds.
WO close: updWO's refusal toast (test-pinned, fires FIRST) now opens
openWOCloseoutModal — per-row disposition select + prefilled plain textarea
+ Resolve through resolveIssue, coDrafts() harvests half-typed narratives
before every re-render, "Resolve all & complete work order" stops at the
first gate failure, "Cancel ticket (false alarm)" behind confirmModal,
completion re-checks undisposedIssuesForWO (never trusts the modal's
bookkeeping), confirmation pane lists what was resolved; the standing red
banner gained a "Dispose it now" link to the same modal. CSS: .resolveband
+ .corow. Suites: app 445 (+5), designsystem 23, detailui 885, appui 1242,
print_mobile 14, route 38, all green. README Tickets section rewritten.
NOT yet deployed — that's the next step, then mockup regen if wanted.

Previous newest: **Training catalog went lead-editable + People matrix (2026-08-15,
chunk 2 of 3).** config/trainings folds over the TRAININGS/TRAINING_CODES
consts through trainingById()/allTrainings() in workorders.js — the resin-
override pattern verbatim (window.TRAINING_OVERRIDES, fetch-once
loadTrainingCatalog in the onFbChange hook, read-time validation, null =
revert marker). Ids are slugs minted once (trSlug suffixes collisions),
NEVER edited; customs archive instead of deleting so grants/overrides keep
rendering names; built-ins rename but never archive (STD_STEPS references
them); unknown ids render a stub, never blank. Codes required, ≤4 chars,
unique case-insensitive across unarchived entries (trCodeTaken). Every
TRAININGS[id]/TRAINING_CODES[id] read is rerouted through trainingById —
no caller-side fallbacks. People tab: view.pplView list|matrix seg toggle
(list default, falsy-tolerant), matrix = table.mtx in .mtxwrap own-scroll
container, sticky person column, coverage counts over the FULL roster
(search can't falsify them), lead cells = .mtxcell buttons straight onto
togglePersonTraining (instant, Simon's pick), members inert; archived
columns behind an explicit "show archived" checkbox, dimmed, revoke-only.
Catalog editor openTrainingCatalog/openTrainingEdit/submitTrainingAdd/
setTrainingArchived in people.js, lead-only. No rules change (config
already lead-writable) and no migration. Suites: app 440 (+4), wo_rules 98
(+3, config/trainings member-403/lead-200/member-read-200), designsystem
23, appui 1242, detailui 885, all green.

Previous newest: **Detail-page folds + traveler spine (2026-08-15, chunk 1 of 3).**
Simon's round: (1) more collapsible WO/Parts detail + visually distinct
steps, (2) training matrix + lead-editable catalog, (3) streamlined issues
(quick capture from a step w/ photos, in-place resolve, dispo-at-WO-close).
Forks he picked: full scope, reopen CLEARS disposition, instant matrix cell
toggles, sticky-per-session folds, People list stays default. Chunk 1
landed: sectionCard/secNav/secFolded/toggleSecFold/secJumpOpen hoisted to
core.js; sections are CLASS folds (view.secFold {id, m}) not <details>
(closed details skip painting → vanish from browser print; @media print
force-shows .wosec-body — test-pinned); warned sections never default
folded, E opens all; WO defaults: Steps+Stack open, Details/Photos/Files
folded, Quality folds-when-empty, Notes folds unless a note is newer than
your localStorage stamp (WO_NOTES_NEW session map keeps the gold "new" dot
+ auto-open stable across re-renders; gold=new, amber=trouble). Parts got
PART_SECTIONS (Progress/Stack/Runs open; Details/Mold/Links/Notes folded),
pt-progress/pt-children anchors kept, legacy anchor jumpbar deleted, files
capped at 8 (view.ptFilesAll). Steps wear the traveler spine: per-row
::before/::after segments (solid walked, dashed below NOW), 28px circular
.num nodes (✓ done / gold NOW w/ --ink numeral / amber-ring blocker /
slate ◷ held / red ✗ failed / outline future), washes gone, ≥4 consecutive
done rows compress into details.step-group with counted summary — rows
inside render metas INLINE (their own step-more inside a closed group is
the detailui orphan audit's exact target; hit it, fixed it). Parts keeps
1/2/3 = advance stages (NOT digit-jumps — that key is taken). Suites:
app 436, designsystem 23, detailui 885, appui 1242, print_mobile 14,
route 38, safearea 30, all green.

Previous newest: **WO detail redesign shipped (2026-08-15, later).** Simon: the WO
detail read as a wall of text; sections should feel separated, photos should
become a major documentation feature; ignore the traveler; "distinct zones,
quiet inside"; visibility tiers mine to pick; no data lost; one-scroll stays
(pagination was rejected historically). Two design agents (architecture +
photos). Shipped in six commits: (1) photos data layer — woAllPhotos()
unifies step photoRefs / image files / note <img>s, addStepPhotos() writes
object entries {id,name,filename,url,path,type,size,by,ts,caption} through
the steps transaction (photoRefs had NO writer before, so no migration),
lightbox dedupes by src; (2) one card per section with .wosec-hd headers
(bmod-hd recipe + count + warn word), Photos section registered in
WO_SECTIONS (keys 1-7), per-step 48px thumb strip + camera in view mode,
empty Quality/Files fold as details; (3) hero .wo-facts band — statusdrop
status (CS-003 gate intact), promoted woProgBar, due, mass, engineer
avatars; (4) steps — .is-blocker (amber, person) vs .is-held (slate --hold-*,
clock glyph) split, done rows fold history behind a counted summary, gold
NOW badge + single .primary buyoff on the up-next row, buyoff avatars,
"View stack" link on frozen steps, photo nudge Cancel now captures then
resumes buyoff; (5) BOM + event log fold even when populated (wo-subfold),
"See the event log" metas are woJump('wo-eventlog') links that open the
fold; (6) thread + composer in their own .card.thread-card, Overview →
"Details" with .fgroup-label clusters in view mode (edit keeps all 16
fields), Files grid caps at 8 behind "Show all". Fixtures gained step
photos (inline SVGs); detailui scans cover .phtile/.photogrid/.step-photos.
Suites: app 430, designsystem 23, appui + detailui run pre-push.

Previous newest: **Trainings gate buy-offs and engineer assignment (2026-08-15,
mold-drawing-revamp worktree).** Simon asked for trainings on people (mold
design, ShopSabre, wet layup, infusion, foam core, forged CF) gating step
buy-offs and mold-engineer assignment; two design agents explored visuals and
integration, Simon confirmed the four forks: catalog fixed in code, buyoff =
hard block + reasoned lead override (leads NOT implicitly qualified),
assignment = warn-don't-block, client-only enforcement. Shipped: TRAININGS /
TRAINING_CODES / MFG_ENG_TRAINING consts + training tags in STD_STEPS rules
(no title fallback, deliberately inverse of BLOCKER_WORDS — untagged/retro
stay ungated), grants on roster docs (trainings.<id> = {by,at}, lead-only by
existing rules; fb.rosterGrant/rosterRevoke), gate in buyoff() after blockers
(openTrainingGate shows who's qualified; override writes step.trainingOverride
+ timeline), engFld() datalist of qualified people + *Email sidecar on parts
AND WOs + amber warn, People tab Trainings column of .tpill capsules +
"Record training session" bulk modal + per-person checkbox modal +
qualified-for filter. New CSS .tpill/.trwrap/.trrow in index.html + design
system + conventions.md. Drive-by: .bg-name/.bg-goal phantom classes fixed
(pre-existing designsystem failure on this branch). Suites: app 426, rules 95,
designsystem 23, all green; appui sweep run before push.

Previous newest: **Reports "Weekly status board" scatter fixed (2026-08-13).** Simon
reported "blocks all over the screen"; two investigation agents confirmed
no regression — the 640ec38 card-grid layout itself was the problem:
auto-fit minmax(320px,1fr) orphaned the fifth card, align-items:start left
ragged gulfs, and .card's 14px margin doubled the grid's 14px row gap.
Fix: .rgrid is masonry columns now (columns: 320px; column-gap: 14px;
cards break-inside: avoid; print block gets columns: 1). Both rules pinned
in test_app's status-board test. Suites: test_app 406, appui 1242,
print_mobile 14, green. Same day: ticket rail default FLIPPED — Simon
tried the auto-collapse for two days and wants the rail visible when a
ticket opens; the toggle now hides it instead (state renamed
view.tkRail -> view.tkRailOff, default falsy = visible; test flipped to
match). The rail-off CSS and button are unchanged.

Also 2026-08-13: **labels are name-first.** Simon: the label's primary use
is being READ ("Flammables Cabinet" printed as "FLAMMABLES CA…"); QR is
secondary. Decisions (all his picks): name wraps to 2 lines + tiered
auto-shrink, name biggest / ID second, mid row merges into footer only when
the name wraps, QR stays 21.4mm. Implementation: nameTier() in labels.js
(pure char-count ladder, n1 14pt 1-line / n2a 13pt / n2b 11pt / n2c 9pt /
n2d 8pt, thresholds sized for the narrower 5522 track), .lbl-name tier
classes + -webkit-line-clamp 2 + new .lbl-rid 9.5pt row in print.css; old
.lbl-r1/.lbl-id shared-line layout gone. test_labels rewritten: "stays on
one line" replaced by "fully readable in <=2 lines", new FLAMMABLES CABINET
BIN fixture. Suites: labels 36, qr 69, app 406, print_mobile 14, green.

Also 2026-08-13 (later): three quick Simon asks, all live:
(1) ticket rail default flipped to visible (view.tkRailOff), (2) WO "no run
yet" headers un-stickied (overlap bug), (3) roster removal surfaced on
People for leads (reuses rosterDel), (4) Budget list rows edit status+cost
inline (setBuyField in budget.js, statusdrop Draft/InWork/Complete CSS
variants, .buy-cost input, print rule strips the control chrome; New
Purchase + row-click detail unchanged).

Also 2026-08-13 (latest): **budget goals + owed tracker.** Simon's picks:
lead-editable categories w/ dollar goals (config/budget via
getConfig/setConfig, same pattern as resins), progress bars under the stat
row, who-is-owed card, over-goal warning at entry, PLUS a season total
that deliberately need not equal the category sum (slack), split
base+contingency kept quiet (tick on the bar + tooltip only). Categories
replace PURPOSE in the purchase form once defined; unmatched purposes
show as "not in any category". Editor modal openBudgetGoals() lead-only
(config rules already enforce). shoot_ui stub seeds BUDGET_CFG so budget
screenshots show the bars. Declined extras (inline category edit, CSV
w/ categories) NOT built. Suites: app 410, appui 1242, budget detailui
35, green.

Also 2026-08-13 (evening): multi-window + budget polish. (1) Ctrl/Cmd-click
and middle-click open records in a new tab: chips gained data-open, rail
rows resolve via their pi-<id> DOM ids, delegated capture listeners in
core.js (newTabIdFrom + openIdInNewTab) — rides the EXISTING #/<ID>
deep-link routing (test_route.mjs), no history/pushState change. (2) Budget
rows also tag the category inline (buy-cat select; off-list purposes
preserved as their own selected option, never silently recategorized), and
rows carry data-open. (3) goalhead flex fix — Edit goals button was
vertically off-center (was float:right in the h3).

Also 2026-08-13 (night): tickets rail sub-tickets fold — caret on parent
rows (▾ / ▸ + hidden count), state per-parent in view.tkFold, fold lives
in tkRailPlan so keyboard rows skip hidden children; the open ticket
stays pinned under a folded parent (same never-hide rule as the filters).

Previous (2026-08-11):
Status: **Ticket detail went widescreen (2026-08-11).** Simon flagged the open
ticket as "too horizontal": three left columns (nav sidebar, tickets rail,
then the .tkmeta column) squeezed the description/sub-tickets/thread to
~730px on a 1600px content box. Decisions confirmed with him: meta becomes a
horizontal band under the title, the tickets rail auto-collapses while a
ticket is open (toolbar toggle brings it back, session-scoped view.tkRail),
one layout for all desktop widths. Implementation: .tksplit grid-areas flip
(DOM order untouched, so phone stacking and the main-first assertion hold),
.tkband-row / .tkband-g band internals, attachment row capped at 168px with
a fade and a "Show all N attachments" BUTTON (view.tkMetaAll, reset by
selectTicket — never a details element, postmortem still applies), new
.mdsplit.rail-off class (generic on purpose; workorders/parts/molds can
adopt later; NOT has-sel, which test_app pins to the responsive block, even
as a comment string). New rail-off test in test_app. Suites: test_app 406,
detailui 882, appui 1242, all green. Follow-up same day: the .prose 68ch
measure cap is lifted inside .tkmain only (Simon: comments should span the
width now that the column has it); the cap stands everywhere else. Second
follow-up: comment tables can now GROW (they were stuck at the inserted
3x3): Tab walks cells and appends a row from the last cell, Shift+Tab goes
back, and "Table row"/"Table column" live in the composer's insert menu
(rteTableAddRow/Col in rte.js; rows grown from the header land in tbody).
Real-DOM test in test_detailui's ticket-detail desktop pass, menu drift
guard in test_app. Third follow-up: Backspace on an EMPTY bullet now exits
the list via outdent (rteSelLi + guarded branch in rteKeys; collapsed caret
only, non-empty items keep native merge); real-DOM test beside the table
one. Fourth follow-up: "* " (and every input rule) typed on a soft-wrapped
line (<br> inside the paragraph, i.e. Shift+Enter) used to hand the WHOLE
paragraph to the command and swallow the previous line into the first
bullet. rteOwnLine() in rte.js now splits the caret's line into its own
block before any rule runs; the empty new block gets a <br> filler because
a caret can't sit in an empty text node (browser snaps it back to the
previous block — that was the second half of the bug). Real-DOM test in
detailui (focus the scratch editor BEFORE setting the range, or rteExec's
focus() resets the caret — test artifact to remember).

Previous status (2026-08-08): **Backlog batch: eight deferred items landed.** Simon
asked for a sweep of everything "left for later" across this file's history
(46 items found), picked eight, and settled the forks: slate for On Hold,
pinch + double-tap for lightbox zoom, measured ladders (no collision
post-pass) for drawings. Eight commits, 64b993e..8902367. All suites green:
test_app 405, designsystem 23, appui 1242, detailui 882 (two new states),
drawings 9/9, packer 24, labels 32, print_mobile 14, route 38, safearea 30.

What landed, in commit order:
1. **--hold slate trio** ends the amber collision: Tickets On Hold is slate
   in both themes/both token homes; .pill.OnHold stays red on purpose (it's
   borrowed as a generic exception badge by Inventory and Budget).
2. **test_drawings 9/9 for the first time.** The 19-40 findings per mold
   were mostly each dimension's OWN two lines: inch primary and mm bracket
   sat 9px apart at baseline, under the combined font boxes. Fixes: 15/3.5
   offsets in dimH/dimV, LEADER_PITCH = ceil(font*1.55) for spreadLabels
   stacks, DIM_PITCH = 30 for the layer-sheet ladders, sheet-2 gutter
   dimension +36.
3. **Print chrome gone** (@page margin 0). Per-page sheets (.dwg-page)
   carry the margin as padding; the FLOWING traveler gets vertical margins
   on both pages via table.pgflow's repeating thead/tfoot spacer rows (an
   element's padding exists only on its first/last page). ws-foot fixed at
   0.45in insets. Fallback tabs keep 0.45in main padding; their page-2
   starts nearer the edge, accepted. printables.html files skipped
   (standalone docs) — follow-up if wanted.
4. **Reports is a card grid**: stage pills via stageClass, chip links via
   the dashboard's srow idiom, .rgrid.
5. **Reports prints clean**: chip print exception (the blanket
   button{display:none} would have deleted every linked record from paper),
   rgrid one column on paper.
6. **Lead-editable resin holds**: config/resins {id:{febHoldH,febBy}},
   loadResinOverrides (loadSeason twin), folded in at resinById, the ONE
   choke point. Guarded at write AND read: an under-datasheet or unsigned
   override is refused by the editor and ignored by resinById, so a
   hand-edited Firestore doc can't weaken a hold either. Editor lives in
   the "Why N hours?" modal; revert writes null (merge can't delete).
7. **Lightbox**: controls in a bottom .lb-actions bar (same ids — detailui
   keys on them), 44px targets over the home indicator; real transform
   zoom, pinch 1-4x + double-tap 2x + pan clamped to half the overflow;
   lbZoomed() is the owned transform state now; touch-action none and
   stage overflow hidden. Zoom math is pure helpers with truth-table
   tests.
8. **Cut-list execution**: "Mark these boards cut" — snapshot proposal
   (CUT_PROPOSAL set by the HANDLER, never render scope), per-plan
   checkboxes (qty>1 rows = one per unit), rack re-check with whole-abort,
   qty decrement / delete-at-zero, offcuts written back as plain board rows
   (mm units, origin "cut <date> from <id>", parent's location, NO kind
   field), and CUTS_UNDO — the app's first multi-record memento (restores
   deleted rows exactly). Fixtures gained a stackplan + fitting board
   (cuts mode had never been photographed); detailui states cutlist +
   cutcommit-modal.

Decisions worth keeping:
- resinById is where overrides fold in; never read RESINS directly for
  hold numbers. RESIN_OVERRIDES/FACTS-style globals are window.* or var
  because the node harness reaches script globals via globalThis.
- The traveler's pgflow spacers are print-only (zero-height on screen), so
  measurePages needed no change. If the traveler markup ever restructures,
  keep ONE thead/tfoot spacer pair per .ws-page.
- Don't put a chip inside anything the print block hides wholesale;
  the #main .chip print exception exists but is display:inline text.

Still open from the 46-item sweep (Simon chose not to take these now):
stack-plan→WO blocker wiring, Monday-assignment speedup, packer elastic
margins, offline traveler port, printables redesign, website launch, CFD
Windows build, CS-standards AI-writing sweep (needs his go), the operator
actions (Firebase ownership, scan mirror, signing standards, #composites
announcement), the two mold-stage-enum merge question, saw/blank-size
questions, board-density mixing question, and the smaller polish items
(numeric column alignment, delWeek undo, weekly-plan car wrap, section
heading subtext, --scrim token, spacing tokens, .kind size).

Previous status follows.

Last updated: 2026-08-07 (evening)
Status: **The board went white (2026-08-07).** Simon reviewed round four and
asked for a white background like the rest of the app, and flagged that the
Tickets right pane had gone black too. Both fixed in one commit:

- The dark treatment is gone entirely: the `--board-*` token family removed
  from both token homes, the navy/carbon container removed, `.bmod` is now
  the ordinary card recipe (card/line/shadow tokens) on its own class, and
  all the dark-only recolor overrides (.srow/.chip/.status/season bars/
  sdot) are deleted since the defaults are correct on light. Identity now
  comes from structure: the module grid, bare Saira numerals
  (--brand-ink/--bad/--amber/--ok), and the gold slash headers.
- The black Tickets pane was a CLASS COLLISION, not a leak: `.board` has
  been the Tickets kanban's class since the tab existed, and round four
  stole it, so the dashboard's dark grid rules repainted the kanban. The
  dashboard container is now **`.dboard`**; the kanban keeps `.board`
  untouched. Do not reuse `.board` for anything new.
- Everything else from round four stands unchanged: modules, alert strip,
  config/season, feed, facts, launchpad, fixtures, and the round-four
  decisions list below except its constant-dark item.

Suites after the change: test_app 397, designsystem 23, appui full sweep
1242, all green. Mockup regenerated in place (same 20260808 filename),
READMEs and captions updated. Pushed to main and deployed.

Previous status follows.

Last updated: 2026-08-07 (later)
Status: **Dashboard round four: mission control (2026-08-07).** Branch
`mold-drawing-revamp`, nine commits on top of the Tickets revamp. All suites
green: test_app 397, designsystem 23, detailui 816, appui 1242, route 38,
safearea 30.

Simon asked for a dashboard that is visually different from the rest of the
app (within the design language), visually full, fun, and useful to a lead.
Interrogated with options, he chose: mission-control style on a
CONSTANT-DARK board (both themes), alerts lead (late/blocked/unassigned),
per-person "your work" (satisfied by the existing auth + isMine, no picker),
fun = fact of the day (team lore weighted) + countdowns/streaks + garnish,
launchpad = app tabs + bundled docs + pinned shelf, phone = today-first.

What landed, in commit order: `--board-*` tokens in BOTH token homes plus
the .board/.bmod/.bnum class family (dark navy in the sidebar's register:
carbon crosshatch, gold slash, Saira numerals; gold is ink/hairline only,
neither brand token survives as a large fill); config/season plumbing
(window.SEASON, loadSeason() fetch-once via fb.getConfig, rules already
lead-writable, fixtures plant a relative-dated season); the board shell
(flat grid children, grid-template-areas re-declared per breakpoint, the
alert strip team-wide with a green all-clear cell, money as its own module
with needsApproval surfaced, .card/.stat-tile/.bignum purged from the page
so the theme-proof sampler never sees a constant color, with a test that
greps for them); countdown & streaks + the lead-only editSeason modal
(denominator-free counters per the round-two rule; "days since a missed
deadline" uses only due dates and open/closed); the launchpad (woLate set
AFTER setTab because setTab wipes wo* flags; invFlag survives and leads);
the activity feed (dashFeedEvents merges updatedAt touches, comments, and
buy-offs, one event per record per day, retro WOs excluded, watched-unread
pinned with the gold dot); facts.js (66 facts, 47 mined from SN5 docs, lore
doubled by appending after the list so duplicates are never adjacent,
deterministic UTC-day index, race-day easter egg); fixtures gained two LIVE
work orders (one blocked, one mid-cure) and pinned shelf links.

Decisions worth keeping:
- **The board contains none of .card/.stat-tile/.bignum, ever.** appui's
  theme-proof sampler inspects those; one stray re-arms it against a
  constant-dark surface and fails 8 ways. A test_app assertion greps the
  rendered page for them.
- **Board classes are NOT registered in 06/components.css or
  conventions.md**, following the precedent of every dashboard class since
  round one (.heroband lived only in app CSS too). Tokens ARE in both homes;
  the designsystem suite enforces token parity, light+dark+print.
- **Strip numbers are team-wide; the list below keeps the my/team toggle.**
  The strip is the lead's read, the list is the member's.
- **loadManifest() failure now leaves the manifest unloaded and retryable**
  instead of caching an empty shelf; the dashboard triggers the load too.
- FACTS/FACT_POOL are `var` because the node harness reaches script globals
  through globalThis, which const/let never join.

Traps hit: the live fixtures flushed three latent audit failures on OTHER
tabs (.wflag at 10px, .pmini 35px under a finger, Documents' "Open" anchor
collapsed to 14px around its full-size button) — fixed in the app, commit
93f3dde. The shop-status empty state also says "All clear", so strip tests
pin `<span class="bnum ok">`, not the words.

Still open, unchanged: the sanctioned list at the 2026-08-02 section
(lightbox thumb-reach/zoom, trash contrast, drawer close control); the
amber collision (in-work on Parts vs on-hold on Tickets). The board's
right-column has some air at 1440 until real data fills the feed; revisit
only if Simon calls it out.

Previous status follows.

Last updated: 2026-08-07
Status: **Tickets revamped: master-detail, genealogy, sub-tickets as real
children (2026-08-07).** Branch `mold-drawing-revamp`, six commits. All suites
green: test_app 391 (was 377), designsystem 23, detailui 816, appui 1246.

Simon asked for a tickets/projects revamp and, interrogated with options,
chose: master-detail with the board as the no-selection pane and the table
view RETIRED (the rail is the list); the full lineage bar including the build
chain (sub-ticket shows Ticket > Sub-ticket, issue shows Issue > Run > Part);
a real table.sub children table plus a creator that prefills from the parent
(NO progress rollup, depth stays 1); all four sanctioned UX fixes
(newest-first comments, the phone metadata fix, composer button order, the
jump bar); and the issue block moved into the main column.

What landed, in commit order: composer footer puts primary rightmost in all
six composers at once (one swap in composerHtml; threadHtml gained opts.lead
so the composer sits under the Comments heading of a newest-first thread);
fixtures got sub-tickets TKT-0037/0038 under TKT-0031 (browser suites had ZERO
parentId coverage); the children chip-row became table.sub.tksub;
openNewProject seeds from the parent incl. a max= cap on the due date;
lineageBar gained a projects branch via ticketLineage() with the node emitter
hoisted to lnNode/LN_SEP; the tkmeta details element is GONE (tkmain first in
DOM, grid-areas keep metadata visually left, phone reads discussion first —
the structural fix the old in-code note said to wait for); renderProjects is
now .mdsplit.tkouter with tkRailPlan() feeding both the painted rail and
tkIndexRows(); tkKeydown follows the shared contract; tkSections(p) drives a
per-kind FILTERED jump bar (digits index the same array) and woJump's body
was hoisted to core.js secJump().

Decisions worth keeping:
- **tkRailPlan() is ONE builder for body and rows.** Headers live only in
  entries with .head; a test asserts they can never enter tkIndexRows().
  Children attach under their parent only when the parent survives the
  filters; otherwise they float un-indented so a "late" filter can show a
  late child alone. Orphaned parentIds float too, never dropped.
- **The rail does not hide done tickets** (WO's archive argument), and the
  filter keys are tkOpen/tkLate/tkMine/tkDone, fresh per tab.
- **tksplit is decoupled from mdsplit** and carries its own grid + print
  rules. Required: the outer split's below-900 rules would otherwise cascade
  into the inner one. Do not re-merge them.
- **tkSections is a function, not a table**, because a ticket's shape varies
  by kind; the bar never shows a dead button and digits match the tooltips.
  A test walks every secnav button's anchor to an id in the same HTML.
- **.status pills are white-space:nowrap now** (app-wide): inside table.sub's
  overflow-wrap:anywhere cells a pill shattered one letter per line at 393.
  table.sub.tksub scopes word-boundary wrapping for team-typed text; the
  anywhere rule stays for the URL-bearing WO tables.
- view.projView is dead (navHere too). renderProjTable deleted.

Traps hit this round:
- The old test asserting the children table checked the raw ISO date; due
  dates now render via shortDate(), and the harness DOM stub has no
  getAttribute, so prefill assertions grep the modal HTML string instead.
- make_mockups.mjs crashes at the CFD stage in a worktree (untracked
  DP_22_variant.pdf, documented before); all 18 app mockups regenerate before
  it dies, so CFD/site PNGs were left at their existing dates on purpose.
- The mockup badge renumber: inserting ticket-detail as badge 10 bumped every
  later spec by one (schedule..scan are 11-18 now).

Still open, unchanged: the sanctioned list at the 2026-08-02 section
(lightbox thumb-reach/zoom, trash contrast, drawer close control), and the
amber collision (in-work on Parts vs on-hold on Tickets) which this revamp
did not touch.

Previous status follows.

Last updated: 2026-08-06 (later)
Status: **Work Orders became a master-detail tab, and the pane is ONE SCROLL
(2026-08-06).** Branch
`mold-drawing-revamp`. All suites green: test_app 377 (was 362), appui 1246
(was 1244), detailui 816 (was 781), designsystem 23, safearea 30, plus
print_mobile 14, labels 32, route 38, scan 50, q_landing 32, sanitize 55,
qr 69.

Simon asked for the Work Orders tab to feel like the rest of Build, and chose,
from options: WO stays its own tab; the rail gets a group/sort/filter control
defaulting to grouped-by-part; parts with zero runs appear with a "+ Start run"
row; rail rows show progress through steps; deep links land with the rail
visible and scrolled; identity, the lineage bar and blocking warnings stay
above the section bar (the toolbar does not).

The pane was built as in-pane SECTION TABS first, and Simon asked for the
scroll back the same day: on a traveler you read across sections constantly
(the stack while signing "Stack frozen", the BOM while checking what went in),
and a tab makes you leave one to see the other. So every section renders, in
one card, Steps first, and `.secnav` became a JUMP bar. What survived from the
tab attempt is the part worth keeping: a count per section and a dot when one
needs attention, both readable without going there.

What landed: `renderWOList()` and its flat seven-column table are gone.
`renderWorkOrders()` returns `.mdsplit` + `renderWOIndex()` + (detail or
`renderWOOverview()`), reusing Parts' rail markup wholesale so the ≤900
collapse and the print rule apply without new CSS. `renderWODetail()` is now
toolbar + lineage + `.wohead` + `.secnav` + every `WO_SECTIONS` body joined;
the six bodies are the old markup moved verbatim. New pure helpers
`woProgress`, `woFlags`, `isWoLate` sit beside `stepState`. `woKeydown` mirrors
`partsKeydown` and adds 1-6 to jump to a section.

Decisions worth keeping:
- **This rail does NOT hide finished records, unlike Parts.** A part drops off
  once it is made; a work order is a traveler you also read back, and every one
  of the 26 SN5 records is Complete, and a done-hiding default landed on an empty
  rail and read as a broken tab. Open/done are one chip each. There is a test.
- **The header states a cure hold as an ABSOLUTE ready time; only the step's
  own banner gets a countdown.** `syncHoldTick` arms its 60 s re-render on
  `#main .step .gate`, which keeps the step banner honest. The header is always
  on screen and deliberately does NOT get a countdown, or it would be the one
  thing on the page nothing refreshes. dashboard.js:162 made the same call for
  the same reason. Tested.
- **The jump bar is buttons, not `<a href="#wo-stack">`.** The URL hash carries
  the deep link to the record (syncUrl writes `#/WO-SN6-004`), and an anchor
  overwrites it, so the address bar stops naming what you are reading and a
  copied link lands on a section instead of the run. The OLD jumpbar did use
  anchors and did exactly that. `woJump()` scrolls instead; the
  `scroll-margin-top` rule on `#main [id^="wo-"]` clears the sticky bars.
- **Synthetic "no run yet" group headers are NOT in `woIndexRows()`.** That
  array is what j/k walks; a header in it would set view.id to a part id and
  silently drop the pane to the overview. Tested both ways.
- **Steps leads the scroll.** Partly the bench argument, partly that
  test_detailui's `wo-detail` and `wo-detail-edit` assert the page contains
  "inHg", which only appears in step titles.
- **Filters use woOpen/woLate/woMine/woDone, not Parts' fLate/fMine/fDone**,
  because setTab() clears the former and not the latter. A toggle left on in
  Parts would otherwise filter a different tab's rail.
- `partOf()` scans DB.parts, so grouping resolves every run once into
  `WO_PART_MAP` at the top of `woIndexRows()`. Deliberately NOT a cache with an
  invalidation key: the edges move whenever somebody confirms a name guess.

Traps hit on the way:
- **`.modal-actions` does not exist.** I wrote it, then grepped, found my own
  new line, and read it as precedent. test_designsystem catches undefined
  classes; the real convention is `.foot`.
- **A comment containing the string "has-sel" fails a test.** test_app:882
  greps the stylesheet text for any has-sel rule above the responsive block,
  and does not care that yours is inside a comment.
- **The lightbox gallery is now scoped to the open section.** `lbCollect` walks
  the rendered DOM, so arrowing through photos no longer crosses from a step
  note to the note thread. Accepted: the alternative is rendering hidden
  sections. This also unmasked a latent test bug: `renders` asserted
  `mainText > 20` against the lightbox's own caption ("bagged diffuser tool",
  exactly 20 chars), which had been passing only when a record happened to have
  enough photos to render the "3 / 7" counter. Now exempted, with `lightbox
  opened` as the real check.
- The clickable part name in a group header measured 14px and failed the
  coarse-pointer tap-target audit.
- **Rendering every section at once made the page scroll sideways at 1440**
  (1489px in 1440px), and the audit named no element because the culprit was a
  table's own minimum width. `table.sub td` had no `overflow-wrap`, so a bare
  120-character Drive URL in a BOM source, and an underscore-joined CAD
  filename in a quality actual, each set the min-content width of their table.
  Fixed on `table.sub td` for every tab. It had been invisible only because
  those two tables were never on screen at 1440 in a populated fixture.

Previous status follows.

Last updated: 2026-08-05 (later)
Status: **Cut lists that fill boards (2026-08-05).** Branch
`mold-drawing-revamp`, eight more commits, all suites green (test_app 359,
packer 24, slicer 38, appui 1244, detailui 781, safearea 30).

Simon: avoid unnecessary cuts and fill each board; balance that against
thicker boards meaning fewer glue lines; condense molds and stack plans
("there should only be an option to make a mold"); condense boards ("we only
care about xyz and density"). Then two corrections mid-flight: offcuts and
big boards are the same thing at different sizes, big ones just more valuable
because only they hold big blanks; and blanks must be round increments
because humans cut them.

Landed, in order: packBoard's recursion made pure; split order scored instead
of guessed (lexicographic, near the root only); board selection replaced by
`(consumed + optionLoss) / placedArea` — no tuning constants, encodes option
value directly; blanks rounded up to 1/2in; `kind: sheet|remnant` deleted
everywhere; the rack shown as one row per size; moldCost added to packer.js
and injected into planMold as `opts.score`; supply-aware candidates; "Why
these boards" on the plan page.

Traps worth keeping:
- **Utilisation is a misleading metric here** and I nearly shipped a plan
  built on it. A big sheet's remainder comes back to the rack as smaller
  boards; utilisation counts that as loss. The seed batch's "40%, 4 boards"
  was largely CORRECT behaviour. Watch cut count and glue joints instead.
  test_packer's regression floor says this in a comment.
- **The shortfall charge in moldCost is load-bearing.** packAll opens ZERO
  boards when nothing fits, so without charging for it an unbuildable stack
  scores as free and wins every time. Has its own CRITICAL test.
- **KERF_MM is exactly BLANK_QUANTUM_MM / 4** (1/8in vs 1/2in), so quantised
  blanks put every cut position on an eighth-inch mark. Change either
  constant and that property dies; there is a test.
- Board DOCUMENTS deliberately do not merge. A BRD- id is on a printed label
  stuck to a physical board. Grouping is display-time only.
- slicer.js must keep zero dependencies (test_slicer evals it standalone), so
  the cost function lives in packer.js and arrives as `opts.score`.

The mold/plan merge landed too: `currentPlanId` + `planHistory` on molds, one
`currentPlanFor()` (with a newest-by-ts fallback that must NOT be removed —
it is what makes this work on SN5 data with no migration) replacing three
duplicated scans, Stack plans off the rail, one `+ Mold` button that also
covers "record a mold with no CAD yet", and a Re-plan that supersedes rather
than deletes. `stackplans` stays its own collection on purpose: 900KB docs,
the Storage mesh path, and STK- deep links all depend on it.

End-to-end on the shipped code, both sample molds against the SN5 rack:
nosecone 3 layers -> 2 (8h clamp -> 4h), diffuser 5 -> 4 (16h -> 12h); every
blank a whole half inch and every cut position on an eighth-inch mark, e.g.
"Rip at 21.00in", "Crosscut at 13.50in". Pushed and deployed, verified live
by curl.

Deliberately deferred, the one piece of the approved plan NOT done: cut-list
execution — a "Mark these boards cut" action that decrements board qty and
writes leftovers back as new board rows. Left out because renderCutList()
runs on every render (including the Molds overview banner), so writing back
there would fabricate inventory from a hypothetical; it needs its own
confirm/partial/undo flow. `packAll` already tags every leftover with its
`boardId` for exactly this.

Previous status follows.

Last updated: 2026-08-05
Status: **Parts become the parent record (2026-08-05).** Branch
`mold-drawing-revamp`, four commits, all 15 runnable suites green
(test_app 331 -> 355).

Simon asked to mark the parts/work-order relationship properly ("we create the
part first, and track its children"), move Parts to the top of Build, and make
the layup stack fit the app's style while keeping its colour coding. He chose,
from three options each: part = spec / WO = as-built; part->WO one-to-many;
full mold wiring including drawings from the part.

What landed: Build is Parts -> Work Orders -> Molds -> Inventory. core.js gains
partRuns/partOf/currentRun/partMold/partPlan, each reporting HOW a link matched
("id" / "pointer" / "name") so the UI can offer a one-click Confirm that
commits a name guess to a real edge — the fix for 0 of 33 SN5 parts carrying a
link. linkedCounterpart keeps its name but is no longer symmetric. A lineage
bar (Part > Run > Mold > Plan > Drawings) sits on part, WO and mold detail.
Parts gains a Children section, a mold picker that finally WRITES p.mold (dead
but read by shop.js and labels.js since forever), and Drawings straight from
the part. The layup stack is now a table.sub like the BOM it sits above, with
--ply-* tokens (the old .plybar hex was theme-blind), a CF/Spread/Core/Mesh
text tag so hue is never alone, and in-place edit / insert / duplicate /
reorder / delete through one stackMutate() funnel.

Traps this round, all real, all cost time:
- **stackview.js already defines stackTable()** for the exploded tooling-board
  BLANK stack and loads AFTER core.js, so the obvious name silently overrode
  the new component and it never rendered. The layup one is plyTable().
  Two different things here are called "stack" — keep them apart.
- **Plies needed a uid.** saveField re-applies its mutator against fresh server
  data; append/pop were index-free, but edit/delete/reorder are positional and
  a raw index re-applied to a changed array edits the WRONG ply.
- **The drawing title block is a 2-row grid** (the brand cell spans both), so
  adding Part and Work order started a third row, grew the block, shrank the
  drawing area and made layer labels collide. Widened to four content columns.
  Adding a ninth field means removing one.
- **0 of 33 SN5 parts have a layup stack; 26 of 26 WOs do.** A part-owns-the-
  plan model shows "no plies recorded" on every SN5 part unless the run's
  stack stands in. Caught by looking at a screenshot, not by a test.
- **test_drawings has 9 pre-existing failures on main** (dimension/label
  collisions). They are invisible without Playwright installed, because the
  skip message reads exactly like a pass. Counts are identical to main
  fixture-for-fixture, so this branch adds none. Worth fixing separately.
- One deliberate behaviour change: the old "mirror is skipped when the link is
  ambiguous" test asserted a part matching two WOs by name mirrored to
  NEITHER. Under one-to-many both ARE its runs, so the plan goes to both. The
  ambiguity that still refuses is two PARTS sharing a name, now guarded in
  partRuns() and asserted directly.

Open for Simon: whether STAGE_MOLD (part) and MOLD_STAGE (mold record) should
be merged. Not synced here — different enums, different authors — the app just
says "one of them is out of date" when they disagree.

Previous status follows.

Last updated: 2026-08-04 (night)
Status: **Dashboard round three ships: the glance board (2026-08-04).**
Simon: too much space for too little, New activity overflowing its box,
keep the season graphic, Dashboard back above Tickets. Two design agents;
he picked the rethink. Now: a hero band (Assigned/Blocked/Late at the full
32px + money at its right end) over a three-column module grid (Up next
with folded quiet buckets; Season = parts bars + moldsStageBar, extracted
from moldsOverview; Week at RFS booked-only; Shop status = blocked + curing
+ inventory warnings as severity dots, one "All clear" line when clean; New
activity capped at 4). Fits 1440x900 projected, no scroll. The overflow bug
died structurally: the 3-col rail table (min-content > 304px box, raw email
token, nowrap phone rules, missing minmax) is stacked rows + whoLabel now;
regression test asserts a resolved name and no "@". Dashboard is TABS[0]
again with the explicit landing fallback kept. dashsplit/dashrail/
stationgrid/dashblocked/dashcuring CSS deleted; heroband/glance-grid/gmod/
srow/sdot added; phone hero is one row of three. Eyeballed 1440 light+dark
+ 393. test_app 329, appui 1244, detailui 781, designsystem 23.

Traps this round: the "keep lines 1-174" file split dropped DASH_BUCKETS/
dashSort/groupHead (they lived BETWEEN the row renderers) — restore before
wondering why nothing renders; the base .dashmoney width:100% outranks a
single-class override (use .heroband .hb-money); .dashseason .dg-more was
display:block so two footer links stacked as full-width rows until wrapped
in .ds-links.

Previous status follows.

Last updated: 2026-08-04 (evening)
Status: **Storage map + sidebar regroup + Schedule merge ship (2026-08-04).**
Simon picked, from three design rounds: the full location-first Inventory
(map of cards by site, contents pages, delivery wizard, §6 chemical chips,
Confirm-contents walk stamp), the grouped sidebar (Tickets top, Dashboard
still landing, BUILD/PLANNING/TEAM headers, hairline dividers in the rail),
and Timeline+Weekly Plan -> one Schedule tab behind a stations/week toggle.
Eleven visible tabs; items/lots/weekplan ids live on as hidden aliases
normalised by render() (the stock pattern, now used four times). Fields only,
NO rules deploy: BIN gains site/locKind/flam/walkedAt/By, lots gain
hazard/lowFlag, boards gain location; newShopRec(tab, cls, preset) births
located records; Kind changes touching BIN are refused (id prefix is what
scanning trusts); lotSource select finally offers "partial". labelLines gains
the BIN shelf-label branch; pubProjection resolves BIN- ids to shelf names on
public nameplates. New app/inventory.js (~370 lines + wizard).

Session traps: openLabelPreview inside the delivery wizard must be
try/caught (no QR vendor lib in the node harness, and a failed preview must
not read as a failed delivery — records are already saved); the harness
allocId fake now honors the class argument (it minted "undefined-" ids for
multi-class collections); design-system "every class defined" check flags
LITERAL classes only, so `pill ${dynamic}` passes where `pill Cancelled`
fails (.pill.Cancelled has no CSS rule; use OnHold for red).

Two things only Simon can do: walk the shop once entering real BIN records
with sites (the map is only as real as the shelves entered), and the standing
open items from HANDOFF.md. Team still not told about any of this.

Previous status follows.

Last updated: 2026-08-04
Status: **Stock and Molds merged into one tab (2026-08-04).** Simon picked the
Parts-style master-detail split from three agent-designed directions, with the
pipeline direction's auto-created mold record adopted and the entry named
"Molds". New `app/molds.js` (~430 lines) transcribes parts.js's split: a rail
of three groups (Molds / Stack plans / Boards), the selected record in the
pane, the season view when nothing is picked; j/k walk, `1` advances via
quickAdvance, `/` searches. Planning a mold now creates the MOLD- record at
"Designed" and writes `plan.moldId` + `plan.density`; old plans get lead-only
adoption actions on the plan pane. Boards got real detail pages, STK- ids
resolve to the plan pane, searchAll covers molds/stock/stackplans/items/lots,
the board label's "[object Object]" dims are fixed (formatter is local to
labels.js because test_labels mounts it without stock.js). The `stock` TABS
row survives hidden and render() normalises it, so #/stock, notifications,
scans and every test literal keep resolving; collections/prefixes/rules
untouched. renderShopDetail gained {embedded}; its bare output is asserted
unchanged (first-ever shop.js coverage). test_app 298 -> 309; appui 1252,
detailui 781+178, labels 32, scan 50, route 38, safearea 30, print 14 all
green. Mockups regenerated (molds + molds-overview, 20260804); READMEs say
thirteen tabs.

Traps from this session: the harness allocId fake had no "molds" entry and
minted "undefined-SN6-001"; SHOP_UNDO (a `let`) is invisible across the
test-harness eval boundary, assert via shopUndoBar() instead; the mvMount
double-mount risk is why the 3D viewer stays on the plan pane and the mold
detail only inlines stackSvg/stackTable/actions.

Previous status follows.

Last updated: 2026-08-03 (evening)
Status: **Documentation overhaul ships (2026-08-03).** Five commits: the
mockups are now annotated REAL screenshots regenerable with
`node tools/make_mockups.mjs` (23 of them, dated 20260803, covering all 14
tabs, labels, the scan nameplate, the CFD viewer's three views, the website
and the style guide in both themes); the top-level README became a newcomer
tour with a Getting started section and the testing essay moved to the new
`tools/README.md`; both app READMEs caught up with the app ("six tabs" is
finally dead); every section README gained its imagery and missing basics
(CFD try-it-now, website not-deployed banner, datasheet add procedure, first
Printables README); and `HANDOFF.md` at the repo root is the operator's guide
for Nick. No app code changed except `shoot_ui.mjs` ALL_TABS gaining
molds/lots/items and `tools/lib/browser.mjs` gaining .mjs/.pdf MIME entries,
so no deploy was needed or done.

Things a future session should know from this one:

- `make_mockups.mjs` waits on `__fixturesReady`, not `fb.state`; the stub
  races exactly as test_detailui documents, and the labels shot found no
  DB.molds until that changed.
- serveDir refused the CFD viewer's pdf.js: no `.mjs` MIME entry meant
  Chromium rejected the module worker. Fixed in browser.mjs.
- `ds-bundle/` and `.ds-sync/`, `07 CFD PDF Viewer/node_modules` and
  `DP_22_variant.pdf` are all untracked; a fresh worktree lacks them.
  make_mockups needs the playwright under `.ds-sync/node_modules` and the
  variant PDF, so in a worktree symlink/copy them in first.
- The survey claim that a `03 Work Orders/` folder exists at the root was
  wrong; nothing to add to the folder table.
- Em dashes are now zero in every swept README outside Simon's own signed
  intro and the Datasheets table idiom.

Previous status follows.

Status (earlier that day): **Printed labels ship (2026-08-03).** Stage 2 of the identification and
traceability plan: every physical thing can now be given a 4 x 1 inch label with
a QR that resolves to its record. New `app/labels.js` + `app/vendor/qrcode.min.js`,
label CSS appended to `print.css`, Label buttons on work orders and parts, bulk
builder under Reports. New suites `tools/test_qr.mjs` (69) and
`tools/test_labels.mjs` (32). Full suite green: 298 app / 988 app-UI / 490
detail-UI / 55 sanitizer / 23 design-system / 30 safe-area / 13 print mobile.
Not yet deployed, and the routing that makes the QR resolve to anything is stage 3
(see below) -- until that lands, a scanned code 404s.

## Labels: the four things worth knowing (2026-08-03)

**1. The number is 29, and uppercase is why.**
`HTTPS://FEB-COMPOSITES.WEB.APP/Q/MOLD-SN6-004` is 45 characters. In QR
alphanumeric mode that fits version 3 (29 modules) at error-correction level Q,
25% recovery. In byte mode the same string needs version 4 (33 modules) and only
gets level M, 15%. QR alphanumeric covers only `0-9 A-Z space $%*+-./:`, so one
lowercase letter, one `?utm=`, or a `#hash` route costs a version AND an ECC
level -- and the printed label looks identical, it just scans worse once it has
resin on it. `test_qr.mjs` asserts `getModuleCount() === 29` exactly. That single
assertion is the whole guard.

The same arithmetic caps an ID at 14 characters (47 - 30 host - 3 for `/Q/`).
Everything fits except a coupon, `PNL-SN6-006-C03` at 15, which is why coupon
labels are text-only -- and 12 mm tape could not hold a QR anyway (8 mm of print
height is below version 1 with a quiet zone). `labelHtml()` drops the QR rather
than silently printing a denser one.

**2. qrcode-generator does NOT auto-detect alphanumeric mode.** `addData()`
defaults to Byte. The plan assumed auto-detection and was wrong; a five-line node
check caught it before any code was written around it. Always pass
`'Alphanumeric'` explicitly.

**3. Three bugs the DOM could not see, and how each was caught.**

- *The sheet mounted and was invisible.* `mountSheet()` puts the sheet in
  `#printroot` but does NOT reveal it: the screen-side switch is
  `body.previewing #app { display: none }`, and every caller adds that class
  itself (`print.js:409`, `:422`, `drawings.js:1188`). Without it every DOM
  assertion passed -- element present, sized, `checkVisibility()` true -- and the
  user saw the page they were already on. Caught by looking at a screenshot.
- *The FEB tag clipped mid-glyph.* `overflow: hidden` was on the flex ROW, so a
  long footer cut the tag instead of truncating the text before it. Every
  "does anything overflow its cell" check passed, because the clip happened
  inside the row's own box. The ellipsis belongs on the text span. Caught by
  looking at a screenshot; now asserted three ways.
- *The QR could be a blank white square.* An `<svg>` with a malformed `d` passes
  `checkVisibility()`, reports a perfect box, and paints nothing. So
  `test_labels.mjs` rasterises each code to a canvas and asserts the dark-pixel
  fraction is 0.30-0.60 (a real code is ~45%, blank is 0%, a black box is 100%).
  **Pixels are the only honest check for a QR.** This is the SESSION-STATE
  "layout is not paint" lesson one level further on: paint is not correctness.

Separately, the codes were verified end to end by decoding them with jsQR, an
independent decoder, at 300 dpi: all five test IDs read back byte-identical. jsQR
is not a repo dependency, so that check was one-off rather than in the suite; the
in-suite guard is the path-to-module-matrix round-trip in `test_qr.mjs`.

**4. Two things that are constraints, not preferences.**
Label CSS lives in `print.css`, never `index.html`, because `downloadSheet()`
(`print.js:378`) fetches `print.css` and inlines it -- anything in index.html
vanishes from every saved sheet, and a saved sheet on a phone at RFS with no wifi
is the case that matters. And `labelSheetHtml()` must never reuse
`fitSheetHtml()`, `LAYOUTS` or `MAX_PAGES`: those exist to squeeze a work order
into two pages via a nine-rung ladder and mean nothing for a fixed grid.

## Scanning works (2026-08-03, stage 3)

`/Q/<ID>` -> `q.html` -> the public nameplate, and "Open in the app" -> `/#/<ID>`.
New: hosting rewrites, `app/q.html`, the `pub` rules block, `pubSync`/`pubPublish`
in fb.js, routing in core.js, "Rebuild scan mirror" under Reports. New suites
`tools/test_route.mjs` (37), `tools/test_q_landing.mjs` (30),
`tools/test_pub_rules.mjs` (29, emulator).

**The bug the routing test caught, which the plan had wrong.** `fb.state`
reaching `"ready"` does NOT mean the data is there: it means auth and the roster
check are done, and the collection snapshots arrive afterwards, each triggering
another render. The first implementation consumed the pending link on the first
ready render, found an empty DB every time, and dumped every scan into the search
box. It now waits up to `PENDING_GRACE_MS` (6s) for the record to turn up, with a
scheduled wake-up so the give-up path still runs if no further snapshot arrives.
The test deliberately waits out the real 6s rather than shortening it: a test that
shrinks the window passes against the broken version.

**Three more things worth keeping.**

- `fb.importMany()` cannot write the mirror. It stamps `updatedBy: <email>`,
  which the `hasOnly()` clause rejects AND which is exactly what must never be
  published. `fb.publishPub()` exists for that reason and adds nothing.
- `q.html` is a CLASSIC script, not `type="module"`. Dynamic `import()` works in
  both, and global scope is what lets the test drive `render()` directly instead
  of standing up a fake Firestore.
- A hanging request is the normal RFS failure, not a refused one: the wifi
  associates and nothing comes back. Without the 5s watchdog the page said
  "Looking this up..." forever. Caught by a test asserting the page eventually
  says something true.

**Deployed** to feb-composites.web.app, hosting AND firestore rules (the `pub`
block is new, so rules had to go too; that is the exception to `--only hosting`,
and it was verified with test_pub_rules against the emulator first).

**Verified anonymously against production**, which is the only check that counts
for a public read: `GET pub/<id>` returns 404 (allowed, just empty), while
`workOrders`, `parts`, `roster`, `budget`, `config` and `meta` all return 403,
`pub` list returns 403, and `pub` write returns 403.

**One bug only production could show.** q.html is served at `/Q/<ID>` by a
rewrite, so every RELATIVE url on it resolves one level deep:
`import("./firebase-config.js")` became `/Q/firebase-config.js`, which the same
rewrite answered with q.html itself. The import "succeeded" against HTML,
FIREBASE_CONFIG was never set, and every scan claimed "couldn't reach the
database" over a perfectly good network. The local test server registers exact
paths and has no wildcard rewrite, so it cannot reproduce this. Now guarded by a
source-level check: no relative src/href/import may appear in q.html.

**ACTION NEEDED, and only a lead can do it: `pub` is empty.** Nothing is
published until someone opens Reports and clicks **Rebuild scan mirror** once.
Until then every scan honestly says "No record with this ID yet". After that,
`fb.save()` keeps it current by itself.

The team has NOT been told about any of this; that is still an ask.

## Scan actions and lot capture (2026-08-03, stage 5)

New `app/scan.js`; lot fields added to the existing cure modal in
`workorders.js`; Move / next-stage buttons on every shop record; the lots print
on the traveler. New suite `tools/test_scan.mjs` (50).

**No scanning library is vendored, and that is a decision not an omission.**
Chrome and Android expose `BarcodeDetector` natively; Safari does not. jsQR or
zxing would be 200KB+ to close that gap for a browser whose OWN camera app reads
the code fine and lands on q.html. So: feature-detect, and fall back to typing
the code, which is why the ID is printed large on the label.

**Lot capture lives in the cure modal and nowhere else.** That modal is already
the moment somebody is standing at the part having just mixed resin, and already
asks what went in and when. A second prompt at the same instant is the one people
learn to dismiss.

**The load-bearing decision: "I don't know" is a valid answer**, recorded as
`lotSource: "unknown"`. A gate that can only be satisfied by naming a lot gets
satisfied by naming the WRONG one -- two jugs on the bench at 11pm, someone scans
the nearest, and the record is precise, confident and wrong. Fields are
default-and-confirm (pre-filled with the most recently opened lot of that class,
which under CS-011's one-open-container rule is the one on the bench), not blank
selects. `scanned` / `recalled` / `partial` / `unknown` are distinguishable, and
print on the traveler unflatteringly.

**A mobile regression I caused and fixed.** The Scan button was a FIFTH icon in
`.topbar .actions`. At a 320px viewport that took the document to 351px -- and on
mobile Safari a document wider than the viewport zooms the WHOLE PAGE out, it
does not scroll one element. Root cause is generic: a flex item's automatic
minimum size is its content, so `header.topbar h1` refused to shrink. Fixed with
`min-width: 0` + ellipsis on the title, which also cleared six PRE-EXISTING 320px
failures (dashboard, documents, weekplan, ticket-detail, budget-detail,
addgoal-modal). test_detailui went 676 -> 781 passing.

**The traveler's 2-page cap, measured.** Lot capture adds a line to every hold
step. Measured with and without it, the layout-rung distribution is IDENTICAL
(4,5,6,7,8), so it cost nothing. But note: the ladder is ALREADY pinned at its
tightest rung for the longest SN5 work order. That is pre-existing, so
test_print_mobile REPORTS it rather than asserting it (asserting would read as a
regression this feature did not cause). The next thing added to a step row has
nowhere to go, and the fix then is a real one, not another rung.

## The standards caught up (2026-08-03, stage 6)

Seven documents revised. CS-001 is **out of "outlined"** for the first time.

- **CS-001 Rev C** — the whole point. §7 written in full: printing and the
  calibration check, where each of thirteen object classes gets its label, the
  three mold identification layers, pair-print relocation for parts, what the
  label says per class, mixed-pot marking, the zero-cost packing-tape path and
  the printer-broke-before-comp fallback. §6 now carries the two keep-out rules
  (working surface, 40 mm from the flange seal band) plus a ban on
  silicone-adhesive tape anywhere in the shop. §5 no longer claims "nothing that
  needs ordering approval" — that stopped being true the moment a printer
  entered the plan.
- **CS-013 Rev C** — new §4.1, the ID grammar, which had no controlling
  document at all: the prefix table, four rules (an ID names a physical object
  never a job; never reused; a re-laid part is a NEW part with `supersedes`; a
  remachined mold keeps its ID), the 14-character cap the QR imposes, and dates
  as fields never ID segments. §7.2 gains lot capture and the mold record.
- **CS-003 Rev C** — glue-up mark in paint marker on two adjacent side faces.
- **CS-004 Rev C** — new §7.5 Identify, the last step after every wet operation.
- **CS-005 Rev D** — engrave the mold ID before releasing the vacuum, while the
  setup still exists. This is the record of record.
- **CS-011 Rev C** — §7.3's "can't yet enforce the storage map" is now resolved;
  locations are records with labels.
- **CS-002 Rev C** — the coupon suffix, and writing coupon IDs on the panel
  BEFORE the first cut.
- **CS-012 Rev C** — §7.8, the printer as a standing purchase request with the
  payback argument and why both the cheaper and dearer options were rejected.

The $5 finding worth repeating: **a standard Sharpie is IPA-soluble**, and the
process wipes with ≥90% IPA at every stage of CS-004 and CS-009. Every hand mark
in the shop is being erased by the shop's own cleaning step. Oil-based paint
marker, today, no approval needed.

Rebuilt with `tools/.venv/bin/python tools/build_docx.py --all`, manifest
refreshed (42 docs, 16 standards to PDF), `check_traceability.py` passes.

**Deployed and verified on production, on a 393px viewport, signed out:**
`/Q/MOLD-SN6-004` paints MOLD / MOLD-SN6-004 with no sideways scroll; the app's
sign-in wall holds the deep link (`PENDING_LINK === "MOLD-SN6-004"`), so signing
in lands on the record; no page errors. Anonymous reads of workOrders, parts,
roster, budget, config, meta, molds, items and lots all 403; `pub` get is
allowed and `pub` list is not.

**Everything in the plan is done.** Two things still need Simon, and only Simon:

1. **Click "Rebuild scan mirror"** once, under Reports, as a lead. `pub` is
   empty until then, so every scan honestly says "no record with this ID yet".
   After that `fb.save()` keeps it current on its own.
2. **Buy the paint marker.** ~$5, no approval needed, and it is the highest-value
   item in the whole body of work: every hand mark in the shop is currently
   being dissolved by the shop's own IPA wipe.

Also unasked and still outward-facing: the team has not been told about any of
this. And CS-001/013/002/003/004/005/011/012 are all "Draft, pending Lead
signature" — the Approver rows are blank, and CS-000 says a doc whose approver
row is blank is never Released.

Previously, in plan order: stage 4 (the `molds`, `items` and `lots` collections, and
the `localId()` fix that MUST land in the same commit -- it scans
`-SN6-(\d+)$` across a whole collection and will mint colliding IDs once one
collection holds several prefixes, and only on the offline path); stage 5 (scan
actions and lot capture); and the CS-001 Rev C / CS-013 Rev C standards work.

Previously: **Mobile layout fixed for populated records, re-landed after a
desktop regression (2026-08-02).** The first attempt shipped a CSS rule that
made the ticket page's whole left rail render blank on desktop; it was reverted
within the hour and re-landed without that one change. Read "The regression"
below before touching the ticket rail.

Previously: **Mobile layout fixed for populated records (2026-08-02).** Simon
reported that a work order with comments and linked documents runs off the side
of a phone, zooms the page out, and clips text. Fixed and pushed in three
commits; see the section below. New: `tools/lib/fixtures-content.mjs` and
`tools/test_detailui.mjs` (434 checks), plus `tools/serve_populated.mjs` for
touching the populated app in a real browser. **Deployed to
feb-composites.web.app and verified off the live host** (hosting only; no rules
change). The team has not been told — that is still an ask.

Before that: **Dashboard rebuilt (2026-08-02).** Before that: editable descriptions,
the photo viewer, buy-off evidence, sub-tickets on the board, the Mold CAD/CAM
part stage, and Simon's second round (swipe-to-close, a real Back button,
People, CAD uploads) — all complete and deployed. 298 app / 988 app-UI / 55
sanitizer / 23 design-system / 30 safe-area / 13 print mobile / 88 website, all
passing. Storage rules: 12 pass, 1 pre-existing emulator limitation.
`test_drawings` still fails 8/8 and `test_wo_rules` needs the Firestore
emulator on :8080 — both pre-existing.

## The regression: never fight <details> with CSS (2026-08-02)

Shipped, caught by Simon within the hour ("bricked the whole UI on desktop"),
reverted, diagnosed, re-landed without it. Worth reading in full because the
mistake was in the TEST, not only in the CSS.

**What it was.** To collapse the ticket meta rail on a phone I dropped `open`
from the `<details>` and added, at >=901px, `.tkmeta-fold > *:not(summary) {
display: block }` to force the content back. The summary is already hidden at
that width. Result on desktop: the rail rendered as blank white space —
assignees, watchers, related parts, documents, files, all gone, with no control
left to open them. Measured: 12 of 12 rail sections visible before, **0** after.

**Why the CSS cannot work.** A closed `<details>` skips PAINTING its content.
An author `display` only restores LAYOUT. On the broken build the rail children
reported `getBoundingClientRect()` of 345x18, `contentVisibility: visible`,
`visibility: visible`, `opacity: 1` — and the browser drew nothing.
`element.checkVisibility()` returned false, and it was the only signal telling
the truth. Second, independent problem: `display: block` also flattens the
children's own layout, and four `.stagerow` plus `.linkrow`, `.filegrid` and
`.gate` are all flex.

**Why the test passed.** The assertion I wrote for exactly this used
`kid.getBoundingClientRect().height > 0` as its definition of "shown". Height
was non-zero. **Layout is not paint**, and every hand-rolled "is it visible"
helper — including `vis()` in test_detailui.mjs — asks the wrong question.

**What now stops it.** `test_detailui.mjs` grew a `nothing unreachable` check:
any element with a real box that fails `checkVisibility()` AND sits inside a
closed `<details>` whose summary is also not visible. That is content hidden
with no way to reveal it, which is always a bug. Verified against the broken
build: it fails with `h3 "Assignees", div.stagerow "AR Ana RiveraDC Dana Chen"`.
The rail-disclosure assertion now uses `checkVisibility()` too.

**The process failure, which is the real lesson.** The change existed only to
alter DESKTOP behaviour and I reviewed only mobile: every screenshot, and all
four reviewer agents, looked at 393px. `test_appui.mjs` covers Tickets at 1440
but never opens a ticket. `test_detailui.mjs` opened it at 1440 but its other
checks are overflow/clip/height/tap-target, and a blank rail overflows nothing.
Its `renders` check uses `textContent`, which counts unpainted nodes.

So: **shoot and review both widths for any change, and especially the width the
change is FOR.** `tools/test_detailui.mjs --width 1440 --shots <dir>` does the
desktop half.

The rail keeps `open` at every width now. The phone cost (the thread starts
lower down) is accepted until it is solved by rendering the rail differently
rather than by overriding a browser primitive.

**Recurring trap, hit three times this session:** a backtick inside a JS
template literal ends the literal. It bit `documents.js`, `projects.js` and the
`AUDIT` string in `test_detailui.mjs` — every time it was prose in a comment
using backticks to quote code. Write those comments without backticks. The
`AUDIT` literal already says "no backticks below this line" and that is why.

## Mobile, with the fields actually filled in (2026-08-02)

Simon: open a work order with comments and documents on a phone, the UI goes
over the edge of the box, gets cut off, and the browser zooms out. Also text
clipping, and long messages splitting over many lines making elements too tall.

**Why the suite missed all of it.** `test_appui.mjs` audits eleven tabs at four
widths and passed clean. It never opens a record, and every fixture in
`lib/fixtures.mjs` carries `comments: []`, no `docs` and no `files`. An empty
thread cannot overflow. So the fix was two things: fixtures that populate, and
a test that opens things.

`tools/lib/fixtures-content.mjs` holds the hostile-but-real content: a bare
120-character Drive URL, an underscore-joined CAD filename, a 600-character
one-paragraph update, a pasted six-column table, a code block.
`tools/test_detailui.mjs` opens every detail page AND six overlay states
(lightbox, three modals, the composer with a draft, the drawer) at 320/393/430
plus 1440 as a control.

**What was actually wrong, in order of how much it mattered:**

1. Long tokens did not wrap. One pasted URL made the widest line ~680px, the
   document scrolled sideways, and mobile Safari fits the layout viewport to
   that. `overflow-wrap: anywhere` on team-written text. Use `anywhere`, not
   `break-word`: only `anywhere` shrinks min-content width, which is what a
   grid track sizes from — `break-word` looks fixed in a screenshot and still
   scrolls the page.
2. Grid tracks kept min-content as their automatic minimum. `.tkmeta` had no
   `min-width: 0` and the <=900 collapse used `1fr` rather than
   `minmax(0, 1fr)`. A populated ticket measured 1030px inside a 393px phone.
3. The Documents shelf built its own row markup with a bare `<span>` title
   instead of `docLinkRow`'s `.dl-t`.

**Then the numbers went green and the layout was still bad**, which is the part
worth remembering. Three reviewer agents looked at the rendered screenshots and
two independently opened with the same finding: `overflow-wrap: anywhere` in a
TABLE cell gives the cell a min-content width of one character, so instead of
overflowing into the scroller that already exists (`table.sub` has had
`overflow-x: auto` below 900px for ages; `.prose table` has `.tblwrap`), every
column collapsed to its narrowest form. A pasted pull-test table rendered its
header as C / o / u / p / o / n down the page and "5110" as "511 / 0". It
measured perfectly clean and could not be read. `overflow-wrap: normal` on
`td`/`th` after the anywhere rule, and the scrollers do their job.

Also from that pass: scroll cues on `.prose pre` / `.tblwrap` / `table.sub`
(the four-layer background trick, `background-attachment: local` for the covers
and `scroll` for the shadows, so the shadow shows only where content actually
overflows — no JS, cannot desync); the ticket meta rail had shipped hardcoded
`open` so it had never once collapsed on a phone; comment headers broke every
name across two lines; a long Weekly Plan goal left an orphaned checkbox on its
own line; `0 KB` beside a linked Google Doc; document titles get two lines on a
phone because the datasheet shelf is prefix-heavy and one line cut off exactly
the revision date.

**Two traps found in the harness itself**, both of the kind that make a test
lie. The fb stub sets `state: "ready"` on its first line, so waiting on it
measured a half-seeded database — wait on `__fixturesReady`. And measuring an
`<a>` that wraps a `<button>` reports the anchor's 14px line box, which called
every Open button in the app too small when none of them were.

**Fixture gotcha worth knowing:** `sanitizeHtml` sets
`ALLOWED_URI_REGEXP: /^https?:/i` on purpose, so a relative image src in COMMENT
markup is stripped to a bare `<img>` and renders as a broken image. A record's
`files` array does not go through the sanitizer, which is why those thumbnails
render. Comment photo fixtures must use an https URL; the browser tests route it
to a local PNG.

**One thing needs a real phone.** A wide table scrolls sideways in its own box,
and the affordance is now a styled 6px scrollbar. Headless Chromium draws an
overlay scrollbar that takes no space and never appears in a screenshot, so
whether it is actually visible on iOS is UNVERIFIED. If it is not, a wide table
on a phone has no scroll cue at all and needs a different answer. The reason
it is not the edge-fade shadow (which works and is in place on code blocks) is
that a table's own cells paint over it: header tint and zebra rows hid it on
some rows and not others, so it rendered as two grey smudges.

Still open from the reviews, all pre-existing and none of it the reported bug:
comment threads are oldest-first so the newest status is several screens down;
destructive trash controls are the highest-contrast thing on several rows; the
Weekly Plan car rows wrap three columns ragged at 393px; section headings carry
explanatory sentences that become the loudest text on a phone; the work order
detail is one 17-screen card with no section boundaries; the drawer has no
close control and 640px of empty space below the last nav item; the lightbox
puts every control in the top 55px, the hardest place for a one-handed thumb,
and cannot zoom a photo; primary/secondary button order flips between the form
modals (primary right) and the composers (primary left), so in the composers
the position muscle memory says is "confirm" is Cancel, which discards a long
note. Ask Simon before taking any of those on — they are design changes, not
fixes.

## Dashboard, round two — two columns (2026-08-02)

Simon's verdict on round one: "I like it, but there is now too much." Three
asks, all taken: the 33-cell part grid replaced by the three stage bars; two
columns on desktop; a different visual treatment per block.

**Split on ACT vs ORIENT**, which he picked from three options. Main column is
the two counts, what is blocked, and the list. Rail is this week, the season,
curing, new activity, money. Rail is sticky above 1101px, two-up between 701 and
1100, stacked below. Season bars count ALL parts (his choice), where the Parts
tab counts open ones — different question, so both label their denominator.

**A UI/UX reviewer agent went over the result** (ui-ux-pro-max + frontend-design
skills, real screenshots at four widths and both themes). It was worth it; most
of its findings landed:

- **The numeral hierarchy was inverted.** Tiles at 32px, group counts at 28px —
  a step too small to read as a rank, so a tile showing `0` outranked `6 LATE`.
  Now 22 vs 30, and the h2 that owns the list went to 24.
- **The list held five smaller cards.** Each bucket emitted a full `table.list`
  with its own border, shadow, radius and a repeated ITEM/WHO/DEADLINE band —
  three of the five groups had one row. Header now renders once (later ones stay
  in the DOM, visually hidden, because `labelListTables()` reads them to build
  the responsive `data-label`s), and the nested table chrome is gone.
- **`.dashseason` is a `<section>`, not a `.card`, so `.card h3` never reached
  it** and the heading fell through to browser default — ~17px sentence-case
  near-black beside a 12px uppercase muted one, in adjacent rail blocks.
- **Chip fills were outvoting the red.** Ten tinted row titles down the page beat
  six red dates for attention. Chips are plain links inside the list now; the
  tint returns on hover, where it means something.
- Rhythm was inverted (blocks 14px apart, groups inside a card 18px). Money block
  was orphaned on bare canvas once the rail stacked. `--fill` equals `--canvas`
  in light and `--surface-2` in dark, so the "recessed" panel had no edge.

Two specificity bugs of my own, both caught by looking at renders rather than
tests: `@media (min-width: 1500px) { .stat-row }` outranked `.dashtiles`, so the
tiles stretched to 600px each at 1920; then fixing that with `.stat-row.dashtiles`
outranked the phone rule and stacked them one per row at 393. Neither is
test-visible — both widths passed every assertion while looking wrong.

**Not taken:** the reviewer wanted the "Assigned to you" tile deleted as
redundant with the sentence below it. That is only true in the fallback state
where nothing is assigned to you; Simon explicitly chose two tiles. Kept. It also
wanted `.kind` raised from 10px — that is a design-system component on the type
floor's exemption list and used by every tab, so it is not a Dashboard decision.

## Dashboard rebuild (2026-08-02)

Simon asked for the landing page to be the most visually appealing in the app,
and for five agents to explore, argue, and converge before anything was built.
They did: design-system fidelity, competitive patterns, information
architecture, data visualisation, and mobile/shop-floor reality. The argument
round is where the value was — four of the five conceded a headline position.

**What the data settled, before any taste entered.** I checked the fixtures
rather than trusting the proposals, and three of the four proposed heroes were
blank on the team's own archive: all 11 schedule weeks have `weekOf: ""`, and
all 26 work orders are `retro: true`, which `blockerOpenBefore()` and
`holdState()` both refuse by design. A hero that renders empty on the only
reproducible state anyone can screenshot is not a hero. So the rule became:
**nothing that is empty on the fixture goes above the fold**, and the
always-populated things — a count, and the list — carry the top.

Also established: there is NO completion history in the model (no `completedAt`;
`updatedAt` is last-save-of-anything), no competition date, and no budget cap.
That kills burn-ups, countdowns and any meter with a denominator. And neither
brand token is re-pointed for dark — they fail in opposite modes (gold 1.78:1 on
white, blue 1.33:1 on the dark card), so neither can be a fill that works in
both themes. Logged as a design-system defect; not fixed here.

**The substance: one row per physical thing.** 25 parts carry a layup deadline
and 26 work orders carry a due date — 51 dated records describing 29 objects,
because 22 parts have exactly one same-named work order and no name is
ambiguous. Both explicit link fields (`partId`, `workOrderId`) are empty on all
59 records, so pairing runs through `linkedCounterpart()`'s name fallback, which
is what the Parts tab already trusts. "Behind schedule" was overstating by ~40%
in the largest type on the page.

**Structure now:** two tiles (assigned to you / blocked) as real `button.card`
at the full 32px Saira; conditional blocked / curing / watched / this-week
sections; one grouped list, first-match-wins so nothing appears twice; the
33-cell part grid (desktop only); a three-number footer rail. Gone: the three
near-identical tables, "At a glance" (four counts that duplicated the sidebar),
and "Season spend" (a total with no cap, no target and no trend — replaced by
unreimbursed, whose correct value is zero and who therefore needs no
denominator).

**Two bugs of my own, both caught by tests I wrote for the merge.** The flip
that hands a row back to the part when its traveler is Complete tested
`row.done` *after* mutating it, so it silently never fired. And mutating a
surviving row's `coll`/`id` mid-loop made it match the "is a part" guard on a
later turn, look itself up, and absorb itself — leaving the list empty. Only
reproducible with a Complete work order, i.e. every work order in the archive.

**The chip fix is the one that mattered most, and no layout depended on taste.**
`chip()` emitted a `<span onclick>` at ~22px — half a fingertip, and the only
route into a record from this page. The `pointer: coarse` floor names
`button/.icon-btn/.hamburger` and the form controls, never `.chip`; and
`test_appui.mjs` selected `button, a[href], select, input`, so the failure was
not merely uncaught, it was **invisible to the assertion**. `.chip` is published
in `components.css` as "accent-tinted, clickable" with no min-height, so this
was a defect in the design system faithfully reproduced by the app. Fixed in
`core.js` (now a `<button>`), in both stylesheets, and in `conventions.md`.

`test_appui.mjs`'s tap-target selector gained `#main [onclick]`. It immediately
found a second real failure nobody had reported: the Tickets kind filter
(All / Projects / Issues) at 31px, failing silently since it was written.

## Second round from Simon (2026-08-02)

**Swipe left closes the drawer.** Right opened it and left did nothing, so the
only way out was the X or the scrim. `shouldCloseDrawerFromSwipe()` beside the
open one, same 60px / `|dy|<|dx|` thresholds so the two directions feel like one
gesture. No edge zone on the close half, deliberately: opening needs one because
a rightward swipe mid-screen is how you scroll a board or page a photo, and
closing has no such competition.

**Back goes back.** `NAV_STACK` in `core.js`, pushed by `openRecord()`, popped by
`navBack(fallback)`. The Tickets toolbar button now names its destination
("Back to Undertray mold") and falls back to the old "All tickets" wording with
an empty trail. It is a stack rather than the browser's history because this is
one page with no URL per record — wiring `popstate` means inventing a URL scheme
for every tab first. `setTab()` clears it: the sidebar is "take me elsewhere",
not a step. Cross-tab by design, since the links are.

**People lists main tickets and issues.** `assignmentsFor()` drops sub-tickets
(`!p.parentId`); parts and work orders stay, which is what Simon picked when
asked — the ambiguity was whether "just the main tickets, and issues" meant
"drop parts and WOs" or "drop sub-tickets". At this altitude a parent and its
four children are one commitment, and listing both made the person who broke
their work down properly look like the busiest on the team.

**Native CAD uploads.** `storage.rules` gained `cadOk()`: STEP/STP/SLDPRT/
SLDASM/IGES/IGS/X_T/X_B/3MF/F3D/DXF/DWG/STL, 50 MiB, on `projects/` and
`parts/`. Both the extension AND the content type are checked — the extension
because a browser has no MIME type for `.SLDPRT` so it arrives as
`application/octet-stream` and allowing that alone allows any binary under any
name; the type because the real risk of a widened upload is the bucket serving
something the browser RENDERS (stored XSS), which is the same reasoning the
`stackplans/` rule already runs on.

`n.lower().matches(...)` rather than an `(?i)` inline flag. The emulator cannot
assert an ALLOW case (its simple-upload endpoint leaves
`request.resource.contentType` unset, so every contentType-gated rule evaluates
false there), so a regex flag that silently failed to apply would pass every
test and surface as a refused upload at RFS. `lower()` cannot fail that way.

**`storage.rules` WAS deployed this time** (`firebase deploy --only storage`),
because the rules themselves changed. Checked first, same discipline as the
2026-08-01 deploy: the test suite was run against BOTH the old and the new rules
and produced an identical result — 12 pass, 1 fail, the fail being the
long-documented `stackplans/` emulator limitation on a tree this change does not
touch. Four new deny cases prove the widening did not open a path: a `.step`
name does not make an unmatched path, the bucket root, or someone else's avatar
writable. The extension only ever relaxes the TYPE check inside trees that were
already writable, never the PATH check.

Not widened: `documents/`. Its uploader is the Documents-tab library, a separate
surface from the Files sections this was asked for.

## Four asks from Simon (2026-08-02)

Plan: `~/.claude/plans/a-few-things-description-jaunty-corbato.md`.

**Descriptions are comments that are always there.** `richField()` in `rte.js`
renders a value and swaps to the full composer when you click the text. Five
surfaces use it: ticket description, an issue's What happened, work-order
Notes, the part note, a purchase's Notes. Description and What happened are now
gone from the ticket edit form on purpose — one place to change each value, not
two that can disagree about which write lands last.

Two storage shapes, because the data has two. The ticket description was
already sanitized HTML. The other four are plain strings that something else
still reads (`print.js` prints `wo.notes` onto the paper traveler,
`statusGate()` blocks closing an issue on `whatHappened`), so those store markup
in `<field>Html` and keep the plain key in sync from `textContent` — the trick
`saveStepNote()` already used. Nothing was backfilled; a record with no
`<field>Html` still renders through the old escape-and-`<br>` path.

Found and fixed on the way: **`commentKeys()` was never wired to anything**, so
the "⌘↵ to post" hint under every composer had been promising a shortcut that
did nothing since the redesign. It lives in `rteKeys()` now, one implementation
for every composer, and it respects the upload-in-flight disable.

**The photo viewer.** The lightbox existed but only ever saw `.prose img`, so an
attachment could be uploaded and never looked at — the thumbnail was a dead CSS
background beside an `<a download>` that navigated out of the SPA and took any
unposted draft with it. Now:

- `[data-lbgroup]` on each detail page (ticket, part, work order, purchase) is
  the arrow scope, so "next" walks the Files grid and the comment photos as one
  set. `.cgal` and `.prose` remain as fallbacks.
- Attachment tiles are `<button class="thumb" data-lb-src>`, because the image
  is a CSS background and `querySelectorAll("img")` cannot see it. `lbCollect()`
  reads both kinds in document order.
- Three exclusions in `lbCollect()`: `.rte` (you are still typing it), `data:`
  (the 1x1 upload placeholder), and `.avatar` — the last one is new and only
  matters now that a group is wider than one `.prose` block.
- The download button now sets a real filename; a Storage URL used to save as a
  token with no extension.

Two live bugs the research turned up and this fixes. **A left-edge swipe over an
open lightbox opened the drawer behind it** — `inert` on `#app` does nothing to
a document-level listener — now guarded with `lightboxOpen()` at the touchend
listener, deliberately not inside the pure decision function. And **`#lb-dl` is
an `<a>`, so the `@media (pointer: coarse)` 40px floor (written for `button`)
never applied to it**: the download control rendered ~34px beside three 40px
neighbours. `test_safearea.mjs` gained a `lightbox` state, which it never had —
that is why neither was caught.

**What the review agent caught, after the tests were already green.** Worth
knowing that six suites passing did not mean this was done:

- The `document` fallback scope collected `#lb-img` itself (the viewer lives on
  `<body>`), and its src survived a close — so every set that fell back carried
  a ghost frame of the last photo anyone opened. Excluded, and the src is now
  cleared on close.
- **The download button did not download.** The `download` attribute is ignored
  cross-origin, and every photo is on `firebasestorage.googleapis.com` while the
  app is on `feb-composites.web.app`. It navigated the tab to the raw file
  (Storage serves `content-disposition: inline`), which is the exact lost-draft
  failure the viewer exists to remove. Now fetches to a blob and saves that;
  `cors.json` already allowed GET from the app origins for the Stock mesh fetch.
- The new coarse-pointer `display: inline-flex` outranked the UA's
  `[hidden] { display: none }`, so both arrows showed on every single-photo set
  on a phone. Invisible on a laptop, which is why desktop testing would never
  find it.
- `openLightbox` mapped "not in the list" to photo 0 via `Math.max(0, indexOf)`,
  so clicking a broken image opened an unrelated photo.
- `decodeURIComponent` throws on a bare `%`, before the src is assigned.
- Keyboard Enter on a `.cgal` photo dispatched a click whose target was the
  wrapping anchor, which has no `img` above it — so it missed the handler and
  followed the raw URL out of the app. Every gallery photo is a tab stop, so
  that was every photo. Pre-existing, but the viewer being the primary path now
  makes it matter.

**Evidence on a buy-off.** A signature recorded who and when but never what:
"Stack frozen" could be signed with an empty layup stack, "Mold design review"
with the CAD nowhere in the app. `needs` now sits in the step template's rule
object; `stepEvidence(wo, i)` is the pure answer driving the row banner, the
modal and the gate in `buyoff()`. Three checks: `stack`, `file` (an upload OR a
linked Drive doc — the CAD really does live in Drive), `note`. A lead can sign
without them and it costs a written reason that lands in the event log, the same
bargain as the cure-hold override.

A photo is **suggested, never required**, and only on steps that need a note —
the physical ones, where a photo is the measurement. Asking for a photo of
"Stack frozen" is asking for a photo of a decision, and a prompt that fires
where it makes no sense teaches people to dismiss the one that matters.

Work orders gained a real Files section for this. Uploads go to the existing
`projects/{id}/` storage tree on purpose: **`storage.rules` was not touched and
not deployed.** A `workOrders/` prefix would have meant a rules deploy — the one
thing in this repo that can lock the team out of their own data — to gain
nothing, since the record is roster-gated in Firestore either way.

**Part stages, added on Simon's say-so right after.** Exactly one stage value is
gated: CAD → "Mold CAD/CAM Done". The line drawn is that a stage is not a
buy-off — no signature, no name recorded, an undo bar underneath — so only the
value that is a claim about a FILE gets a gate. "Machining", "Sealed", "Layup
Complete" are claims about a physical object anyone in the shop can walk over
and check, and gating those would turn the fastest interaction in the app into
a form.

Evidence counts from the part's own docs or files OR its linked work order's:
they are twins, the mold CAD is one artifact, and refusing a part because the
drawing hangs off its work order would only teach people to attach it twice. A
lead override costs a sentence, which lands in the part's `commentLog` — a part
has no event log, but its authored note thread is one, and is what anyone
actually reads to find out what happened to it.

Parts gained a Files section for this, uploading to the existing `parts/`
storage tree. **`storage.rules` still not touched and not deployed.**

**Known limit, worth knowing before someone fights the uploader:** native CAD
cannot be uploaded anywhere in this app. `storage.rules` allows images, PDF,
Office and text, so a `.SLDPRT` or `.STEP` is refused by content type. That is
why every "the CAD" check also accepts a linked Drive document — the model lives
in Drive and what gets attached here is the drawing. Widening the rule would
mean a `storage.rules` deploy; not done, and not obviously worth it.

**Sub-tickets on the board and in the list.** `topLevel()` is gone. They were
filtered out of both planning views, which meant breaking a ticket down HID the
work. They get their own card in their own status column (a sub-ticket has its
own status, so nesting was never going to work on a board) with `parentLine()`
underneath, the helper the Dashboard and Weekly Plan already use.

## Comment redesign (2026-08-01, COMPLETE and deployed)

Plan: `~/.claude/plans/quiet-napping-beaver.md`. All four phases landed;
hosting is deployed.

`storage.rules` gained a `parts/` tree in phase 4 (there was none, and the file
ends in "no rule = deny", so a photo in a part comment failed silently at
upload). **Deployed 2026-08-01 with `firebase deploy --only storage`**, on
Simon's explicit go-ahead, separately from hosting.

Before deploying it: the change was confirmed purely additive (one new match
block, no existing rule touched), and `test_storage_rules.mjs` was run against
the emulator on BOTH the old and new rules to prove the one failing case
(`authed write of a non-STL content type to stackplans/`) is pre-existing and
an emulator limitation the test's own header documents, not a regression.
Afterwards, the live bucket was checked to still return 403 for an anonymous
write to `parts/` and to an unmatched path.

Note there is no CLI command to read released storage rules back, so
"deploy --only storage" reporting a successful release is the strongest
confirmation available short of a signed-in upload.

Simon's decisions: keep the comments array (no subcollection) with edit/soft
delete via `saveField`; drop `style` from the sanitizer and normalise on paste;
one command registry with two shells; roll the composer out to every note
surface.

**What the research overturned.** An agent argued the 1 MiB doc cap forced a
subcollection (~45 comments then bricked); recomputed, images are Storage URLs
so a long comment is 3-5 KB and the real ceiling is 150-250. A subcollection
would also have silently broken watcher unread dots, which key off the parent's
`updatedAt`. Another agent argued for a bubble-only composer; sent to check
mobile, it found Notion ships NO slash commands on touch and revised.

**`tools/test_sanitize.mjs` is the file to know about.** The old suite stubbed
DOMPurify with a regex that ignored the allowlist, so the sanitizer had zero
real coverage. Running the real vendored library in Chromium found two live
bugs immediately: `data:` URLs were being STORED as base64 in the ticket
document (a bricking vector, not "stripped" as the code comment claimed), and
`download` was silently dropped because a restrictive `ALLOWED_URI_REGEXP`
makes DOMPurify test non-URI attributes as URLs (fixed with
`ADD_URI_SAFE_ATTR`). Never assert allowlist policy in test_app.mjs; it cannot
see it.

**Architecture.** `rte.js` is the composer: one COMMANDS registry, three shells
(scrolling bar everywhere, selection bubble on `pointer:fine` only, "+"/slash
insert menu), the paste pipeline and `normalizePastedHtml`, plus the shared
`commentHtml`/`threadHtml` and `COMMENT_FIELD` map (projects->comments,
parts->commentLog, workOrders->noteLog). `.prose` in index.html is the single
long-form scope; `proseHtml()` in core.js decorates AFTER sanitising to add
`.tblwrap` and `.cgal`, because `class` is not allowlisted so authors cannot
ask for either.

**Traps worth remembering.** formatBlock needs the angle-bracket form ("<h2>"),
or it is a silent no-op in Safari. An empty contenteditable holds a bare text
node with no block, so editors are seeded with `<p><br></p>` or formatBlock has
nothing to convert. The gallery floor is measured, not chosen: a comment body
is 255px on a 393px phone once both cards take their padding, so anything above
~123px collapses to one column. A comment in a template literal must not
contain a backtick or the literal string "has-sel" (a test forbids the latter
above the responsive block). And a browser probe that sets `innerHTML` then
`textContent` silently discards the markup — they are the same content in a
real DOM and independent properties in the test harness.

## Google Docs / Slides linked to records (2026-08-01)

`03 App/app/gdocs.js` is the whole surface. Parses a pasted URL into
`{kind, fileId, openUrl, embedUrl}` — doc / slides / sheet / form / drive /
folder, with a `link` fallback so a non-Google URL is kept rather than refused.
One row renderer (`docLinkRow`) serves all five placements.

Five places: the **team shelf** at the top of Documents (pinned `documents`
records, `pinned:true`, `category:"Team shelf"`), plus `docs: []` arrays on
tickets, work orders, parts, and the week's `schedule` doc (that last one is the
meeting-deck slot).

**No auth, no API key, no consent screen, deliberately.** The app is
email/password (`fb.js` has no GoogleAuthProvider), so Drive Picker or Drive API
would put a second Google sign-in in front of every member. Verified in a browser
on 2026-08-01: the no-auth `og:title` scrape really does return the document name
(`docs.google.com` echoes our origin in `access-control-allow-origin`), and a
`/preview` iframe really does render inside `feb-composites.web.app` — the frame
attached and its body text was live spreadsheet content. Google publishes no
oEmbed endpoint; both candidate URLs 404.

Preview is collapsed by default and the "you're probably signed into a different
Google account" note under it is permanent, not an error state: a cross-origin
iframe fires no readable load or error event, so a blank frame is undetectable.

Reused `.docrow` / `.doclist` / `.docview` from the Documents tab, so the design
system needed no change (23/23 still green). New: `.doclink`, `.dl-t`, `.dl-cv`,
`.dl-prev` in the app stylesheet only, and `link` / `externalLink` /
`presentation` icons in core.js (none existed; the RTE's link button still falls
back to a raw emoji).

`allDocs()` had to carry `pinned` through its remap or the shelf renders twice.

## CS-008 Rev C (2026-08-01)

§5 gained a **FEB hold** column beside the datasheet demould figures, and a new
§5.1 saying which governs and why they differ. Status stays "Draft, pending Lead
signature" — Simon signed the cure numbers, not the standard, and CS-000 §4 is
explicit that a blank Approver row is never Released.

Pipeline is manual and both steps are needed: `tools/.venv/bin/python
tools/build_docx.py --all` then `python3 tools/gen_docs_manifest.py`, then
`python3 tools/check_traceability.py`. Neither tool has a per-document mode, so
every generated artifact churns; that is committed rather than partly reverted,
because reverting a PDF while keeping the regenerated manifest leaves the
manifest recording sizes that no longer match disk.

## Sub-tickets name their parent in flat lists (2026-08-01)

Inside the Tickets tab a sub-ticket is always drawn nested under its parent, so
context is free. The flat lists elsewhere had none: the dashboard's three
deadline tables, the Watched table, and the Weekly Plan rollup all showed
"Machine the plug" with nothing saying which mold.

`parentOf(p)` and `parentLine(parent, inline)` live in `projects.js` next to
`subTickets()`. The `.kind` tag reads "Sub-ticket" rather than "Ticket", and a
`.tny .muted` line under the title says "part of <parent chip>", clickable
through to the parent. `inline` exists for `.task-row` in Weekly Plan, where a
block element breaks the flex row onto its own line.

No new CSS class: `.tny` and `.muted` already existed. A dangling `parentId`
resolves to null and the ticket still renders, just without the line.

## Cure holds on work-order steps (2026-08-01)

Steps now carry a typed `rule` object: `{kind:"blocker"}`, `{kind:"startsHold"}`,
`{kind:"hold", from:"resin"}`. A hold reads the clock off the *previous* step's
`cure` record (resin, startedAt, tempC), captured in a modal when that step is
bought off. Locked until it elapses; lead override needs a typed reason and
writes one line into `wo.timeline`.

`isBlocker()` deliberately keeps the old `BLOCKER_WORDS` title match alongside
the rule field. Every record already in Firestore and all 26 retro work orders
predate the field, so dropping the title path would stop enforcing on the whole
existing database.

**The numbers are not the ones Simon first gave.** He asked for West 105 = 24 h
and IN2 = 48 h. The datasheets say IN2 + AT30 SLOW demoulds at 18–24 h @25 °C
(48 h appears nowhere; ≥14 days is full mechanical properties) and West
publishes no demould figure at all, only "cure to a solid, thin film 10–15 h
@72 °F" for 105+206. His numbers are *longer* than the datasheets, so they
survive as a deliberate FEB margin. `03 App/app/resins.js` holds both per resin
and the UI never presents one as the other.

**All six holds are now signed off** (Simon, 2026-08-01): IN2 SLOW 48 h, IN2
FAST 24 h, 105+206 24 h, 105+205 24 h, 105+209 36 h, XCR 12 h. The reasoning
is in the file header — they are shift boundaries ("tomorrow", "after the
weekend"), not multiples of the datasheet. The one that costs something: both
FAST systems hold 24 h, 3x their datasheet figure, so buying FAST hardener to
turn two infusions round in a day no longer works. That is the line to change
if the trade stops being worth it, and it is one number.

`resinTableProblems()` now refuses both a hold below its datasheet figure and a
hold with no `febBy`, so a new resin can't ship with a placeholder. A
lead-editable table via `fb.getConfig`/`setConfig` is the obvious next step and
is still not built; changing a hold means editing the file and deploying.

Temperature is recorded and displayed, never computed with. The team cures
ambient with no oven, and no coefficient in this repo would justify the
arithmetic.

Traps: `.step` is a flex row, and on a 393px phone the buy-off button took half
the width and squeezed the notice to two words per line — fixed with a wrap in
the 640px block. The Documents manifest is fetched lazily, so `openDocument()`
straight from a work order finds an empty manifest; `openDatasheet()` switches
tab, calls `loadManifest()` and polls briefly. The design system needed no
change at all: the notice reuses `.gate` and `.step-badge`.

## Timeline: "+ Add week" did nothing (2026-08-01)

Simon reported the button as dead. It wasn't: `newWeek()` wrote `weekOf: ""`,
and `renderTimeline()` files undated weeks under the "SN5 archive" card, which
is collapsed by default. The doc was saved every time; nothing on screen
changed, stat tiles included, because all four count dated weeks. Underneath
that, `updWeekDate()` had never been wired to anything, so a week's date could
not be edited at all and the eleven imported SN5 weeks could never be dated
into the grid.

Now: a new week is dated to the Monday after the last scheduled week (this
week's Monday when the schedule is empty), skipping any Monday already taken;
the week header's date is a button that opens a date picker; any day picked
snaps to that week's Monday, because `weekDates()` in weeklyplan.js builds its
seven day columns by adding 0..6 days and a Thursday there silently makes the
week run Thursday to Wednesday. Duplicate Mondays are refused.

The trap worth remembering: on a wide screen `.tl-wk` is `display: contents`,
so the section has no box and `getBoundingClientRect()` on it returns all
zeros. Anything that measures a week column has to measure its `.tl-wkhd`, the
way `jumpToThisWeek()` already did.

Also corrected: the ShopSabre booking note said the machine is at Jacobs. The
ShopSabre is at RFS and is booked on the RFS/RSO site; the Jacobs Shopbot is
the older machine we would rather not use, so the note no longer names it.
`05 Printables/printables.html` still carries a "Shopbot (Jacobs) fallback"
footer, which is accurate but leans warmer on that machine than current
practice does. Left alone: it tracks CS-005 Rev B, so changing it means a
revision bump. Simon's call.

Deployed to https://feb-composites.web.app, `--only hosting` (the rules files
were untouched). Verified live by curling `timeline.js` off the host rather
than trusting the CLI. No Firestore field keys changed, so nothing migrated and
a rollback is redeploying an earlier commit. The team has not been told.

**New standing rule, working rule 4 in `CLAUDE.md`:** deploy hosting whenever a
section of app work is complete. Simon made it standard on 2026-08-01 rather
than something to offer each time. It overrides rule 3's confirm-before-
outward-facing for that one target and nothing else.

See "App UI/UX audit" directly below for the previous session.

Earlier: **Mold Stack Planner phase 1 built, not yet committed.** Branch
`mold-sheet-stacking-app`. Board inventory + STL slicer + exploded stack view.
Tests: 90 app, 27 slicer, 73 rules — all passing. Design doc:
`~/.gstack/projects/Jinxiewinx-feb-composites-applications/simonstarbuck-chisinau-design-20260724-190934.md`.
Plan: `~/.claude/plans/b-polymorphic-hippo.md`.
(Prior motorsport UI revamp + dark mode + PWA logo COMPLETE and deployed — see below.)

## App UI/UX audit (2026-07-31)

Simon asked for a UI/UX audit of `03 App/app/` against `06 Design System/`,
flagged Timeline as needing an overhaul, and asked for the browser window and
the phone screen to be used better. Seven commits on main, `97d90ae` through
`51294c6`. Plan: `~/.claude/plans/generic-percolating-tiger.md`.

**Deployed** to https://feb-composites.web.app on 2026-07-31, `--only hosting`
(firestore.rules and storage.rules were untouched by this work, so they were
deliberately left out of the deploy). Verified live: tokens resolve, brand font
loads, no console errors, no horizontal overflow. The Firestore field keys did
not change, so nothing migrated and a rollback is redeploying an earlier commit.
The team has not been told; `#composites` has had no message about it.

**Read this first if you touch the app's CSS.** `06 Design System/` was
extracted FROM `index.html`'s `<style>` block, not imported by it. Two copies of
one design, and `tools/test_designsystem.mjs` is now the only thing holding them
together. If it fails, the fix is nearly always in the app: 06 is the published
copy the website and claude.ai/design both read.

**The harness had been lying again.** `loadChromium()` only checked ancestor
`node_modules` and the global npm root. The repo's only playwright is at
`.ds-sync/node_modules`, a SIBLING of `tools/`, so every browser test printed
"not installed" and exited 0 with zero checks run. Second instance of this class
after `77011b7`. Fixed with an explicit third candidate. Keep
`.ds-sync/package.json`'s playwright matched to the cached chromium build
(1.58.0 to 1208 today) or it launches and reports a missing executable.

New tools:
- `tools/test_designsystem.mjs` — token and component drift, no browser, ~1s.
  Also checks the CSS parses, which caught a real bug immediately: an
  unterminated comment silently ate the rule after it and a fix looked applied
  while doing nothing.
- `tools/test_appui.mjs` — 988 checks. 11 tabs x 4 widths x 2 themes.
- `tools/lib/fixtures.mjs` — demo records for the four collections with no SN5
  archive. Without them five of eleven tabs photograph as empty states.
- `shoot_ui.mjs` gained 1920, the fixtures, and `--tab all`.

Landed:
- Design-system drift fixed both ways (app radii/backgrounds/shadows; 06's own
  hardcoded `.toast` and `.modal` shadows). Style guides regenerated.
- `main` 1180px to 1600px, fluid Parts rail, a >=1500px breakpoint, sidebar
  collapse-to-rail. 27% of a 1920 monitor was empty on every tab.
- Tap targets scoped to the control instead of to two container classes.
  Weekly Plan's goal checkboxes were 15px on a phone.
- Timeline rebuilt: transposed to stations-as-rows to match the mockup it was
  designed from, week cards on a phone, modal + undo instead of a global edit
  mode. See `fde8757` for the full reasoning and the three traps it surfaced.

### Reviewed, and what was deliberately NOT done

Two review passes ran: the `simon` persona on the Timeline design, and a
screenshot reviewer on 22 of the 88 sweep frames against
`.claude/agents/ui-reviewer.md`. Everything they found that was broken is
fixed and pushed. These are the calls left open, each one somebody else's to
make.

**Needs Nick's decision (data model).** Post-process and clear coat are real,
recurring, capacity-consuming RFS work — `sn5-schedule.json` W06, W07, W08 and
W11 all carry it — and it currently lives in Timeline's free-text `other` row
rather than being a bookable station. Same argument for a press row for forged
parts. Adding either means a new field on every `schedule/{weekId}` doc, which
is a live-database change, not a UI audit's to make. The downdraft table is
reservable too (#composites 2026-02-26), which strengthens the case.

**Needs a design call, not a bug fix.**
- Parts prints the same four counts twice: the filter chips (12 OPEN / 4 LATE /
  0 MINE / 21 DONE) and the KPI tiles beside them. The chips are the better
  version because they also filter. Dashboard has a milder version of this.
- Work Orders card-stacks below 900 where the 7-column table would still fit,
  and a phone card spends six rows on what needs four. ~6760px for 26 records.
- Stock spends three labelled rows on one string ("96 x 48 x 1.5"), and its
  delete button is the most saturated thing on the page.
- Reports wraps a ~500px text column in a 1600px card, colours the four layup
  stages all the same pale blue where Parts colours them grey/amber/green, and
  renders as plain text the same two deadline records Dashboard renders as
  links.
- Numeric columns (Budget cost, Stock dimensions) are left-aligned, so decimal
  points do not line up.
- Two colour collisions across tabs: purple means "retro" on Work Orders and
  Timeline but "offcut" on Stock; amber means "under way" on Parts but "on
  hold" on Tickets.

**Timeline follow-ups.** `delWeek` is the only write in the tab with no undo. A
Monday meeting assigning ten cells pays a full modal round trip each time
(auto-advance, or a searchable part picker, would fix it).

**Smaller open items.** `.modal-backdrop`'s scrim is the one literal colour left
in `components.css`; there is no `--scrim` token and adding one changes the
published vocabulary. The design system claims to cover spacing but defines only
radii, which is why the remaining inline `style="margin-top: 8px"` glue in
weeklyplan.js and projects.js has no class to become. And
`03 App/app/README.md` still describes Tickets as "Projects ...
Backlog/Active/Blocked/Done", two names and four statuses out of date.

## Design System extracted into `06 Design System/` (2026-07-31)

**Update, later the same day: it is now actually synced.** See the section
directly below. The rest of this section is the extraction that made that
possible.

Simon asked (via `/design-sync`) to create a design system from the app's style.
The repo has no component library or build for design-sync to consume, so instead
of syncing to claude.ai/design I extracted the app's existing visual language
into a reusable, documented package.

New folder `06 Design System/`:

- `tokens.css` — every design token (color light/dark/print, type, radius,
  shadow, motion), lifted faithfully from the `<style>` block in
  `03 App/app/index.html`. Single source of truth.
- `components.css` — the reusable primitives built on the tokens (buttons, forms,
  cards, `table.list`, pills/stages/chips/kinds, the 6-state `.status`, gates,
  kanban, sidebar + gold speed-slash, topbar, tiles, avatars, toasts, modal).
- `styleguide.html` — self-contained living style guide (fonts inlined as data
  URIs), light/dark toggle, renders the whole system. `styleguide.artifact.html`
  is the wrapper-less copy for publishing as a claude.ai Artifact.
- `build.mjs` — regenerates both style-guide files from the canonical CSS.
- `fonts/` — copies of Inter + Saira variable woff2.

Verified in headless Chromium (both themes, no console errors). Artifact
published: https://claude.ai/code/artifact/66ebc486-a980-4f77-a082-5a1bcb08b2d7

The app is still the source of truth for anything not yet lifted into
`components.css` (deep app-specific patterns: parts master-detail, meshview,
timeline grid, weekly-plan carpool, drawings). If those are wanted in the system
later, lift them from `index.html` into `components.css` and rerun `build.mjs`.

## Design System synced to claude.ai/design (2026-07-31) — DONE

Project `44c1cc89-0249-4155-a305-c55aff0a7bac`,
https://claude.ai/design/p/44c1cc89-0249-4155-a305-c55aff0a7bac. Committed and
pushed as `1e37f97`.

Synced as a **styling layer, not components.** The converter wants a React
package; this system is plain CSS, so it runs the converter's tokens-only path:
styles.css, tokens, both fonts, empty `_ds_bundle.js`, no component cards.
Simon chose this over authoring a React wrapper library, which would have been
code with no consumer in a repo that has no React.

Because there are no component cards, `.design-sync/conventions.md` is the only
place the design agent learns the class vocabulary. It enumerates all 70 classes
and the token families. **All of it was verified against the built CSS.** If a
class is added to `components.css`, add it there too or the agent will never use
it.

Re-run: `/design-sync` from the git root. `.design-sync/NOTES.md` has the
staging quirks (react needed despite no JS; `@font-face` must be split out of
tokens.css or the brand fonts silently fall back; playwright must match the
cached chromium build, currently 1.58.0).

Found and fixed along the way: `06 Design System/README.md` documented a
`--warn` token that does not exist.

## Team website built in `08 Website/` (2026-07-31) — DONE

Commit `77011b7`. Home page plus seven secondary pages, from the design handoff
Simon dropped in (`08 Website/design_handoff_team_website/`, kept as delivered).
Plain HTML + one CSS + one JS, no framework, matching `03 App/app`'s pattern.
Not deployed: `firebase.json` points at a hosting site that does not exist yet.

**It links the repo's own design system.** `08 Website/build.mjs` copies
`06 Design System/` into `site/_ds/feb/` (generated, gitignored). Verified
byte-identical to the handoff's bundled copy and to the claude.ai/design upload,
so all three agree and `06 Design System/` is the one source.

Two deliberate extensions in `site.css`, both token-based: `a.btn.gold` /
`a.btn.primary` (the DS scopes variants to `button`, so anchors need them
restated) and the `table.list` phone collapse (the DS README says that rule
belongs to the consuming app).

The nav and footer are copied into all eight pages. They carry
`<!-- shared:nav -->` markers and `build.mjs` fails on drift, so it cannot rot.

`node tools/test_website.mjs` — 88 checks, all passing.

Left for a human: photos are all placeholders, the `join.html` form posts to a
mailto, the logo is CSS not a real mark, and the copy is the handoff's rather
than reviewed.

## Open finding: `tools/test_drawings.mjs` fails, 8 of 8 molds

Surfaced 2026-07-31 while building the website, **not caused by it.**

`tools/lib/browser.mjs`'s `loadChromium()` only read the named `chromium`
export. That exists on a global Playwright install (`index.mjs`) but not on a
local one (CJS `index.js`, where it hangs off `default`), so a local install
returned `undefined` and read as "Playwright not installed". `test_drawings`,
`test_print_mobile` and `test_safearea` were all silently skipping. Fixed in
`77011b7` to check both.

With the tests actually running, `test_print_mobile` (13) and `test_safearea`
(27) pass. **`test_drawings` fails all 8 molds** with `text-on-text` findings:
dimension labels overlapping each other on sheets 2–4, 19 to 40 findings per
mold. That is in `03 App/app/drawings.js` and predates all of today's work.
Nobody has seen it because the test never ran.

Not investigated. Next session: run `node tools/test_drawings.mjs`, and decide
whether the overlaps are a real regression in the dimension-label layout or the
checker being too strict about label bounding boxes.

## Safe areas — the notch, the Island, the home indicator (`index.html`, `print.css`, `core.js`)

Reported: opening the engineering drawings on a phone put the print toolbar
under the Dynamic Island.

**The cause is a deliberate choice, not an oversight.** `viewport-fit=cover` +
`display: standalone` + `black-translucent` mean the app draws edge to edge, so
the navy topbar meets the island like a native app. Simon confirmed he wants
that. The price: **every element at a screen edge owns its own inset**, and only
two did.

**Two rules, and they are the whole of it:**

1. **Use `--sa-t/-r/-b/-l`, never `env()` directly.** The tokens are declared in
   `:root` from `env()`. The indirection exists because `env()` cannot be faked
   in headless Chromium but a custom property holding it *can be overridden* —
   which is the only reason `tools/test_safearea.mjs` can measure a simulated
   iPhone instead of grepping the stylesheet for the string `env(`.
2. **Anything sticky under the topbar offsets from `--topbar-h`**, measured by
   `syncChromeMetrics()` in core.js. The topbar's height depends on `--sa-t`, so
   `top: 62px` is correct on a laptop and puts the element *behind* the bar on a
   phone. That is exactly how the Parts undo bar shipped, and it is invisible to
   both screenshots and geometry checks — the element is on screen and perfectly
   laid out, just underneath something opaque.

**Insets go on the BASE rule, not inside a `max-width` block.** A landscape
iPhone 15 Pro Max is 932 CSS px — wider than the 900px breakpoint — so it takes
the desktop rules while still having a 59px island down one edge. That profile
is in the test for exactly this reason and it caught two real bugs the two
obvious profiles missed.

**The topbar's ⋯ swap is measured, not a breakpoint.** Whether the account row
fits depends on width, on role, on name length *and* on the side inset; a media
query can read the first and not the last. `syncChromeMetrics()` measures in the
expanded state, then sets `body.tb-overflow` — one pass, no oscillation.

The print toolbar's own background grows up into the inset rather than being
pushed below it, so the island sits on solid `#22262c`. `#printroot.preview`
therefore has no top padding; that gap is `.pv-bar`'s `margin-bottom`. print.css
spells the fallback `var(--sa-t, 0px)` because `sheetFileHtml()` inlines it into
a standalone saved file with no `:root`.

Beware: `test_safearea.mjs` is one big template literal — **no backticks in its
comments**, same trap that bit `test_drawings.mjs`.

## Parts tab revamp — and a way to review UI (`parts.js`, `tools/shoot_ui.mjs`)

Reported: "I like the progress bars, but it's a little cluttered, and when you
click into a part, the interface kinda sucks."

**The clutter was duplication, not density.** Each of the three stages was drawn
twice — a coloured pill *and* a bar under it, same value. 12 rows × 3 stages = 36
saturated badges, so nothing was emphasised and nothing read. On a phone that
became ~7000px of scroll for 12 parts.

**There was also a real bug nobody had seen.** `STAGE_MOLD` starts with
`"N/A (Flat)"`, so `"Not Started"` sat at index 1 and `stageClass` returned
`st-mid` → amber. Every un-started mold rendered as in-progress while every
un-started CAD rendered grey — in the one column a lead scans for "what hasn't
been touched". **Progress colour is now derived from what a value means, never
from where it sits in an array.** If you add a stage enum, do the same.

**Process, worth repeating.** Four complete redesigns were built in parallel git
worktrees from one shared contract, then scored by `.claude/agents/ui-reviewer.md`
against rendered screenshots: a tightened table (3.63), a pipeline board (3.00), a
grouped list with inline steppers (3.25), a master–detail split (4.63 — the only
pass). The split won and shipped, but the decisive move was **transplanting the
board variant's stage stepper into it** — the winner's one weak axis was
interaction cost, and a loser had solved exactly that. Build several, score them,
then merge the best ideas across; do not just pick one and discard the rest.

**What shipped.** Above 900px, an index of every part beside the selected one —
`view.mode` stays authoritative, so `openRecord()` from a chip, ⌘K, Dashboard or
Timeline needs no special case, and the ≤900 collapse is one CSS rule. `↑↓`/`jk`
walk the index, `1`/`2`/`3` advance the three stages. Each stage is a row of
clickable steps with no edit mode (5 interactions → 1). Forward one step writes
and leaves a sticky undo; backwards, →`N/A (Flat)`, or skipping steps confirms
first and names what it would skip — this is a live shared database, so the
*surprising* directions are the gated ones. Touch targets clear 34px at 393px by
moving the stage label above the steps, not by shrinking them.

**`tools/shoot_ui.mjs` is a camera, not a test — leave it that way.** It asserts
nothing. Everything else in `tools/` asserts on strings, numbers or laid-out
geometry, and the Parts tab passed all of it while drawing every fact twice and
lying about colour. Some failures are only visible by looking. It resolves the
app relative to itself, not the cwd, so it photographs whichever worktree it runs
in — that is what made the four-way comparison possible, and it's why it must not
be "tidied" into using `process.cwd()`.

Things the reviewer caught that a human reading the diff would not: the losing
board variant painted `"Not Started"` green with a checkmark (a fresh instance of
the very bug being fixed); the grouped-list variant's one-click stage segments
were ~10 CSS px wide at phone size *and were live writes to shared data*; and the
winner's undo bar was rendered at the top of the tab, so on a phone it appeared
off-screen at exactly the moment it was wanted.

## Printing on a phone (`print.js`, `print.css`)

Reported from real use: printing a work order "kind of breaks the UI" on mobile.
It did. A sheet is 8.5in — **816 CSS px** — because *this is exactly what prints*
is the whole promise of the preview. On a 390px phone the browser blew the layout
viewport out to 816px to contain it, so the traveler's Initial and Date columns
sat off the right edge with no way to reach them, and the app went with it.

Two halves:

- **Fit, don't reflow.** `--pv-zoom` shrinks the sheet to the screen (never
  enlarges it). Reflowing would make the preview a different document from the
  paper, which is worse than not having a preview. It is `zoom` and not
  `transform: scale()` on purpose — zoom shrinks the element's LAYOUT box, so the
  overflow actually goes away and the scroll height comes out right; a transform
  leaves an 816px box behind it and a tall gap underneath. **`@media print`
  forces `zoom: 1`**, or the sheet prints at whatever fraction the screen needed.
- **Save to the device.** A "Save" button writes the mounted sheet as a
  self-contained HTML file — markup plus the stylesheet inlined, preview chrome
  stripped. Not a PDF: a PDF needs a library and this app ships no external
  scripts. Print still reaches a real PDF, because both iOS and Android offer
  *Save as PDF* in their own print dialog.

Smaller things that were also part of "breaks the UI": the toolbar wrapped onto
three rows and ate a tenth of the screen (phones now show Close / Save / Print
and nothing else — the title, caption and B&W proof are desk furniture), and tap
targets were sized by a **width** breakpoint, which left an iPad's controls 19px
tall. They key on `(pointer: coarse)` now.

`tools/test_print_mobile.mjs` is the guard: it boots the real app at four device
widths, opens all three printable documents, and checks fit, reachability, tap
size, close-restores-the-app, and that the screen fit never reaches the paper —
plus that the saved file is genuinely self-contained. Shared Playwright plumbing
for it and the drawings test lives in `tools/lib/browser.mjs`.

## 3D viewer: pinch to zoom on a phone (`meshview.js`)

Reported from real use: pinch did nothing on mobile. It was never implemented —
the viewer tracked a SINGLE drag point, so a second finger overwrote the first
and a pinch came out as an orbit. Zoom was bound to `wheel` only, and a
touchscreen pinch fires no wheel event (a **trackpad** pinch arrives as a
ctrl-wheel, which is why the desktop path never noticed). The canvas already
sets `touch-action: none`, so the browser's own pinch was suppressed as well —
between the two, the gesture did nothing at all.

Now `mvGesture()`: a pure pointer state machine, one finger orbits, two pinch,
with the camera work left to the thin glue in `mvBindEvents`. Same split the
rest of the file argues for, and here it earns it — the defect was in the
gesture logic, so the gesture logic is what the node tests can now reach.

Two things only a real phone shows, both pinned by tests:

- Lifting one of two fingers must **re-anchor** the orbit on the finger left
  behind. Measuring the next move from the finger that went away flings the
  model by the whole gap between them.
- **`pointercancel` must be handled like `pointerup`.** The browser cancels
  whenever it takes a gesture over; a pointer never cleaned up stays "down" for
  the life of the viewer and the model spins on the next unrelated touch.

`clampDistance()` is now the single place the zoom limits live, so the wheel and
a pinch cannot disagree about how far the camera may go.

Verified with real multi-touch (CDP `Input.dispatchTouchEvent`, mobile context):
spread 911→455 and pinch 455→1822 with yaw unchanged; on the old code the
distance never moved and yaw span 1.2 rad instead.

## Mold Stack Planner — engineering drawing set (`drawings.js`)

The plan page had two views and both answered the same question — *does the mold
fit inside the blocks?* Nobody had answered the one the person GLUING has: the
boards go on by hand, so you stand at a table with a tape and need to know how
far in from each edge of layer 2 layer 3 lands. That number only existed as an
absolute X/Y in the mold's CAD frame, which you cannot measure against a board.

**Drawings** button on a plan → the traveler's own print-preview shell, with
sheet 1 a general assembled isometric, sheet 2 a third-angle three-view, then one
dimensioned placement sheet per layer (so 2 + N sheets, not three pages).

Decisions worth not rediscovering:

- **Dimensions are inches to the nearest 1/16 with the exact mm bracketed.** A
  value not on a 1/16 gets a `≈` — otherwise the fraction gets read as the truth.
  `mmIn()` in stackview.js stays as it is for the on-screen tables.
- **Per-side insets off the board below, PLUS an absolute datum table.** A board
  sawn oversize makes every edge-relative number wrong in the same direction, and
  the datum is how you catch it. Datum = the near-left corner of the stack
  footprint, marked identically on every sheet.
- **Mold silhouette is rasterise-and-trace**, not silhouette edges and not a full
  wireframe. Project, fill cells, walk the boundary, then stitch with slicer.js's
  own `stitchContours` (grid segments share endpoints exactly) and thin with its
  `simplify`. Cannot fail on a rough export, only come out coarse. No mesh (old
  plans, failed upload) falls back to the stored layer contours and every sheet
  says so, because a stepped profile must not pass for the real surface.
- **All furniture is drawn in PAGE coordinates.** Views expose X()/Y(); text is
  at a fixed pt size. Scaling labels with the geometry is the failure this avoids
  structurally.
- Sheets reuse `.ws-page` so `@page`, the print swap and the B&W proof toggle all
  apply — but never `.ws-foot`, which is `position:fixed` in print and would
  stamp every sheet's footer onto every page.
- Long insets are left to the table rather than drawn: on a two-block layer over
  one wide base the far-edge inset is a correct number and a dimension line
  straight across the sheet through the other block.

### Lettering and the legibility test

First round shipped sheets whose labels sat on top of the lines they belonged
to. Screenshots did not catch it — you only see what you happen to look at, on
the fixtures you happen to render, and it stops working the moment nobody looks.

**`tools/test_drawings.mjs`** is the answer and is the thing to keep. It renders
the real sheets in headless Chromium across eight fixtures and then interrogates
the laid-out DOM: no label crossed by a **solid** line, no two labels
overlapping, nothing upside down, nothing under 5.5pt, nothing off the sheet.
It found 45–122 findings per fixture on the first run and is now green.

Things it taught, that are easy to reintroduce:

- Text boxes must be tested as **oriented quads**, not AABBs. Half the labels on
  a sheet are rotated, and the AABB of a 30°-rotated string covers a large empty
  triangle — testing that reports a collision for every rule nearby, and a
  checker people learn to ignore is worse than no checker.
- **Solid geometry crossing a label fails; dashed does not.** That is ASME
  Y14.5, not a threshold picked to go green: dimension and object lines are
  never drawn through text, hidden and centre lines are broken by it.
- Under `rotate(-90)`, `text-anchor="start"` runs the string **upward**. Hanging
  a tight label off the high end with "start" walks it back across the feature.
- Two constraints fight on the isometric dimensions: not upside down, and on the
  far side of their own dimension line. Fix the writing direction for
  readability and move the **anchor** to satisfy the other — choosing the
  direction to fix the second breaks the first, and the "upside-down" check
  exists because that is exactly what happened.
- Every label carries a white halo (`paint-order="stroke"`), which is what CAD
  does. The strict check still stands: the halo covers the layouts eight
  fixtures cannot anticipate, it is not permission to place labels badly.

**Lettering is osifont**, the ISO 3098 face (what FreeCAD uses), subset to 9 KB
and self-hosted — see `03 App/app/fonts/osifont-LICENSE.md`. Bundled rather than
named in a font stack because a fallback changes text metrics, and changed
metrics is precisely how a label ends up on a line: the test can only speak for
what the shop sees if the shop gets the same glyphs. It has **no U+2033 ″**, so
the inch mark is a plain ASCII quote.

### Sheet 1 revamp — waterline contours (2026-08-05)

Simon's complaint: the general view's "wireframe" showed nothing of the mold's
actual geometry. It couldn't: the dashed loop is a flat 2D silhouette, so all
interior surface shape was lost. Three exploration agents compared candidate
renderings; two independently landed on topographic waterlines, and that is
what shipped.

What changed on sheet 1 (`sheetIso`):

- **Waterlines.** Horizontal sections of the mold at every board interface plus
  the stock top (long dash, thin, same DASH_MOLD family as the silhouette) and
  evenly spaced intermediates (short dash, DASH_THIN), drawn over the iso view.
  The spacing of the lines is the shape: tight where steep, wide where flat.
  Machinery is slicer.js verbatim (`sliceAt` -> `stitchRelaxed` ->
  `outerContours` -> `simplify`); a level that won't stitch is skipped and
  counted, never thrown. New helpers `waterlineZs` / `waterlineLoops` /
  `waterlineRuns` / `waterlineKeep` sit next to `silhouetteLoops`.
- **Back-face cull, no mesh normals.** The iso eye projects onto XY as (1,1),
  so an edge faces the viewer exactly when its outward loop normal has
  nx + ny > 0; the loop's own winding (polyArea sign) says which side is out.
  The far side of each section is dropped, or it overdraws the near side one
  dash out of phase.
- **Clutter defence.** Intermediates only draw when they clear the last kept
  level by 7 page px at the sheet's scale (`waterlineKeep`); interfaces always
  draw. Verified on the thinstack fixture.
- **Line-weight hierarchy fixed.** Every blank's top face was DW.heavy, so a
  six-layer stack printed six heavy diamonds and glue joints shouted as loudly
  as the assembly outline. Faces are now all DW.med and the TRUE outer
  silhouette is overdrawn heavy once, traced from
  `silhouetteLoops(stockGeometry(plan).tris, "iso")` on a finer grid
  (new `minCellMm` opt, since the 0.5mm floor is sized for meshes, not boxes).
- **AS MACHINED inset.** A small mold-alone iso next to the layer key: solid
  lines (out of the block it is visible geometry), silhouette med, waterlines
  thin. Mesh-backed plans only. New `.dwg-inset` in print.css, 1.85in.
- **Sheet note.** Sheet 1 now passes a dash legend through `dwgPage`'s
  `sheetNote` arg, which it alone had left empty.
- **Bug fix found on the way:** the no-mesh iso fallback projected each stored
  layer contour at `L.z1`, but `sliceMold` cuts them at `z0 + SLICE_EPS_MM`.
  Every section drew one board thickness too high. Now `L.z0`, with a unit test.

Deliberate deviations from the approved plan, both judgment calls:

- **No waterlines in the no-mesh fallback.** Its iso loops already ARE
  horizontal sections; recomputing them as waterlines would draw every line
  twice. The fallback keeps its med-dashed loops, now at the right height.
- **The "machined top face" (evenodd cavity hole) was dropped.** These are
  mostly MALE molds: at the stock top the material remaining after machining is
  only the mold's own section, not "face minus hole", so the trick would draw
  the wrong picture for the common case, and the sheet is titled ASSEMBLED
  STOCK, which is solid by definition. The inset answers the same question
  honestly.

Considered and deferred (details in the plan file and the agents' reports):
feature-edge rendering with a raster depth buffer (about 2 days, real tuning
risk on rough meshes) and a half cutaway with ISO pattern hatch (rewrites the
painter loop, wants a cutting-plane line on sheet 2).

Verification: 331/331 in `test_app.mjs` (two new tests: waterlines + cull +
inset, and the z0 fix). `test_drawings.mjs` finding counts identical to main
fixture-for-fixture (the pre-existing text-on-text findings; nothing new,
waterlines are dashed and dashed is exempt from the label-crossing rule).
Eyeballed nosecone / thinstack / clamshell / nomesh sheet 1 via --shots-all.

Harness note: `tools/test_drawings.mjs` resolves Playwright from `.ds-sync/`,
which is gitignored and so absent in a worktree. Symlink it from the main
checkout (`ln -s ../../.ds-sync .ds-sync` shaped) before running there.

### Sheet 1, round two — straightness, shading, strict review loop (2026-08-05)

Simon's feedback on the real clamshell mating-surface mold (now a permanent
harness fixture, `mating`, from `tools/fixtures/clamshell-mating-surface.stl`
copied into `03 App/app/samples/`): lines that are straight in CAD printed
wavy and fragmented, some went missing, and he asked for the mold to be shaded
inside the stock. He also asked for a strict reviewer sub-agent (visibility,
line width, straightness, design-language conformance). Three review rounds
ran; the fixes, in the order the reviews forced them:

- **Finer raster + straighten pass.** DWG_MAX_CELLS 340 -> 720 (budget 4e7).
  New `straightenLoop(pts, maxTurnDeg, devTol)`: drops vertices where the turn
  is shallow AND removal moves the outline less than a couple of cells.
  Douglas-Peucker bounds deviation but keeps the long shallow S-wave a grid
  trace makes of a straight edge; the angle gate is what kills it. Applied to
  every silhouette loop and to waterlines (10 deg / 2.0mm).
- **Exact snapping for the stock outline.** `snapLoopToSegments`: the blanks'
  projected box edges are known exactly, so every traced vertex snaps to the
  nearest exact edge (corners first, 1.4x reach) before straightening. The
  heavy rule now lies ON the CAD line: no waviness, sharp miters, no burrs
  where it crosses the face edges underneath.
- **Hatch shading.** 45 deg pattern fill (`#dwgHatch`, 7px pitch, 0.5 stroke)
  over the mold's silhouette loops in the main view and the inset, drawn under
  all linework. Pattern fill, never generated lines: generated hatch would be
  hundreds of solid segments for the label-collision audit to trip over; a
  pattern's one template line never meets a label. Legend updated.
- **Waterlines: full loops, aggressive dedupe, tangency suppression.** The
  back-face cull from round one is GONE (a culled half-contour read as a
  broken line; everything mold is hidden-line dashed anyway, so full loops are
  the convention). `waterlineKeep` now drops ANY level, interfaces included,
  whose loops match the last kept level (bbox+area within 1.2mm) — on a
  vertical wall the glue-line section is the same rectangle as the one below
  it, and thinstack's seven identical rectangles wove a moire with the hatch.
  `waterlinePaths` is the single emitter (main view dashed by kind, inset
  solid): it drops speck loops (< ~4 dash periods on paper), and suppresses
  any stretch running within ~2.5 page px of the silhouette OR of an
  already-drawn waterline — two dashed curves a stroke apart bead into a
  smear. Priority order decides who lives: glue lines first, then upper
  levels. A straight-walled box now draws NO waterlines at all (its sections
  ARE its silhouette); test_app asserts exactly that.
- **dimIso short-span fix.** A 3in height dimension prints `3" [76.2]`, wider
  than its own dimension line; the label now moves out past the extension
  overshoot when the text is longer than the span (dimH already had minSpan
  for the same disease). This killed a real text-on-line audit finding the new
  mating fixture surfaced.
- **Minors from review:** BLOCKS TO CUT prints board thickness on every row
  (blank ditto cells were ambiguous at the bench); legend notes the inset
  draws sections solid.

Review loop mechanics, for next time: render with
`node tools/test_drawings.mjs --shots-all`, then a general-purpose sub-agent
Reads the PNGs against the four criteria and returns SEVERE/MODERATE/MINOR
with pixel locations and a SHIP/FIX verdict. Sub-agents cannot be resumed
after they complete, so each round is a fresh agent carrying the previous
round's findings in its prompt. Round 1 found the wavy heavy outline, the
speck-trail glue line, nosecone edge burrs, and the thinstack moire; round 2
confirmed those fixed and caught the tangent-contour beading; round 3 is the
ship gate.

Deviation from Simon's suggestion, on purpose: he floated shading "in the
above photo" — done as hatch, not grey fill, because the sheet's design
language carries meaning by rule weight and dash only, and a grey fill dies
on the RFS laser printer.

## Mold Stack Planner — phase 2 (auto boards, sections, cut list)

**SN5 consumed ~20 sheets**, so the optimizer is worth building — a 20% saving
is 4 sheets. Offcuts ARE stored, down to about 4x10in. Mostly 30 pcf. And "you
can only cut all the way across" is a HARD constraint, not a preference.

Built on top of phase 1: the planner now picks board thicknesses itself from
what the rack holds, sections anything over the 6in cut depth, accepts a typed
rectangular block as well as an STL, and emits a guillotine cut list.

### What the two real SN5 molds taught us

`Clamshell Mold With Mating Surface.stl` — one body, 889 x 533 x 61.6mm, i.e.
exactly 35.00 x 21.00 x 2.43in. Designed in inches, exported in mm. This is the
mold that hit the 889.00 stitching bug.

`Undertray Mold.stl` — **31 separate bodies** scattered over 8.7m of assembly
space. Taking the whole file's bounding box plans a nine-metre void. Individual
bodies are sane (43x45x8in, 70x54x10in, 52x46x10.6in) and FOUR of the eight
largest exceed the 6in cut depth. Multi-body handling is not optional, and the
6in rule is confirmed by real data rather than theory.

### The big design correction

**Monotonicity was only ever an OPTIMISATION.** It let us slice once per layer
(union over a slab == section at its bottom, given positive draft). Real molds
break it: undertray body #1 flares 85mm outward above its base, body #3 flares
680mm — in every one of the six axis orientations. Refusing them was wrong.

A blank only has to CONTAIN the mold, and that is computable exactly with no
draft assumption, because we only ever need boxes: clip every triangle to the
slab, take the XY box of what survives, merge overlapping boxes (`slabBoxes`).
No sampling, no polygon booleans, same clip the containment test already used.
Occupancy is rasterised on a grid of cell = merge inflation so merging is not
O(n^2); a grid merges slightly MORE eagerly, which is the safe direction.

So now: blanks come from the exact path, contours are cosmetic (best-effort, for
the drawn outline), and bad draft is a CS-003 §7.1.4 design-review WARNING
instead of a refusal.

### Other things worth not rediscovering

- **Thin boards always win on volume alone** — each layer only covers its own
  slab, so subdividing can never use more board. Without a counterweight the
  planner picks the thinnest stack every time and hands the shop 8 glue joints
  at a 4h clamp each. `LAYER_PENALTY_MM3` (~2% of a sheet) is what an extra
  glue joint must save to be worth it. Tune it once somebody has glued a few.
- **The packer models cuts as a binary tree, not placements.** Guillotine
  feasibility is then structural rather than checked afterwards. The span of the
  SECOND cut at each node depends on whether the FIRST happened — if the
  leftover was thinner than the blade there is no cut and the piece in hand is
  still the full rectangle. Get that wrong and you print a notch, which a saw
  cannot make.
- **Kerf is not optional in the test either.** The cut-replay simulation must
  separate pieces by the blade width; modelling them as touching makes every
  downstream boundary drift and spans stop matching.
- **Boards are tried smallest-first** so offcuts get spent before fresh sheets.
- Density is NOT interchangeable (CS-004), so a 1in 30lb blank will report a
  shortfall rather than quietly come off a 1in 60lb board.

### Still open

- Remnant write-back into stock (the packer already returns reusable offcuts).
- Work-order attachment + the CS-003 §7.2 blocker wiring.
- Elastic margin band / strip-sharing quantisation — the design doc's best idea,
  still unimplemented; margins are currently a fixed 1in.
- `@berkeley.edu` fixtures in `tools/test_app.mjs` on a public repo.

## Mold Stack Planner — phase 1 (built, uncommitted)

New **Stock** tab. Two jobs: a live tooling-board inventory (CS-011 wants one and
never had one), and slicing a mold STL into a layer stack so CS-003 §7.2
checklist item 7 — "stack plan drawn", a BLOCKER step — stops being hand-drawn.

Phase 2 (the guillotine cut-plan optimizer across a batch of molds) is
deliberately NOT built. Its value is unvalidated until someone measures how many
sheets SN5 actually consumed. See "Open questions" below.

New files: `app/stock.js`, `app/slicer.js`, `app/slicer.worker.js`,
`app/stackview.js`, `tools/test_slicer.mjs`, `tools/nocache_server.py`.
Touched: `app/core.js` (DB + TABS row), `app/fb.js` (COLLECTIONS + ID_PREFIX),
`app/index.html`, `firestore.rules`, `tools/test_app.mjs`, `tools/test_wo_rules.mjs`.

### Decisions that cost something to rediscover

**Dimensions are stored AS ENTERED with a unit tag** (`{value:48, unit:"in"}`),
never normalised on write. Storing canonical mm and redisplaying in inches drifts
on every edit: 48 → 1219.2 → 47.99999 → saved. `toMm()` is the only conversion
point. There is a test for exactly this round-trip.

**Derived geometry is persisted, not the STL.** The reviewer needs the plan, not
the mesh. This also dodges a live bug: `.stl` has no browser MIME type, so
`fb.js` falls through to `application/octet-stream`, which the `storage.rules`
content-type allowlist rejects — an STL upload would fail as a permissions error
on a normal file pick. `storage.rules` is untouched as a result.

**The slicer is PURE and lives off the main thread.** `render()` in core.js is
fully synchronous and nothing else in the app ever blocks, so slicing inline
freezes the tab with no spinner to borrow. `slicer.worker.js` is a thin
`importScripts('slicer.js')` wrapper. Purity is why `tools/test_slicer.mjs` can
run the geometry under node with nothing stubbed.

**Geometry model — do not "simplify" these, both were bugs caught in review:**

- Layer footprint is the union over the whole slab, NOT a section at one height.
  A plane at the top of a layer undersizes the blank by thickness × tan(wall
  angle), which exceeds the entire margin band. Because CS-003 §7.1.4 requires
  positive draft, the solid grows downward, so the union equals the section at
  the layer's BOTTOM exactly — one slice, no polygon booleans.
- Monotonicity is asserted on 2D OUTER contours only. A bounding box cannot see
  an interior hole, so blind bottom dowel holes (which CS-003 §7.1.6 *requires*
  on split sections) must not be rejected. A "vertical ray crosses twice" test is
  NOT equivalent — that is vertical convexity and it passes a blind hole where
  monotonicity genuinely fails.
- Island merging iterates on GROUP boxes, never island boxes. A U of three rails
  plus a central boss: the rails merge into one huge group box, the boss never
  merges, and the boss's blank ends up entirely INSIDE the rails' blank. Two
  solid blocks in the same place. `test_slicer.mjs` guards this both ways — it
  also asserts the old island-level rule really does collide, so the guard can't
  go vacuous.

**Contour stitching welds on a RADIUS, never an exact grid cell.** Endpoints are
bucketed on a `WELD_TOL_MM` grid for speed, but matching searches the 3x3
neighbourhood and confirms by real distance. Requiring an exact cell match looks
correct and is not: two points a millionth of a millimetre apart land in
different cells whenever they straddle a cell boundary, and a perfectly good mesh
then reports "the outline does not close". Real molds hit this constantly,
because designers put corners on round numbers and round numbers are exactly
where grid boundaries sit. Found in production on a mold with a corner at
889.005mm (35.000in). `test_slicer.mjs` has a REGRESSION test pinning it, plus a
counter-test that a genuine 5mm hole is still refused — the fix must not become
"join anything". The error now quantifies the gap, which is what distinguishes a
too-tight tolerance from a broken mesh.

**Weld tolerance is a floor that RELAXES, and it is not the dedupe tolerance.**
0.05mm floor, doubling to a 1mm cap (`stitchRelaxed`), and the last attempt is
clamped to the cap or the real limit would be 0.8mm. A hard 0.01mm refused a real
mold whose triangles were 0.012mm apart — ordinary tessellation noise, not a
defect. Loosening is safe because contours only feed a bounding box, the
monotonicity check and a drawn outline: blanks carry a 25.4mm margin and CS-003
§7.1.5 forbids any machined section under 15mm, so a 1mm weld is 15x below the
smallest feature that may exist. Past the cap it is a genuine hole and we refuse.
`DEDUPE_TOL_MM` (1e-4) is deliberately separate — it only collapses the doubled
hit from a vertex sitting exactly on the slice plane, and tying it to a relaxed
weld would start eating whole segments on a fine mesh, losing real geometry to
fix a joining problem. A stack that needed relaxing emits a warning.

**The containment test is the spine.** Clip each triangle to the slab and check
the clipped POLYGON (not its bounding box) against the blank set, run against raw
STL triangles. Both naive versions are wrong: vertex-in-slab is unsound (a
triangle can cross with no vertex inside), and all-vertices-of-overlapping-
triangles false-fails on drafted walls. Clip the OPEN slab — material exactly on
a boundary plane belongs to the neighbouring layer.

**Two silent-failure gaps, both closed.** Worker OOM (size guard + `onerror` +
timeout) and the Firestore 1 MB document ceiling (`fitPlanForStorage` thins
contours until it fits, never dropping blanks, and says when detail was lost).

**Explode gap scales with the mold** (`isoGap`, 0.45 × footprint). A fixed gap
turned a 490mm board into overlapping diamonds. Layer labels are drawn in a final
pass or the next layer paints over them.

### Verified in a real browser, not just asserted

Served with `python3 tools/nocache_server.py 8126` (new — `python3 -m
http.server` sends no cache headers and will serve a stale slicer.js; same class
of bug that already bit this project). Stubbed `window.fb` per the pattern below,
then: stock tab renders with mixed in/mm boards; a 24-triangle plug sliced
through the real Worker into 4 layers, blanks shrinking 490.8 → 371.3 mm;
exploded view correct in light AND dark mode; an overhung mold refused with
"Look near X 115, Y -115 on layer 2".

### Open questions for Simon (these gate phase 2)

- **How many sheets did the SN5 mold set actually consume?** This decides whether
  the optimizer is worth ~10 weeks. 6 sheets → a 20% saving is one sheet. 40 →
  it pays for itself. Purchase history / #purchasing has it.
- **Do 30 and 60 lb/ft³ boards mix within one stack?** CS-004 says 60 seals
  better and the mold surface is machined into the top. Changes the data model.
- **Are offcuts physically stored and labelled?** The remnant ledger describes
  boards someone has to find. If they're scattered, the ledger is fiction. This
  is the question most likely to quietly kill phase 2.
- Which saw, who runs it, smallest piece safe to cut (sets the minimum blank).
- Is "cut all the way across first" a hard rule or a habit?
- Default margin: 1″ or 2″? Currently 1″ min, 2″ max.

Revamp verified: light+dark across all 10 tabs + WO detail + login + mobile drawer;
WCAG AA contrast on all token pairs in both themes (faint nudged to clear 4.5:1 —
5.16 light / 5.57 dark); zero horizontal overflow both themes; PWA manifest +
icons resolve; 73 logic tests pass. PWA icons live at icon-192/512/maskable +
apple-touch, from the FEB mark rasterised by ImageMagick (pre-baked coords, no
gradients/transforms, so magick renders exactly). Fonts/icons get a 1-year
immutable cache header; manifest stays no-cache.
NOTE not machine-verified: the print traveler in dark mode — the @media print
token reset (forces --ink #000 / --surface #fff for both :root and
[data-theme=dark]) is deterministic CSS and print.css was untouched, but nobody
ran a real print. Spot-check on a printer if in doubt.

## UI revamp (in flight) — decisions

Direction: **motorsport energy** + **full dark mode** (auto-follow system +
toggle), Simon's picks. FEB logo is the two-parallelogram blue+gold "speed slash"
mark from ev.studentorg.berkeley.edu; reproduced as SVG (`febMark()` in core.js)
rather than the raster, so it's crisp everywhere. Brand: Berkeley navy #003262
base, electric blue #2f6be4 accent, gold #FDB515 energy.

Token architecture (index.html `<style>`): OLD var names (--blue --canvas --card
--line --ink --muted --bad --ok --amber --accent --accent-soft --radius --shadow)
kept as ALIASES so every existing component themes for free; NEW names
(--surface-2 --hover --fill, status -bg/-border, --brand-ink, --shadow-md, motion,
fonts) drive the revamp. Dark theme = `:root[data-theme="dark"]` re-points the
shared tokens. `--brand-ink` exists because navy text (#003262) is invisible on
dark — it's navy in light, bright blue in dark; all `color: var(--blue)` text uses
were swapped to it. No-FOUC inline `<head>` script sets data-theme before paint
(localStorage `feb-theme`, else system). `applyTheme`/`toggleTheme` in core.js.

PRINT SAFETY (critical): `@media print` resets all themeable tokens to light
(black-on-white) at the top of the block, because print.css reads var(--ink) and
the fallback path reads var(--surface) — without the reset, printing in dark mode
gave white-on-white. Verify the traveler after any token change.

Fonts self-hosted in `app/fonts/` (Inter + Saira, variable woff2, one file each,
~84KB total) — offline-safe, no CDN. Inter = body/UI, Saira = display (h1, card
h2, .bignum) for the technical/motorsport feel.

Icon system: `icon(name,size)` in core.js returns inline Lucide-style SVG; ICONS
dict. Replaced ALL 10 nav glyphs, topbar emoji (search/bell/menu/more), theme
sun/moon, picker caret, and the ⋯-menu action icons. Motifs: gold skewed "slash"
on the active nav item (`.sb-item.active::before`), subtle carbon-weave
(repeating-linear-gradient at --carbon ~4%) on the navy sidebar.

Test fix: `tools/test_app.mjs` bell assertion checked for the 🔔 emoji; now checks
`aria-label="Notifications"` + the badge. 73 pass.

## Where things stand

## Composites app responsive work (in flight)

Making `03 App/app/` work on phones/tablets without changing desktop.
Simon picked two forks: mobile nav is a **slide-in drawer** (hamburger), and wide
list tables become **stacked cards** on narrow screens. Breakpoints: phone ≤640,
tablet ≤900; `max-width` queries so desktop is the untouched default.

Testing without a backend: serve `app/` on a local port, open in Chrome, then
inject a stub `window.fb = {state:'ready', user, roster, save:()=>…}` plus the SN5
seeds into `DB` and call `render()`. Everything is global scope so this gives a
fully populated signed-in UI with no Firebase. `window.__seed()` in the page does
it. Guard against horizontal overflow with
`document.documentElement.scrollWidth <= innerWidth+1` per tab per width.

Gotcha already hit: `closeDrawer()`/`toggleDrawer()` touch `document.body.classList`,
which is undefined in the DOM-stub test harness (`tools/test_app.mjs`), so they
must guard `if (document.body)`. Without it 19 tests threw. Back to 73 passing.

Chunk 1 (done, pushed): breakpoint system replacing the old lone 760px rule;
sidebar becomes a fixed off-canvas drawer slid in by `body.drawer-open` with a
`#drawer-backdrop`; topbar gets a `.hamburger` (≤900) and, on phones (≤640),
folds the secondary actions (`.tb-desktop`) into a `⋯` sheet via `openMoreMenu()`.
Drawer reuses the existing `.sidebar` markup, no duplication. Verified in-browser
at 390 and 1300px: drawer opens/closes, overflow menu lists lead actions, desktop
unchanged.

Chunk 2 (done, pushed): stacked list tables. `labelListTables()` in core.js runs
at the end of render(), copying each `table.list` header cell's text onto every
body cell's `data-label`. CSS (≤640) hides the header row, makes each `<tr>` a
card and each `<td>` a `Label  value` flex line via `::before { content:
attr(data-label) }`; first cell is the card title. `table.sub` gets
`display:block; overflow-x:auto` to scroll instead of blowing out. Zero edits to
tab renderers. Verified: all 10 tabs no h-overflow at mobile width; work orders
and parts stack cleanly (stage badges, status pills as values); desktop
unchanged (td stays table-cell, ::before content none).

Chunk 3 (done, pushed): board / calendar / modal / touch. Projects board stacks
to one status section per row (≤640 `.board { grid-template-columns: 1fr }`).
Calendar events become 8px colored dots (pointer-events:none) and each day cell
gets `onclick="calDay(iso)"`; calDay opens a modal listing that day's items
(no-op above 640 so desktop keeps its per-item links). Modal `.row2` collapses to
one column, inputs go 16px (iOS zoom), and `@media (pointer:coarse)` bumps tap
targets. Verified at 500px: board single-column, calendar dots + day modal, no
overflow on any of the 10 tabs, WO detail clean, new-project modal single-column;
at 1300px board is 4-col, calendar shows full labels, hamburger hidden.

IMPORTANT CSS architecture decision: ALL responsive rules live in one block at the
END of index.html's <style> (right before @media print). Reason: at equal
specificity the later rule wins, and several base rules (`.board`, `table.cal`,
`#modal .row2`) are defined *after* where the media block first sat, so the early
placement lost on source order (board stayed 2-col at ≤640). Moving every
screen-width override to the end makes them deterministically beat the bases. Do
not scatter responsive rules back up next to the components — keep them in the
end block.

Local testing gotcha: `python3 -m http.server` sends no cache headers, so the
browser served a stale calendar.js (calDay undefined) after edits. Use the
no-cache server at `scratchpad/nocache_server.py` on port 8126 (adds
`Cache-Control: no-store`) for browser testing. Same cache class as the prod
firebase.json no-cache headers.

Chunk 4 (done, pushed): tablet fix + full visual sweep. The 8-column Parts table
overflowed at 768px (tablet) because tables only stacked at ≤640. Since the
sidebar already becomes a drawer at ≤900, moved the table-stacking rules up to
the ≤900 block so tables card-stack across the whole compact range; phone-only
chrome (topbar ⋯ fold, calendar dots, board 1-col, 16px inputs) stays ≤640. Also
switched the stacked-card cell from `display:flex; justify-content:space-between`
to `display:block` with a floated label in a 92px gutter, so a value made of
several spans (a date plus a "(179d late)" tag) stays grouped and right-aligned
instead of being spread apart. Swept all 10 tabs + WO/parts/project detail views
at 400/768/1300px: zero horizontal overflow anywhere, desktop byte-identical
(table/table-cell, no ::before). 73 logic tests pass.

Net result: the composites app is responsive end to end. Drawer nav + card tables
≤900; phone chrome ≤640; desktop unchanged >900. All in index.html's end-of-style
responsive block + core.js labelListTables() + calendar.js calDay().

## Where things stand

The composites app is live at feb-composites.web.app and the whole SN6 Resources
handoff is on GitHub at Jinxiewinx/feb-composites-applications (public, `main`).
As of 2026-07-21 the repo holds all of `00` through `05` plus `tools/`, not just
the app.

Most recent work: the printed work-order traveler. Printing a work order now
produces a purpose-built hand-fillable form instead of a screenshot of the app.
Finished and pushed. `tools/test_app.mjs` is at 67 passing.

## Decisions made (don't relitigate)

### Repo

The git root is this folder, not `03 App/`. The scripts in `tools/`
resolve `Path(__file__).parent.parent / "03 App"`, so they only run from
one level up. `firebase deploy` still runs from inside `03 App/`.

Push over HTTPS, never SSH. The machine's SSH key authenticates as
`starbuckgold`, but the repo belongs to `Jinxiewinx`, which is the `gh` CLI
account. `ssh -T git@github.com` reporting success is misleading here.

The repo is public, Simon's call. Scanned clean: no credentials, no
`@berkeley.edu` addresses, no member names in the seed data. The Firebase
`apiKey` in `app/firebase-config.js` is a public web config by design, since
security lives in `firestore.rules`.

### Printed traveler

The print document is its own DOM, built by `app/print.js` into `#printroot`,
rather than the screen view restyled. `@media print` only chooses which of `#app`
and `#printroot` is visible, keyed off `body.sheet`.

`print.css` is deliberately not inside `@media print`. The sheet renders
identically on screen and on paper, which is what makes the preview trustworthy
and lets the design be reviewed from a screenshot. Don't tidy it into a
print-only block; that breaks the whole review loop.

Shop-traveler styling, black-and-white laser first. Every distinction has to
survive grayscale, so blockers use hatching plus heavy rules plus the literal
word BLOCKER, never colour alone. Berkeley blue and gold are enhancement only.

The sheet is capped at two pages, and the writing space is what flexes. `LAYOUTS`
in `print.js` is a ladder of row counts and note-block heights, most generous
first; `fitSheetHtml` renders each candidate into `#printroot.measuring`,
measures it, and takes the first that fits `MAX_PAGES`. Don't replace this with
fixed row counts: the whole point is that a sparse work order gets room to write
and a dense one still lands on two pages. `FIT_SAFETY` (0.93) discounts the
measured capacity because `break-inside: avoid` breaks earlier than a naive
height division.

Verified across the whole archive: `tools/print-preview.html` has an Audit all
button that runs all 26 seed work orders plus a blank of each process through the
real fit loop. As of 2026-07-21 all 31 fit, worst case 2.00 pages, one work order
(WO-SN5-006) reaching the compact floor. Re-run it after any layout change.

Standard references are off the printed sheet and out of new work orders.
`STD_STEPS` titles no longer carry them, and `stripCS()` in `workorders.js`
removes them at render time from legacy and retro records, covering titles, notes
and event-log text. Stored data is untouched, so the archive keeps its original
wording.

Retro records store the literal string `"not recorded (retro)"`. `pv()` maps that
to empty so it never reaches paper looking like data. Blank forms build their
steps from `STD_STEPS`, so a blank is a real procedure rather than empty ruling.

Page numbering is hand-written (`Page ___ of ___`). Chrome doesn't support
`@page` margin-box counters, so there's no honest way to print it.

### CFD PDF viewer (07)

Done as of 2026-07-21, all six phases. Indexing, page view with synced scrolling,
panel compare, overlay, summary, and the Electron shell with a verified macOS
build.

The model that everything rests on: pages are stacked into one continuous strip
of PDF points, and a panel is a window into that strip. Panels sit on a uniform
502.5 pt pitch and flow across page breaks, so nothing may assume a panel lives
on one page. Panels match across reports by name, with position as the fallback.

Panel titles are found by font height (26.8125 pt in this exporter, matched with
a tolerance band) plus a left-margin test. That yields 59 named panels: 36
contours, 6 vectors, 17 plots. `test/test_indexer.mjs` pins all of it against the
real DP_22.pdf, so a change to the Fluent export breaks the test first.

Verified in the browser, not just asserted: two identical reports diff to exactly
0 pixels of 2,809,400, and the Ghostscript-perturbed variant from
`tools/make-test-variant.mjs` diffs to 5.62%. Sync, unlock and re-sync were
checked by scripted scrolling.

Note this app uses ES modules, unlike the composites app's classic scripts.
pdf.js ships as a module and pulls a module worker with it, so that was forced.
It also means the folder has to be served over HTTP rather than opened from
file://. The Electron shell handles that by serving the app over a custom app://
protocol, which is why the desktop and browser builds run identical code with
nothing conditional between them. Don't "simplify" it to loadFile; the module
worker will stop loading.

The macOS build is verified end to end: electron-builder produces a 115 MB .dmg
and .zip, and `npm run smoke` drives the packaged app over the DevTools protocol
and confirms it indexes a report in the window. It is unsigned, so first launch
needs right-click then Open. The Windows target is configured but unbuilt, since
cross-building from macOS needs Wine.

DP_22.pdf is bundled into the packaged app on purpose, so the demo button works
on first launch. Without it the packaged app 404s on the sample, which is how
that was caught.

Bug-fix round after Simon's first real use, 2026-07-21:

Panel height is measured from where the next panel or section heading begins, not
from the median pitch. A page break inside a panel pushes the plot down, and 28
of 58 panels then need more room than the pitch; assuming it cropped them. Capped
at 1.6x pitch so a panel at a section boundary (one raw extent is 1053 pt of
mostly whitespace) does not become a huge empty pane.

Panels and Overlay crop to content through one shared box computed across every
report being compared (`jointCrop` in render.js). Cropping each report to its own
content would offset them and the difference view would report that offset as
change everywhere. The guard test is that two identical reports still diff to
exactly 0; verified across five panels.

`.panelcell canvas` must not have a max-width. The canvas carries inline width
and height, so a max-width clamped the width while the height stood and every
plot stretched vertically on zoom.

Zoom is per column and mirrors across columns only when tracking is on, matching
the scroll lock. Pinch arrives as a wheel event with ctrlKey; the per-event delta
is clamped because a mouse wheel sends 120 where a trackpad sends single digits,
and unclamped that was a 3.3x jump per notch.

The window is frameless, so the toolbar is the drag region (`-webkit-app-region`)
and every control in it opts out, with an 84 px left inset on macOS for the
traffic lights. Verified by computed style in both the dev and packaged builds.

Second bug-fix round, 2026-07-22:

Content-space layout. Pages now lay out with their print margins removed
(`measureMargins` in render.js, `withContentSpace` in indexer.js), so a plot that
spans a page break is one continuous image and the panel crop stops mistaking the
seam's white band for the title gap. This is the core model change. Paper-space
`absY` is kept as `paperAbsY`; everything reading geometry now reads content
space. `pagesForRange` composites in content space, skipping each page's top/
bottom margin. `measureMargins` needs a canvas so it runs in the browser after
the (node-testable, text-only) `indexDocument`; the node test feeds synthetic
margins to `withContentSpace` instead.

Delete button: pdf.js 6 has no `PDFDocumentProxy.destroy()`. The old
`d.pdf.destroy()` threw before the list filter ran, so nothing was removed. Now
teardown goes through the loading task (`doc.task`), guarded, and the filter runs
regardless.

Zoom streaks were the diagonal `.placeholder` hatch flashing on every rebuild.
Fixed by rescaling the existing canvases in place (`rescaleStrip`) and keeping the
old bitmap until a debounced sharp re-raster lands, plus a flat placeholder.

Overlay diff: reading the two cropped canvases directly instead of drawing both
onto one scratch canvas and reading it back twice. The round-trip added a couple
of LSB differences on a GPU-backed canvas, so identical reports read "0.00%
differ" instead of identical. Render + jointCrop were already bit-exact.

Overlay now defaults to swipe.

Build gotcha: after editing app/, `open`ing dist/ runs the OLD app if a prior
instance is still alive; and `asar extract-file | node` truncates, which looked
like a stale build when it was not. Use full `asar extract` to verify, and kill
every running instance before relaunching. Verified content-space runs in the
packaged app via CDP (contentHeight 41288).

## Open questions for Simon

Nothing blocking.

The full traveler runs about 3 pages for a complete work order, 2 for a blank.
That's the cost of the generous fill-in space. Say if it should be tightened.

## Notes for whoever picks this up

The visual review harness is `tools/print-preview.html`. It needs a real HTTP
origin, since the seed JSON fetch is blocked on `file://`. Run
`python3 -m http.server 8777` from this folder, then open
`http://localhost:8777/tools/print-preview.html`. It has toggles for blank form,
B&W proof, margin guides and page breaks, plus a readout of approximate page
count and horizontal overflow.

Test harness gotcha: `tools/test_app.mjs` concatenates the app's classic scripts
into one indirect `eval`. Top-level `const` stays lexical and is invisible to the
tests, so the harness rewrites a named list
(`STD_STEPS|WO_STATUSES|PROCESSES|BLANK_ROWS|BLANK_FORM_ROWS`) into implicit
globals. Adding a new app file means adding it to `FILES` too, or the harness
silently won't see it.

`firebase.json`'s no-cache header now covers `css` as well as `html|js|json`. It
previously didn't, which would have served `print.css` stale for an hour. Same
class of cache bug that bit Simon during initial setup.

Storage-backed features (avatar and file upload) still need the Firebase Blaze
plan. They're built and tested against the emulator. Emulator hosting port is
5050, because macOS AirPlay squats on 5000.

## Google Sheet sync (2026-08-15)

The app now mirrors itself into the live Composites Master Tracker
(`1qvA8fRl5sdj8__Fh09OzrMAviyqoNtWHELdtvXjkMlU`, Nick owns it). Built because
adopting the app otherwise meant double-entering every part into the sheet the
team already watches.

Simon's decisions on it: app is the source of truth, one-way, roughly every 15
minutes, roll out on a trial tab first, orphan rows kept and flagged rather than
deleted, and Simon installs the script himself.

The design was forced, not chosen. There is no server here (static hosting, no
Cloud Functions, no service account), and `gdocs.js` rules out adding Google
OAuth to the app. So the timer lives inside the spreadsheet as a bound Apps
Script that PULLS, and the app publishes one snapshot document it can fetch with
no credentials: `tracker/<token>`, public `get`, `list` denied to everyone
including leads. The 32-char token lives in `config/tracker`, never in source.

Two things learned the hard way and worth not re-deriving:

- **The 1 MiB document limit is not the binding constraint; index entries are.**
  7.5 KiB per index entry and 20,000 per document. An array of maps would make
  thousands of entries; the snapshot therefore stores one compact JSON *string*
  per part. That also means the Apps Script decodes with one `JSON.parse` per
  row instead of walking Firestore's `{mapValue:{fields:{…:{stringValue}}}}`.
- **Unauthenticated Firestore REST honours `firestore.rules`.** Verified against
  the live project: an anonymous GET of `pub/<id>` returns 404 (read allowed,
  doc absent) while `parts/<id>` returns 403. No API key, no OAuth. That is the
  whole reason this works without a server.

The `Extra Comments` column and full engineer names are published, which
`pubProjection()`'s never-add list would normally forbid. That is deliberate and
is what the secret token buys: the sheet has those columns, so a mirror that
dropped them would not be a mirror. Simon also made the spreadsheet itself
link-viewable on 2026-08-15, so the same data is already world-readable. **If
the sheet is ever locked back down, revisit the feed in the same breath.**

Rollout state: hosting and `firestore:rules` both deployed 2026-08-15 and
verified live — anonymous `GET tracker/<anything>` now answers 404 (allowed,
nothing published yet) where it answered 403 before the rules went out, while
`parts`, `config`, `roster` and `tracker` list all still answer 403. Rules were
deployed as their own step, on their own, because they are the thing that can
lock the team out.

`TARGET_SHEET` in `Sync.gs` is `'Part Tracker (App)'`, a trial duplicate; going
live is that one string. Still waiting on the two manual steps nobody but a
human can do: a lead pressing **Tracker feed** on the Reports tab to mint the
token and publish the first snapshot, and pasting `Sync.gs` into the
spreadsheet's Apps Script. Until the button is pressed there is no token and no
document, which is why the URL 404s rather than erroring.

The spreadsheet was made link-viewable on 2026-08-15 only so the live column
headers could be read. The sync does NOT need it: the Apps Script runs inside
the document under an editor's own account. It can be set back to restricted.

The trigger runs under whoever installs it. When the program passes to Nick, he
has to re-run `installTrigger` under his own account or the sync dies with
Simon's access.

## Datasheets and standards unlisted from the app (2026-08-18)

Simon asked for the reference docs and the standards off the app. They are
**unlisted, not deleted** — the 25 datasheet PDFs and 48 standards files are
still in `03 App/app/docs/` and still served live (verified with curl after the
deploy). Only the manifest entry went: 42 entries down to 1 (Shop Printables).

Do not "finish the job" by deleting the files. Two things depend on them:
`resins.js` hardcodes six `docs/datasheets/*.pdf` paths for the TDS citation
behind every cure hold, and those resolve by path, not through the manifest; and
CS-000 requires an issued standard to stay retrievable, so deleting them is a
process violation rather than a cleanup.

The switch is one `UNLISTED` set at the top of `tools/gen_docs_manifest.py`.
The generator still copies every file and `add()` decides what gets listed.
Empty the set to put everything back; nothing else needs changing.

`documents.js` hardcodes no category whitelist — the leading names are an order
only — so an older Firestore upload filed under Datasheets or Standards still
renders under its own heading. `dashboard.js` lost the two launchpad tiles that
counted them (and the manifest preload they triggered) in favour of one
Documents tile.

## Next up (not started)

- Port the traveler to the offline single-file `work-orders.html`, which still
  has the old print CSS.
- `reports.js` "Print status board" still calls raw `window.print()`.
- `05 Printables/printables.html` is open to redesign. Simon said it isn't a
  house style to conform to.
- The CS standards in `02 CS Standards/src/` haven't been swept for AI writing
  patterns. They're versioned documents with approval tables, so a prose edit
  means a revision bump under CS-000. Ask before touching them.
