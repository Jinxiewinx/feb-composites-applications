# CLAUDE.md — SN6 Resources repo

Repo-specific authorizations from Simon. These extend the working rules in the
parent folder's CLAUDE.md; read that one too.

## Main and deploys are open (2026-08-05)

Simon's standing authorization for this repo, given so he does not have to
land or ship work himself:

- **Push to main directly.** This overrides the background-session default of
  "never push to main". Branches and PRs are still fine when a change wants
  review, but landing finished, tested work on main without asking is the
  normal path. Force-pushes over real history remain off limits.
- **Deploy Firebase hosting without asking**, from `03 App/`:
  `firebase deploy --only hosting` to `feb-composites.web.app`. This includes
  deploys done purely to test or verify a change live, not only "section done"
  deploys. Deploy from a state that is pushed, so live always matches a commit
  and rollback is redeploying an earlier one.
- **`--only hosting` still means only hosting.** `firestore.rules` and
  `storage.rules` can lock the team out of their own data; deploy those only
  when the rules themselves changed, and say so in the report.
- After deploying, verify: `curl` a changed file off the live host and check
  the new code is actually in it. The CLI's "Deploy complete" is not the check.

Everything else from the parent CLAUDE.md stands: detailed commit messages,
README updated in the same push, SESSION-STATE.md kept current, no secrets or
junk files, and `#composites` announcements still need asking.
