#!/usr/bin/env node
/* release.mjs — cut a named release of the app.
 *
 *   node tools/release.mjs 1.1.0          # from the repo root
 *   node tools/release.mjs 1.1.0 --dry    # say what it would do, touch nothing
 *
 * WHAT IT DOES, in order, stopping at the first thing that goes wrong:
 *
 *   1. refuses a dirty tree
 *   2. finds the previous tag
 *   3. reads the commit subjects since it — they are already prose sentences
 *      describing user-visible outcomes, which is why this is cheap
 *   4. bumps APP_VERSION and rewrites WHATS_NEW in core.js
 *   5. prepends a CHANGELOG.md section
 *   6. runs the test suites, and refuses to ship over a failure
 *   7. commits, tags, pushes over HTTPS
 *   8. deploys hosting — ONLY hosting
 *   9. verifies the new version is actually live, by fetching it
 *  10. prints the Slack note and STOPS
 *
 * WHAT IT CANNOT DO FOR YOU:
 *
 * Commit subjects here are written for the next engineer reading git log, and
 * they make good CHANGELOG lines. They are NOT always the sentence to put on
 * fifteen people's screens — "Release notes skip the handoff file's own
 * commits" is a true and useless thing to interrupt somebody with. Read
 * WHATS_NEW in core.js before this deploys and rewrite it in the team's words.
 * The CHANGELOG keeps the subjects either way.
 *
 * WHAT IT DELIBERATELY DOES NOT DO:
 *
 * It does not post to Slack. `#composites` announcements need Simon's explicit
 * ask (CLAUDE.md), so this prints the message and a human sends it. The webhook
 * exists in the app already if that is ever relaxed.
 *
 * It does not write config/release. That is the "Announce this release" button
 * in the app's ⋯ menu, pressed by a lead who is standing in the new version.
 * Keeping it there means this script needs no Firebase credential of its own,
 * and means nobody is told to reload before the deploy has actually landed.
 *
 * It does not deploy rules or functions. `--only hosting` means only hosting:
 * firestore.rules can lock the team out of their own data, and functions need
 * their own secret. Both are deliberate, separate acts.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const APP = join(ROOT, "03 App");
const CORE = join(APP, "app", "core.js");
const CHANGELOG = join(ROOT, "CHANGELOG.md");
const HOST = "https://feb-composites.web.app";

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const version = args.find(a => /^\d+\.\d+\.\d+$/.test(a));

function die(msg) { console.error("\n✕ " + msg + "\n"); process.exit(1); }
function say(msg) { console.log(msg); }
function run(cmd, cmdArgs, opts = {}) {
  return execFileSync(cmd, cmdArgs, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts });
}
/* Steps that change the world are funnelled through here so --dry is honest:
   one place decides whether anything actually happens. */
function act(what, fn) {
  if (DRY) { say("  (dry) would " + what); return null; }
  return fn();
}

if (!version) die(`Give the version to cut, e.g.\n\n    node tools/release.mjs 1.1.0\n\nMajor = a new top-level area or a change in how the team works.\nMinor = a new capability inside an area that exists.\nPatch = fixes and copy.\n\nSee the top of CHANGELOG.md.`);

/* ---- 1. a clean tree ---------------------------------------------------- */
say(`\nCutting v${version}${DRY ? "  (dry run)" : ""}\n`);
const dirty = run("git", ["status", "--porcelain"]).trim();
if (dirty && !DRY) die("The tree is dirty. Commit or stash first — a release must name a\ncommit that exists, or `git checkout v" + version + "` gives you something\nthat was never deployed.\n\n" + dirty);

/* ---- 2. the previous tag ------------------------------------------------ */
let prev = null;
try { prev = run("git", ["describe", "--tags", "--abbrev=0"]).trim(); } catch { /* no tags yet */ }
const range = prev ? `${prev}..HEAD` : "HEAD";
say(prev ? `  since ${prev}` : "  first tagged release — reading the whole history");

if (prev === "v" + version) die(`v${version} is already the latest tag.`);

/* ---- 3. the notes ------------------------------------------------------- */
/* Subjects only. The bodies in this repo are essays — rationale, rejected
   alternatives, measurements — which is exactly right for `git log` and far too
   much for a release note. The subject line is already the sentence a team
   member would want. */
const subjects = run("git", ["log", "--no-merges", "--format=%s", range])
  .split("\n").map(l => l.trim()).filter(Boolean)
  /* Housekeeping this repo does under its own name. SESSION-STATE.md is the
     internal handoff; a release note telling the team it was pruned is noise on
     a screen that interrupts them. Four such commits in the first 250.

     Deliberately NOT filtering a leading "docs" — this repo writes prose
     subjects, not prefixes, so "Docs and mockups for the inventory work" is a
     real change and the space after the word would have swallowed it. */
  .filter(l => !/^session state[:!( ]/i.test(l))
  .filter(l => !/^(chore|wip|fixup|squash)[:!(]/i.test(l));

if (!subjects.length && !DRY) die("No commits since " + prev + " — nothing to release.");
say(`  ${subjects.length} commit${subjects.length === 1 ? "" : "s"} to describe\n`);
subjects.forEach(l => say("    - " + l));

/* Six is a reading limit, not a storage limit: the full list goes to the
   changelog, and WHATS_NEW is what interrupts someone's screen. */
const HIGHLIGHT_CAP = 6;
const highlights = subjects.slice(0, HIGHLIGHT_CAP);
if (subjects.length > HIGHLIGHT_CAP) {
  say(`\n  Note: WHATS_NEW takes the first ${HIGHLIGHT_CAP}. Edit core.js before you deploy`);
  say("  if those are not the ones the team cares about.");
}
say("\n  WHATS_NEW now reads as below. These interrupt the whole team on their next");
say("  reload — rewrite them in core.js in the team's words if they read like a");
say("  changelog rather than a note to a person:");
highlights.forEach(h => say("    • " + h));

/* ---- 4. the version in the app ----------------------------------------- */
let core = readFileSync(CORE, "utf8");
const vRe = /^var APP_VERSION = "[^"]*";$/m;
const nRe = /^var WHATS_NEW = \[[\s\S]*?^\];$/m;
if (!vRe.test(core)) die("Couldn't find `var APP_VERSION = \"…\";` in core.js.");
if (!nRe.test(core)) die("Couldn't find the `var WHATS_NEW = [ … ];` block in core.js.");
const from = core.match(vRe)[0].match(/"([^"]*)"/)[1];
say(`\n  core.js: v${from} → v${version}`);

core = core.replace(vRe, `var APP_VERSION = "${version}";`);
core = core.replace(nRe, "var WHATS_NEW = [\n" +
  highlights.map(h => `  ${JSON.stringify(h)},`).join("\n") + "\n];");
act("write core.js", () => writeFileSync(CORE, core));

/* ---- 5. the changelog --------------------------------------------------- */
const today = run("git", ["log", "-1", "--format=%cs"]).trim();
const entry = `## v${version} — ${today}\n\n` +
  highlights.map(h => `- ${h}`).join("\n") +
  (subjects.length > HIGHLIGHT_CAP
    ? `\n\n<details><summary>${subjects.length - HIGHLIGHT_CAP} more</summary>\n\n` +
      subjects.slice(HIGHLIGHT_CAP).map(h => `- ${h}`).join("\n") + "\n\n</details>"
    : "") +
  "\n\n---\n\n";

if (!existsSync(CHANGELOG)) die("CHANGELOG.md is missing.");
let log = readFileSync(CHANGELOG, "utf8");
const marker = "---\n\n## ";
const at = log.indexOf(marker);
if (at < 0) die("CHANGELOG.md has no `---` before its first version section;\nthis script inserts there and won't guess.");
log = log.slice(0, at + marker.length - 3) + entry + log.slice(at + 5);
act("prepend the CHANGELOG.md section", () => writeFileSync(CHANGELOG, log));

/* ---- 6. the gate -------------------------------------------------------- */
/* Before the commit, so a red suite leaves nothing behind but edited files you
   can `git checkout --`. */
const SUITES = ["test_app.mjs", "test_designsystem.mjs", "test_route.mjs", "test_appui.mjs", "test_detailui.mjs"];
say("\n  running the suites");
for (const s of SUITES) {
  const file = join(ROOT, "tools", s);
  if (!existsSync(file)) { say(`    – ${s} (not present, skipped)`); continue; }
  try {
    const out = execFileSync(process.execPath, [file], { cwd: APP, encoding: "utf8" });
    const tail = out.trim().split("\n").pop();
    if (/[1-9]\d* failed/.test(tail)) throw new Error(tail);
    say(`    ✓ ${s} — ${tail}`);
  } catch (e) {
    const detail = (e.stdout || "") + (e.stderr || "") + (e.message || "");
    die(`${s} failed. Not shipping.\n\n` + detail.trim().split("\n").slice(-25).join("\n"));
  }
}

/* ---- 7. commit, tag, push ---------------------------------------------- */
const msg = `Release v${version}\n\n` + subjects.map(l => `- ${l}`).join("\n") + "\n";
act("commit, tag and push", () => {
  run("git", ["add", "CHANGELOG.md", "03 App/app/core.js"]);
  run("git", ["commit", "-m", msg]);
  run("git", ["tag", "-a", "v" + version, "-m", msg]);
  // HTTPS, never SSH: the machine's SSH key authenticates as the wrong account
  // for this repo. See CLAUDE.md.
  run("git", ["push"]);
  run("git", ["push", "--tags"]);
  say("  pushed, tagged v" + version);
});

/* ---- 8. deploy ---------------------------------------------------------- */
act("deploy hosting", () => {
  say("\n  deploying hosting");
  execFileSync("firebase", ["deploy", "--only", "hosting"], { cwd: APP, encoding: "utf8", stdio: "inherit", shell: process.platform === "win32" });
});

/* ---- 9. verify it is actually live ------------------------------------- */
/* "Deploy complete" is not the check (CLAUDE.md). Fetch the file and look.

   Retried, because the first run of this against a real deploy failed and the
   deploy was fine: the CLI returns as soon as the release is finalised, and the
   edge can still be serving the previous file for a few seconds. A single fetch
   turns that race into a red "NOT v2.0.0" on a release that shipped correctly,
   which is worse than useless — the next person learns to ignore the check.

   Cache-busted per attempt as well as no-store: an intermediate proxy that
   ignores no-store would otherwise hand back the same stale body every time and
   the retries would all agree with each other about the wrong answer. */
if (!DRY) {
  say("\n  verifying against " + HOST);
  const TRIES = 6, GAP = 5000;
  let live = "", ok = false;
  for (let i = 1; i <= TRIES; i++) {
    try {
      const res = await fetch(`${HOST}/core.js?v=${version}-${i}`, { cache: "no-store" });
      if (res.ok) {
        live = await res.text();
        if (live.includes(`var APP_VERSION = "${version}";`)) { ok = true; break; }
      }
    } catch (e) { /* a blip mid-propagation is exactly what the retries are for */ }
    if (i < TRIES) {
      say(`    not there yet (${i}/${TRIES}) — the edge can lag the CLI by a few seconds`);
      await new Promise(r => setTimeout(r, GAP));
    }
  }
  if (!ok) {
    die(`The deploy reported success but ${HOST}/core.js is still NOT v${version}\n` +
        `after ${TRIES} tries over ${(TRIES - 1) * GAP / 1000}s. Check the Firebase console\n` +
        `before telling anyone it shipped.`);
  }
  say(`  ✓ ${HOST} is serving v${version}`);
}

/* ---- 10. the Slack note, for a human to send --------------------------- */
/* Slack mrkdwn, not HTML: *bold* is a single asterisk and there is no entity
   escaping — the app's own slackIssueCreatedMsg carries the same warning. */
const slack = [
  `*Composites app v${version} is out* — <${HOST}|feb-composites.web.app>`,
  "",
  ...highlights.map(h => `• ${h}`),
  "",
  "Reload the app to get it. If you have it installed on a tablet, it will prompt you.",
].join("\n");

say("\n" + "─".repeat(64));
say("Paste into #composites (Simon's call — this script never posts):\n");
say(slack);
say("─".repeat(64));
say(`\nThen open the app as a lead and hit ⋯ → "Announce this release",`);
say("so anyone still on an older build gets the reload prompt.\n");
