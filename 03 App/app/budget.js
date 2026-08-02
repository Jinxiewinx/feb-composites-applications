"use strict";
/* budget.js — the Budget tab.
   The SN5 "Budget" sheet reborn: purchase requests through their lifecycle
   (Submitted → Ordered → Reimbursed). Season spend at a glance so we don't
   find out we're over at the worst possible time. */

const BUY_STATUS = ["Submitted", "Ordered", "Reimbursed"];
const PURPOSE = ["Manufacturing", "Testing", "Restock", "Tooling", "Other"];

function buyById(id) { return DB.budget.find(b => b.id === id); }
function saveBuy(b, field) { b = b || buyById(view.id); if (b) save("budget", b, field); }
function buyStatusClass(s) { return { Submitted: "Draft", Ordered: "InWork", Reimbursed: "Complete" }[s] || "Draft"; }
function num(v) { const n = parseFloat(String(v).replace(/[^0-9.\-]/g, "")); return isNaN(n) ? 0 : n; }
// FEB purchasing rule: anything over $50 needs sign-off before it's ordered.
function needsApproval(b) { return num(b.cost) > 50 && b.status === "Submitted"; }

async function newBuy() {
  const id = await allocId("budget");
  if (!id) return;
  const b = {
    id, item: "", purchaser: signerName(), purpose: "Manufacturing", status: "Submitted",
    cost: "", dateOrdered: today(), source: "", notes: "", retro: false, createdBy: myEmail(),
    receiptUrl: "", receiptPath: "",
  };
  DB.budget.push(b); saveBuy(b);
  view = { ...view, mode: "detail", id, edit: true }; render();
}
function delBuy(id) {
  confirmModal("Delete " + id + " for everyone? Back up first if unsure.", () => {
    const b = buyById(id);
    del("budget", id);
    if (b && b.receiptPath) fb.deleteFile(b.receiptPath);
    DB.budget = DB.budget.filter(b => b.id !== id);
    view = { ...view, mode: "list", id: null }; render();
  });
}
// "Scan" on mobile is just this input opening the camera directly via the
// capture attribute — no OCR, no new JS for that part. Reuses fb.upload()
// (already downscales images client-side) exactly like ticket/document files.
function attachReceipt(id) {
  const b = buyById(id);
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = "image/*"; inp.setAttribute("capture", "environment");
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    try {
      const rec = await fb.upload(`budget/${b.id}/${Date.now()}-${f.name}`, f);
      b.receiptUrl = rec.url; b.receiptPath = rec.path;
      saveBuy(b, "receiptUrl"); saveBuy(b, "receiptPath");
      render();
    } catch (e) { toast("Receipt upload failed: " + e.message, "error"); }
  };
  inp.click();
}

function renderBudget() {
  return view.mode === "detail" ? renderBuyDetail() : renderBuyList();
}

function renderBuyList() {
  const D = DB.budget;
  const rows = D
    .filter(b => (!view.fStatus || b.status === view.fStatus))
    .filter(b => { const q = view.q.toLowerCase(); return !q || (b.item || "").toLowerCase().includes(q) || (b.purchaser || "").toLowerCase().includes(q); })
    .sort((a, b) => (b.dateOrdered || "").localeCompare(a.dateOrdered || ""));
  const total = D.reduce((s, b) => s + num(b.cost), 0);
  const open = D.filter(b => b.status !== "Reimbursed");
  const openSum = open.reduce((s, b) => s + num(b.cost), 0);
  const unapproved = D.filter(needsApproval).length;
  return `
  <div class="stat-row">
    <div class="stat-tile"><div class="bignum">$${total.toFixed(0)}</div><div class="stat-label">Season total</div></div>
    <div class="stat-tile"><div class="bignum">${open.length}</div><div class="stat-label">Open orders ($${openSum.toFixed(0)})</div></div>
    <div class="stat-tile"><div class="bignum">${unapproved}</div><div class="stat-label">Over $50, unapproved</div></div>
  </div>
  <div class="toolbar no-print"><button class="primary" onclick="newBuy()">+ New Purchase</button></div>
  <div class="filters no-print">
    <select onchange="view.fStatus=this.value;render()">
      <option value="">All statuses</option>
      ${BUY_STATUS.map(s => `<option ${view.fStatus === s ? "selected" : ""}>${s}</option>`).join("")}
    </select>
    <input id="searchbox" placeholder="search item / purchaser…" value="${esc(view.q)}" oninput="searchInput(this)">
  </div>
  ${D.length === 0 ? `<div class="card">No purchases logged yet. <b>New Purchase</b> to start.</div>` : ""}
  <table class="list">
    <tr><th>Item</th><th>Purchaser</th><th>Purpose</th><th>Status</th><th>Cost</th><th>Ordered</th></tr>
    ${rows.map(b => `<tr onclick="view={...view,mode:'detail',id:'${b.id}',edit:false};render()">
      <td><b>${esc(b.item || b.id)}</b>${b.retro ? ' <span class="pill retro">retro</span>' : ""}${needsApproval(b) ? ' <span class="pill OnHold" title="Over $50 — needs #purchasing sign-off before ordering">needs approval</span>' : ""}</td>
      <td>${esc(b.purchaser || "—")}</td><td>${esc(b.purpose || "")}</td>
      <td><span class="pill ${buyStatusClass(b.status)}">${esc(b.status)}</span></td>
      <td>$${num(b.cost).toFixed(2)}</td><td>${esc(b.dateOrdered || "")}</td>
    </tr>`).join("")}
  </table>`;
}

function buyFld(b, label, key, opts) {
  const v = b[key] ?? "";
  if (!view.edit) return `<div class="f"><label>${label}</label><div class="ro">${esc(v) || "—"}</div></div>`;
  if (opts) return `<div class="f"><label>${label}</label><select onchange="updBuy('${key}',this.value)">${opts.map(o => `<option ${v === o ? "selected" : ""}>${o}</option>`).join("")}</select></div>`;
  return `<div class="f"><label>${label}</label><input value="${esc(v)}" onchange="updBuy('${key}',this.value)"></div>`;
}

function renderBuyDetail() {
  const b = buyById(view.id);
  if (!b) { view.mode = "list"; return renderBuyList(); }
  const E = view.edit;
  return `
  <div class="toolbar no-print">
    <button class="ib" onclick="view={...view,mode:'list'};render()">${icon("chevronLeft",16)} All purchases</button>
    <button class="primary" onclick="view.edit=!view.edit;render()">${E ? "Done editing" : "Edit"}</button>
    ${E && isLead() ? `<button class="danger" onclick="delBuy('${b.id}')">Delete</button>` : ""}
  </div>
  <div class="card" data-lbgroup="budget:${esc(b.id)}">
    <h2>${esc(b.item || "(unnamed purchase)")}</h2>
    <div class="muted">${esc(b.id)} · <span class="pill ${buyStatusClass(b.status)}">${esc(b.status)}</span>${b.updatedAt ? " · saved " + fmtWhen(b.updatedAt) + " by " + esc(b.updatedBy || "?") : ""}</div>
    ${needsApproval(b) ? `<p class="warn">Over $50 — needs #purchasing sign-off before it's ordered.</p>` : ""}
    <h3>Details</h3>
    <div class="grid">
      ${buyFld(b, "Item", "item")}${buyFld(b, "Purchaser", "purchaser")}${buyFld(b, "Purpose", "purpose", PURPOSE)}
      ${buyFld(b, "Status", "status", BUY_STATUS)}${buyFld(b, "Cost ($)", "cost")}${buyFld(b, "Date ordered", "dateOrdered")}
      ${buyFld(b, "Source / vendor", "source")}
    </div>
    <h3>Receipt</h3>
    ${/* Through the shared tile, so a receipt opens in the viewer like every
          other photo instead of being a thumbnail you can only download. A
          receipt is always an image — attachReceipt() only accepts one, and
          storage.rules allows nothing else under budget/. */""}
    ${b.receiptUrl
      ? `<div class="filegrid">${fileItem({ url: b.receiptUrl, name: `receipt-${b.id}.jpg`, type: "image/jpeg" })}</div>`
      : '<span class="muted">No receipt yet.</span>'}
    <div class="no-print" style="margin-top:8px"><button onclick="attachReceipt('${b.id}')">${b.receiptUrl ? "Replace" : "+ Add / scan"} receipt</button></div>
    <h3>Notes</h3>
    ${richField("budget", b.id, "notes", {
      plain: true, label: "Notes",
      empty: "Why this was bought, or what went wrong with the order.",
      upload: name => `budget/${b.id}/${Date.now()}-${name}`,
    })}
  </div>`;
}

function updBuy(key, val) { const b = buyById(view.id); b[key] = val; saveBuy(b, key); if (key === "status" || key === "cost") render(); }
