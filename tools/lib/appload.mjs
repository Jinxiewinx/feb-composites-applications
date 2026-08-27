/* The one loader for the app's classic scripts.

   Replaces three incompatible eval tricks — test_app.mjs's FILES list plus two
   regex allowlists, test_slicer.mjs's globalThis.__S, test_packer.mjs's
   globalThis.__P — with one mechanism: every file runs as its own vm.Script
   carrying its real path as `filename`.

   Two things fall out of that, and both are the point.

   V8 keys coverage by script URL. A single concatenated `(0, eval)` has no URL,
   so it reports nothing and there was no way to know what was covered. Give each
   script its real filename and `node --test --experimental-test-coverage`
   attributes lines to "03 App/app/core.js" by name.

   runInThisContext puts each script's top-level let/const into the GLOBAL
   LEXICAL environment — shared across scripts, and readable from an ESM test
   module by bare name. That is what makes the two hand-maintained regex
   allowlists (~70 identifiers, rewriting `const X =` into an implicit global)
   unnecessary. They only ever existed because a lexical binding inside one big
   eval was invisible to the tests.

   THE GOTCHA THAT COMES WITH IT: those bindings are global-LEXICAL, not
   properties of globalThis. Bare `DB` works. `globalThis.DB` is undefined, and
   so is `window.DB`. If you are reaching for one through an object, that is why
   it is not there. */
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "03 App", "app");

/* The load order comes from index.html's own <script> tags rather than a list
   kept by hand. The hand-kept list in test_app.mjs held the same 31 files but in
   a different order from the browser, and SESSION-STATE records the failure mode
   it invited: add an app file, forget the list, and the harness silently cannot
   see it. Reading the markup means the tests load what the app loads, in the
   order the app loads it. */
export function appFiles({ vendor = false, config = false } = {}) {
  const html = readFileSync(join(APP_ROOT, "index.html"), "utf8");
  const all = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
  return all.filter(f => {
    if (f.startsWith("vendor/")) return vendor;
    if (f === "firebase-config.js") return config;
    return true;
  });
}

const loaded = new Set();

/* Load one file into the current context. Idempotence is NOT silent: a second
   load of the same file throws "Identifier 'DB' has already been declared" from
   V8 anyway, and that message does not name the caller's mistake. */
export function loadAppFile(rel, { strict = true } = {}) {
  const abs = join(APP_ROOT, rel);
  if (loaded.has(abs)) throw new Error(`appload: ${rel} was already loaded into this context`);
  let src = readFileSync(abs, "utf8");
  /* A CRLF checkout defeats the "use strict" strip below and every regex in the
     old harness, and the symptom is a baffling "DB is not defined" several files
     later. Name it here instead. See .gitattributes. */
  if (src.includes('"use strict";\r\n')) {
    throw new Error(`appload: ${rel} has CRLF line endings — re-clone with core.autocrlf=false`);
  }
  if (!strict) src = src.replace(/"use strict";\n/g, "");
  loaded.add(abs);
  vm.runInThisContext(src, { filename: abs });
  return abs;
}

/* Load the whole app, in index.html order. */
export function loadApp(opts = {}) {
  const files = opts.files || appFiles(opts);
  for (const f of files) loadAppFile(f, opts);
  return files;
}
