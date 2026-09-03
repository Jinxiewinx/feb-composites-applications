#!/usr/bin/env node
/* app/ds/ must be byte-identical to 05 Design System/: the app links the
   published files rather than inlining them, so drift is a copy that went
   stale, never an edit. Fix by copying, never by editing app/ds/. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
const DS = join(HERE, "..", "..", "05 Design System");
const APP = join(HERE, "..", "app", "ds");
let fail = 0;
for (const f of ["tokens.css", "components.css", "fonts/inter-var.woff2", "fonts/saira-var.woff2"]) {
  const same = readFileSync(join(DS, f)).equals(readFileSync(join(APP, f)));
  console.log(`${same ? "  ok" : "FAIL"}  app/ds/${f} ${same ? "matches" : "differs from"} 05 Design System/${f}`);
  if (!same) fail++;
}
console.log(`\n${4 - fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
