"use strict";
/* fusion.js — the Fusion add-in's side of the app.

   The FEBPlanStock add-in (10 Fusion Add-in/FEBPlanStock/) opens this app in
   a Fusion palette, exports the selected mold body as a millimetre STL and
   hands it in here. Everything after that is the ordinary mold modal and
   submitMold(): the same ids from the same counter, the same records, the
   same mesh upload. When the plan is saved, the layers go back to Fusion,
   which draws one semi-transparent box per blank.

   Inert everywhere else. Fusion injects a global `adsk` object into palette
   pages about a second after the page runs (measured in the S4 spike), so
   the bridge polls for it briefly at boot and does nothing if it never comes.
   A browser never has it, so a browser never sees any of this.

   The contract, two messages each way, JSON strings:
     Fusion -> page  "mold"   { stl (base64 binary STL, mm), body, fusion:{…} }
     page -> Fusion  "loaded" { version }
     page -> Fusion  "plan"   { planId, moldId, name, layers:[{index,z0,z1,thickness,section,blanks}] }
     page -> Fusion  "cancel" {}             the modal was closed without a plan
   `fusion` is the document identity that gets stamped on the mold record:
   { urn, versionId, versionNumber, project, folder, document, body, webUrl, exportedAt }. */

/* Set while a Fusion-supplied mesh is in the modal; submitMold() stamps it on
   the mold and fusionPlanSaved() clears it. A global so submitMold can stay
   ignorant of where the STL came from. */
let FUSION_CTX = null;
let FUSION_READY = false;   // the adsk bridge object was found

const FUSION_POLL_MS = 100, FUSION_POLL_FOR_MS = 6000;

function fusionHost() { return typeof window !== "undefined" && window.adsk && typeof window.adsk.fusionSendData === "function"; }

/* Tell the add-in something. Fire-and-forget; the add-in never needs a reply
   from the page for anything it cannot recover from. */
function fusionSend(action, data) {
  if (!fusionHost()) return false;
  try { window.adsk.fusionSendData(action, JSON.stringify(data || {})); } catch (e) { /* palette gone */ }
  return true;
}

/* Called from the boot path. Polls because the bridge lands late; stops on its
   own so a browser tab pays 60 cheap checks and nothing else. */
function fusionBridgeInit() {
  if (typeof window === "undefined") return;
  window.fusionJavaScriptHandler = { handle: fusionHandle };
  const t0 = Date.now();
  const tick = () => {
    if (fusionHost()) {
      FUSION_READY = true;
      const root = document.documentElement;
      if (root && root.classList) root.classList.add("in-fusion");
      fusionSend("loaded", { version: typeof APP_VERSION !== "undefined" ? APP_VERSION : "" });
      return;
    }
    if (Date.now() - t0 < FUSION_POLL_FOR_MS) setTimeout(tick, FUSION_POLL_MS);
  };
  tick();
}

/* Python -> page. Fusion delivers the return string back to the add-in as an
   HTMLEvent with action "response", so return something non-empty: an empty
   string is how Fusion signals failure. */
function fusionHandle(action, data) {
  try {
    if (action === "mold") {
      fusionOpenMold(JSON.parse(data || "{}"));
      // Say so explicitly as well as through the return value: the add-in
      // shows the member an error if neither arrives.
      fusionSend("mold-received", { bytes: MOLD_BUF ? MOLD_BUF.size : 0, name: MOLD_BUF ? MOLD_BUF.name : "" });
      return "ok";
    }
    if (action === "ping") { fusionSend("pong", { data }); return "pong"; }
  } catch (e) {
    toast(`Fusion handed over something this app could not read: ${e.message}`, "error");
    fusionSend("mold-failed", { error: e.message });
    return "error " + e.message;
  }
  return "unhandled " + action;
}

function fusionDecodeStl(b64) {
  const bin = atob(String(b64 || ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/* The mold modal, with the STL already chosen and the units already right.
   Same MOLD_BUF shape loadSampleMold() fills, so submitMold() needs no case
   for it. The member still sets name, density and board mode themselves:
   those are decisions, and the add-in does not make them. */
function fusionOpenMold(payload) {
  if (!payload || !payload.stl) throw new Error("no STL in the message");
  const buffer = fusionDecodeStl(payload.stl);
  const ctx = payload.fusion || {};
  const body = payload.body || ctx.body || "mold body";
  if (typeof uploadMold !== "function") throw new Error("the Molds section is not loaded");
  view = { ...view, tab: "molds" };
  // Close whatever was open first: closeModal() clears FUSION_CTX, so the
  // context is set only after the mold modal is up.
  if (typeof closeModal === "function") closeModal();
  uploadMold();
  FUSION_CTX = { ...ctx, body };
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.value = v; };
  set("ml-src", "stl");
  if (typeof moldSrcChanged === "function") moldSrcChanged();
  set("ml-unit", "mm");
  const nameEl = document.getElementById("ml-name");
  if (nameEl && !nameEl.value) nameEl.value = ctx.document ? `${ctx.document} · ${body}` : body;
  MOLD_BUF = { buffer, name: `${body}.stl`, size: buffer.byteLength, key: `fusion:${ctx.urn || ""}:${ctx.versionNumber || ""}:${body}:${buffer.byteLength}` };
  MOLD_BODIES = null;
  const prog = document.getElementById("ml-progress");
  if (prog) prog.textContent = `From Fusion: ${body} (${Math.round(buffer.byteLength / 1024)} KB, millimetres). Set the density and press Plan.`;
  // Hide the file and sample pickers: the mesh is already here, and a second
  // file picked now would silently replace the body the member selected.
  for (const id of ["ml-file", "ml-sample"]) {
    const e = document.getElementById(id);
    const f = e && e.closest ? e.closest(".field") : null;
    if (f && f.style) f.style.display = "none"; else if (e && e.style) e.style.display = "none";
  }
}

/* The block submitMold() stamps on the mold. `by` is the app user, not the
   Autodesk one: the roster account is what the rest of the record uses. */
function fusionStamp() {
  if (!FUSION_CTX) return null;
  const c = FUSION_CTX;
  return {
    urn: c.urn || "", versionId: c.versionId || "", versionNumber: c.versionNumber ?? null,
    project: c.project || "", folder: c.folder || "", document: c.document || "", body: c.body || "",
    webUrl: c.webUrl || "", exportedAt: c.exportedAt || "", by: myEmail(),
  };
}

/* submitMold() calls this once the plan record is saved. Fusion gets exactly
   what it needs to draw: the plan id (the component's name) and the layers
   with their blanks, in the millimetre frame the plan already stores. */
function fusionPlanSaved(plan, moldId) {
  const wasFusion = !!FUSION_CTX;
  FUSION_CTX = null;
  if (!wasFusion || !fusionHost()) return false;
  return fusionSend("plan", {
    planId: plan.id, moldId: moldId || plan.moldId || "", name: plan.name || "",
    layers: (plan.layers || []).map(L => ({
      index: L.index, z0: L.z0, z1: L.z1, thickness: L.thickness, section: L.section || 0,
      blanks: (L.blanks || []).map(b => ({ x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 })),
    })),
  });
}

/* closeModal() tells us when the member backed out, so a stale context cannot
   stamp the next mold made by hand. */
function fusionModalClosed() {
  if (!FUSION_CTX) return;
  FUSION_CTX = null;
  fusionSend("cancel", {});
}

/* ---------- the mold card ---------- */

async function fusionCopy(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      toast("Copied.");
      return;
    }
  } catch (e) { /* fall through */ }
  if (typeof prompt === "function") prompt("Copy the document name:", text);
}

/* Read-only, like the buyRef chip: the block is stamped by the add-in's
   hand-off, never edited by hand, so it is not a schema field. The deep link
   was tried and failed (10 Fusion Add-in/spikes/README.md, S6), which is why
   the link goes to the document's Fusion Team page, where Autodesk's own
   "Open in Fusion" button is. */
function moldFusionSection(m) {
  const f = m && m.fusion;
  if (!f || !(f.document || f.urn)) return "";
  const ver = f.versionNumber != null && f.versionNumber !== "" ? `v${esc(f.versionNumber)}` : "";
  return `<h3>Fusion</h3>
    <div class="fusionblk">
      <div class="f"><label>Document</label><div class="ro">${esc(f.document || "—")}
        ${f.document ? `<button class="sm ib" title="Copy the document name to find it in Fusion" onclick="fusionCopy('${esc(String(f.document).replace(/\\/g, "\\\\").replace(/'/g, "\\'"))}')">${icon("link", 13)} Copy name</button>` : ""}</div></div>
      <div class="f"><label>Body</label><div class="ro">${esc(f.body || "—")}</div></div>
      <div class="f"><label>Version</label><div class="ro">${ver || "—"}${f.project ? ` · ${esc(f.project)}${f.folder ? " / " + esc(f.folder) : ""}` : ""}</div></div>
      <div class="f"><label>Exported</label><div class="ro">${f.exportedAt ? fmtWhen(f.exportedAt) : "—"}${f.by ? " by " + esc(f.by) : ""}</div></div>
      ${f.webUrl && /^https:\/\//.test(f.webUrl) ? `<div class="f"><label></label><div class="ro"><a href="${esc(f.webUrl)}" target="_blank" rel="noopener">${icon("externalLink", 13)} Open in Fusion Team</a></div></div>` : ""}
    </div>`;
}
