# Setting up a development environment

Everything you need to run the app locally, run the tests, and deploy. Written
after standing this repo up on a bare Windows machine in August 2026, which is
where most of the traps at the bottom came from.

If you only want to *use* the app you need none of this: it is live at
https://feb-composites.web.app, and access is the roster inside it.

## What you need, and what breaks without it

| Tool | Needed for | Without it |
|---|---|---|
| **Node** (any recent; 24.x is what this was last run on) | every `.mjs` script — tests, servers, generators | nothing in `tools/` runs |
| **Playwright + Chromium** | the 11 browser suites, `shoot_ui.mjs`, `make_mockups.mjs` | those suites **skip and still exit 0** — read the output, never just the exit code |
| **Firebase CLI** | the 3 rules suites, and all deploys | no rules tests, no deploy |
| **A JDK** (21 is fine) | the Firebase emulator the rules suites run against | the emulator will not start |
| **Python 3** | the document pipeline only (`build_docx.py` and friends) | standards cannot be rebuilt; nothing else is affected |

The app itself has **no build step and no dependencies**. `03 App/app/` is
plain classic scripts. Node is for the tooling, not for the app.

## macOS

```bash
brew install node openjdk
```

```bash
npm i -g firebase-tools playwright
```

```bash
npx playwright install chromium
```

`brew install openjdk` is keg-only; follow the caveat it prints to get `java`
onto PATH, or the emulator will not find it.

## Windows

```bash
winget install --id OpenJS.NodeJS.LTS --exact --source winget
```

```bash
winget install --id Microsoft.OpenJDK.21 --exact --source winget
```

Then **open a new terminal.** The installers change PATH, and an already-open
shell keeps the environment it started with. This matters more than it sounds —
see the traps. In the new terminal:

```bash
npm i -g firebase-tools playwright
```

```bash
npx playwright install chromium
```

`--source winget` is not optional in practice. Without it the `msstore` source
is searched too, and it fails on a certificate error before reaching the
package you asked for.

## Python, only if you are editing the standards

The virtualenv at `tools/.venv` is **gitignored**, so it never exists in a
fresh clone on any platform, whatever older docs say. Build it:

```bash
python3 -m venv tools/.venv
```

Then install what `build_docx.py` imports. Invoke it as
`tools/.venv/bin/python` on macOS, `tools\.venv\Scripts\python.exe` on Windows.

## Verify

```bash
node -v; npm -v; firebase --version; java -version; npx playwright --version
```

All five should answer. If `firebase` says "not recognized" on Windows, it is
almost always PATH — see the traps.

## First run

Everything runs **from the repo root**, because the scripts in `tools/` resolve
their paths relative to it. The one exception is `firebase`, which must run
from inside `03 App/`.

The app, seeded, no Firebase, nothing saves and a reload resets it:

```bash
node tools/serve_populated.mjs --port 8791
```

The canary, worth running before anything else:

```bash
node tools/test_app.mjs
```

If that dies immediately on `ReferenceError: DB is not defined`, your checkout
has CRLF line endings — see the traps. Nothing else will work until it passes.

## The full suite

`tools/README.md` is the inventory: what each of the 19 suites covers and which
needs what. Three tiers.

**Logic, no browser, seconds.** `test_app`, `test_designsystem`, `test_slicer`,
`test_packer`, `test_qr`:

```bash
node tools/test_app.mjs
```

**Rendered in headless Chromium, minutes.** `test_appui`, `test_detailui`,
`test_drawings`, `test_labels`, `test_print_mobile`, `test_q_landing`,
`test_route`, `test_safearea`, `test_sanitize`, `test_scan`, `test_website`:

```bash
node tools/test_appui.mjs
```

`test_website` needs the site built first: `node "08 Website/build.mjs"`.

**Against the Firebase emulator**, from `03 App/`:

```bash
firebase emulators:exec --only firestore --project demo-feb-work-orders "node ../tools/test_wo_rules.mjs"
```

`test_pub_rules` the same; `test_storage_rules` wants `--only auth,storage`.
These target the **demo** project, so they need Java and the CLI but no
`firebase login` and no network, and they never touch the real project.

**The CFD viewer** is separate, from `07 CFD PDF Viewer/`:

```bash
npm install
```

```bash
npm test
```

Two commands, not one. `npm install` returns before the tree has fully settled,
and a test launched in the same breath can fail on a module that is about to
exist.

## Deploying

```bash
firebase login
```

Then, **from `03 App/`**, and only after your work is committed and pushed, so
that whatever is live always matches a commit and a rollback is "redeploy an
earlier one" rather than an archaeology dig:

```bash
firebase deploy --only hosting
```

`--only hosting` is deliberate. The same `firebase.json` carries
`firestore.rules` and `storage.rules`, and those are the part that can lock the
team out of their own data. Deploy rules only when the rules themselves
changed, test them against the emulator first, and say so in the commit.
Functions deploy separately again.

Then verify with your eyes, or `curl` a changed file off the live host and
check the new code is in it. "Deploy complete" from the CLI is not the check.

## Traps

**Line endings (Windows).** Git's Windows default rewrites files to CRLF on
checkout. `test_app.mjs` strips strict mode from the concatenated app sources
with a regex anchored on `;\n`, which does not match `;\r\n`. Strict mode then
survives the strip, the app's implicit globals become assignments to undeclared
names, and the suite dies on its first line. `.gitattributes` pins the tree to
LF, so any clone made after August 2026 is already right. An older clone needs
`git config core.autocrlf false`, then `git rm --cached -r .` and
`git reset --hard`. That changes no committed content — the blobs in the index
were always LF.

**PATH after an install (Windows).** Windows gives the new PATH only to
processes started afterwards. Windows Terminal runs as a *single* process, so
opening a new tab or even a new window is not enough — quit it entirely.
Explorer caches the environment too, so anything launched from the Start menu
can inherit a stale copy. A reboot is the certain fix. The symptom is
`'firebase' is not recognized`, and it is misleading: `firebase.cmd` is a shim
that calls `node`, so a missing `node` reports itself as a missing `firebase`.

**PowerShell execution policy (Windows).** The default is `Restricted`, which
blocks `.ps1` files. npm installs three shims per global package, and
PowerShell prefers `firebase.ps1` over `firebase.cmd`, so bare `firebase` fails
with "cannot be loaded because running scripts is disabled" even when PATH is
perfect. Either call `firebase.cmd`, or:

```bash
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

This error and the PATH one look nothing alike. Read which one you actually got
before fixing the other.

**Quoting the emulator's inner command.** `emulators:exec` hands its argument to
the platform shell. The POSIX-looking `"node '../tools/test_wo_rules.mjs'"`
fails on Windows, where `cmd.exe` leaves the single quotes inside the filename.
Leave the inner path unquoted and it works on both.

**`file://` URLs in Node.** Any path that reaches `import()` must be a `file://`
URL built with `pathToFileURL()`, never `"file://" + path`. A Windows absolute
path starts `C:\`, so the concatenation yields an unknown `c:` scheme. This bit
twice in this repo, and both times the throw landed in a `catch` that reported
the dependency as *missing* — which is how every browser suite once skipped
green on a machine that had Playwright installed.

**Green is not passing.** The browser suites skip with exit code 0 when
Playwright is absent, and the print is the only thing that says so. Read the
output.
