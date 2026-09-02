# FEB CFD Sims Dashboard

Started 2026-09-02. A shared dashboard for the aero team's CFD simulations,
built for many people to use at once and to hold a lot of data. What it will
show and how it will work gets written down when development starts, after
the team has said what they want. This folder holds the infrastructure and
the harness so that day can begin with a screen rather than with setup.

`DECISIONS.md` has the reasoning behind the infrastructure choices (a web
app on Firebase, its own Firebase project, where data lives). Read it before
changing the shape of anything here.

## What exists

| Path | What it is |
|---|---|
| `firebase.json`, `.firebaserc` | Pins the `feb-cfd` project. Hosting root is `app/`. Emulator ports are offset from the composites app's so both can run at once |
| `firestore.rules` | The roster allowlist from the composites app: sign in, get added by a lead, then read and write. Guests read only. The three data collections in it are placeholders that prove the harness; real ones replace them |
| `storage.rules` | Same boundary for files: guests and strangers write nowhere, accounts write only inside named trees with size and type caps |
| `tools/test_rules.mjs` | Firestore rules tests against the emulator, one case per rule |
| `tools/test_storage_rules.mjs` | Storage rules smoke test: the deny cases |
| `app/` | A placeholder page proving hosting, the design tokens and the Firebase config are wired. `app/ds/` is `tokens.css`, `components.css` and the two fonts copied from `05 Design System/` |
| `design/` | Mockups and screenshots, dated in the filename |

## Running it

Node, the Firebase CLI and a JDK (for the emulators), same as `SETUP.md` at
the repo root. From this folder:

```bash
npm test            # both rules suites, through the emulators
npm run emulators   # auth, Firestore, storage, hosting, with the UI on :4001
npm run serve       # the static app alone on :8792, no Firebase
npm run deploy      # hosting only, to feb-cfd.web.app
```

Rules deploy separately and only when they change:

```bash
firebase deploy --only firestore:rules,storage:rules --project feb-cfd
```

## State of the Firebase project

`feb-cfd`, console at https://console.firebase.google.com/project/feb-cfd.

| Service | State |
|---|---|
| Hosting | Live, placeholder page at https://feb-cfd.web.app |
| Firestore | Created, `us-west1` (same region as `feb-composites`). Rules deployed |
| Storage | Enabled, default bucket `feb-cfd.firebasestorage.app` in `us-west1`. Rules deployed |
| Auth | Enabled: email/password and anonymous (guest), the same two providers as the composites app |

The project is on the Blaze plan, linked 2026-09-02 to the billing account
`feb-composites` uses. Nothing is charged until usage passes the free tier.

## Releases

Tags are `cfd-vX.Y.Z`, never bare `vX.Y.Z`, which belongs to the composites
app in the same repo. Version numbers follow the composites rubric at the
top of the root `CHANGELOG.md`; this folder gets its own `CHANGELOG.md` with
the first release.

## Next

1. Talk to the team about what the app tracks and how it should look.
2. Write the data model and replace the placeholder collections, tests in
   the same commit.
