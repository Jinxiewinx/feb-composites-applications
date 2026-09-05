# 10 Fusion Add-in

A Fusion add-in that runs the composites app's stack planner from inside
Fusion: select the mold body, sign in, and the tooling-board layers come back
as semi-transparent bodies over the mold for CAM, with the mold record created
in the app and linked to its Fusion document.

**`FEBPlanStock/` is the add-in.** Its README has the install steps for macOS
and Windows and how it works; the page side lives in the app as
`06 Composites App/app/fusion.js` and shipped in app v4.5.0. Built 2026-09-04
on the study's recommendation.

`FEASIBILITY-PLAN.md` is the approved plan for the
feasibility study (2026-09-04): the user story, the two architectures to
compare, the questions to answer, and six throwaway spikes. `spikes/` holds
the spike scripts and `spikes/README.md` their results: all six ran on macOS on
2026-09-04 and passed, except the `fusion360://` deep link, which opened
nothing. `FEASIBILITY.md` is the study: go, with the real app in a Fusion
palette (architecture A), sized at two sessions. The spike add-ins under `spikes/` are throwaway and are installed nowhere
but Simon's Mac.

`MCP.md` records Fusion's built-in MCP server and how Claude Code connects
to it; `tools/find_fusion_mcp.py` finds its port. That is the path the spikes
run over.

The app-side facts the plan relies on (the stack plan's stored layer blanks in
millimetres in the mold's CAD frame, the pure-JS slicer, email/password auth
usable over REST) are documented in `06 Composites App/app/README.md` and
`DESIGN-NOTES.md`; the plan quotes the file and line for each.
