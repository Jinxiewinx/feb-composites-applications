# 10 Fusion Add-in

A Fusion 360 add-in that runs the composites app's stack planner from inside
Fusion: select the mold body, sign in, and the tooling-board layers come back
as semi-transparent bodies over the mold for CAM, with the mold record created
in the app and linked to its Fusion document.

Nothing here is built yet. `FEASIBILITY-PLAN.md` is the approved plan for the
feasibility study (2026-09-04): the user story, the two architectures to
compare, the questions to answer, and six throwaway spikes. Executing that plan
produces `FEASIBILITY.md` with a recommendation and a go/no-go, and a `spikes/`
folder of proof-of-concept scripts that are never product code. Nothing in this
folder is installed on anyone's machine.

The app-side facts the plan relies on (the stack plan's stored layer blanks in
millimetres in the mold's CAD frame, the pure-JS slicer, email/password auth
usable over REST) are documented in `06 Composites App/app/README.md` and
`DESIGN-NOTES.md`; the plan quotes the file and line for each.
