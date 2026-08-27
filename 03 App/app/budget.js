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

/* ---------- goals ----------
   Lead-set spending targets, stored in config/budget (the same lead-writable,
   roster-readable doc family the resin cure overrides use):
     { categories: [{ name, goal }], total: { base, contingency } }
   The categories REPLACE the fixed PURPOSE list in the purchase form once
   defined; old purchases keep whatever purpose string they have and roll up
   as "not in a category" if it matches nothing. The season total is its own
   number on purpose — Simon wants slack, so it does not have to equal the
   category sum — and its base/contingency split stays quiet (a tick on the
   bar and a tooltip), not a headline. */
let budgetCfgFetched = false;
window.BUDGET_CFG = window.BUDGET_CFG || null;
function fetchBudgetCfg() {
  if (budgetCfgFetched || !window.fb || fb.state !== "ready" || !fb.getConfig) return;
  budgetCfgFetched = true;
  fb.getConfig("budget").then(d => { if (d) { window.BUDGET_CFG = d; render(); } }).catch(() => {});
}
function budgetCats() { return ((window.BUDGET_CFG || {}).categories || []).filter(c => c && c.name); }
function budgetTotal() { const t = (window.BUDGET_CFG || {}).total || {}; return { base: num(t.base), contingency: num(t.contingency) }; }
function catSpend(name) {
  const k = String(name || "").toLowerCase();
  return DB.budget.filter(b => String(b.purpose || "").toLowerCase() === k).reduce((s, b) => s + num(b.cost), 0);
}
// Members front their own money and wait; this is the treasurer's nag list.
function owedRows() {
  const m = new Map();
  DB.budget.filter(b => b.status !== "Reimbursed" && num(b.cost)).forEach(b => {
    const k = b.purchaser || "—";
    m.set(k, (m.get(k) || 0) + num(b.cost));
  });
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function goalBar(label, spent, goal, opts) {
  opts = opts || {};
  const pct = goal > 0 ? Math.min(100, spent / goal * 100) : 0;
  const cls = goal > 0 && spent > goal ? "over" : (goal > 0 && spent / goal >= 0.8 ? "warn" : "");
  return `<div class="goalrow ${opts.season ? "season" : ""}" ${opts.title ? `title="${opts.title}"` : ""}>
    <span class="goallabel">${esc(label)}</span>
    <span class="goaltrack"><span class="goalfill ${cls}" style="width:${pct.toFixed(1)}%"></span>${opts.tickPct != null ? `<span class="goaltick" style="left:${opts.tickPct.toFixed(1)}%"></span>` : ""}</span>
    <span class="goalnum ${cls === "over" ? "over" : ""}">$${spent.toFixed(0)} / $${goal.toFixed(0)}${cls === "over" ? " · OVER" : ""}</span>
  </div>`;
}
function budgetBoardsHtml(totalSpent) {
  const cats = budgetCats();
  const T = budgetTotal();
  const cap = T.base + T.contingency;
  if (!cats.length && !cap) {
    return isLead() ? `<div class="card no-print"><span class="muted">No budget goals set yet.</span>
      <button class="sm" onclick="openBudgetGoals()">Set budget goals</button></div>` : "";
  }
  const categorized = cats.reduce((s, c) => s + catSpend(c.name), 0);
  const loose = totalSpent - categorized;
  const owed = owedRows();
  return `<div class="budget-boards">
    <div class="card goalcard">
      <h3 class="goalhead">Budget goals ${isLead() ? `<button class="sm no-print" onclick="openBudgetGoals()">Edit goals</button>` : ""}</h3>
      ${cap ? goalBar("Season", totalSpent, cap, {
        season: true,
        // The quiet split: the tick marks where base ends and contingency begins.
        tickPct: cap > 0 ? Math.min(100, T.base / cap * 100) : null,
        title: `base $${T.base.toFixed(0)} + contingency $${T.contingency.toFixed(0)}`,
      }) : ""}
      ${cats.map(c => goalBar(c.name, catSpend(c.name), num(c.goal))).join("")}
      ${loose > 0.005 && cats.length ? `<div class="muted tny" style="margin-top:6px">$${loose.toFixed(2)} not in any category</div>` : ""}
    </div>
    ${owed.length ? `<div class="card owedcard">
      <h3>Waiting on reimbursement</h3>
      ${owed.map(([who, amt]) => `<div class="orow"><span>${esc(who)}</span><b>$${amt.toFixed(2)}</b></div>`).join("")}
    </div>` : ""}
  </div>`;
}

/* The purchase's category is over its goal (counting this purchase): shown on
   the detail as a warning, never a block — the part still gets bought, the
   lead just finds out now instead of at the spreadsheet reckoning. */
function buyGoalWarning(b) {
  const cat = budgetCats().find(c => String(c.name).toLowerCase() === String(b.purpose || "").toLowerCase());
  if (!cat || !num(cat.goal)) return null;
  const spent = catSpend(cat.name);
  if (spent <= num(cat.goal)) return null;
  return `${cat.name} is $${(spent - num(cat.goal)).toFixed(0)} over its $${num(cat.goal).toFixed(0)} goal, counting this purchase.`;
}

/* ---------- the goals editor (lead only; config rules enforce it) ---------- */
let bgDraft = null;
function openBudgetGoals() {
  bgDraft = {
    categories: budgetCats().map(c => ({ name: c.name, goal: num(c.goal) || "" })),
    total: budgetTotal(),
  };
  if (!bgDraft.categories.length) bgDraft.categories = [{ name: "", goal: "" }];
  bgModal();
}
function bgModal() {
  openModal(`<h3>Budget goals</h3>
    <p class="muted tny">Categories become the Purpose choices on new purchases. The season total is separate on purpose — it may carry slack beyond the category goals.</p>
    ${bgDraft.categories.map((c, i) => `<div class="row" style="gap:8px;margin-bottom:6px">
      <input class="bg-name" placeholder="Category" value="${esc(c.name)}">
      <input class="bg-goal" placeholder="Goal $" value="${esc(c.goal)}">
      <button class="sm" onclick="bgRmRow(${i})" title="Remove this category">✕</button>
    </div>`).join("")}
    <div class="no-print" style="margin-bottom:10px"><button class="sm" onclick="bgAddRow()">+ Add category</button></div>
    <div class="row" style="gap:8px">
      <div class="f" style="flex:1"><label>Season base ($)</label><input id="bg-base" value="${esc(bgDraft.total.base || "")}"></div>
      <div class="f" style="flex:1"><label>Contingency ($)</label><input id="bg-cont" value="${esc(bgDraft.total.contingency || "")}"></div>
    </div>
    <div class="foot"><button onclick="closeModal()">Cancel</button>
      <button class="primary" onclick="saveBudgetGoals()">Save</button></div>`);
}
function bgReadDom() {
  const names = [...document.querySelectorAll(".bg-name")];
  const goals = [...document.querySelectorAll(".bg-goal")];
  bgDraft.categories = names.map((n, i) => ({ name: n.value.trim(), goal: goals[i] ? goals[i].value : "" }));
  const base = document.getElementById("bg-base"), cont = document.getElementById("bg-cont");
  bgDraft.total = { base: base ? base.value : "", contingency: cont ? cont.value : "" };
}
function bgAddRow() { bgReadDom(); bgDraft.categories.push({ name: "", goal: "" }); bgModal(); }
function bgRmRow(i) { bgReadDom(); bgDraft.categories.splice(i, 1); if (!bgDraft.categories.length) bgDraft.categories = [{ name: "", goal: "" }]; bgModal(); }
async function saveBudgetGoals() {
  bgReadDom();
  const cfg = {
    categories: bgDraft.categories.filter(c => c.name).map(c => ({ name: c.name, goal: num(c.goal) })),
    total: { base: num(bgDraft.total.base), contingency: num(bgDraft.total.contingency) },
  };
  try {
    await fb.setConfig("budget", cfg);
    window.BUDGET_CFG = cfg;
    closeModal(); render(); toast("Budget goals saved.");
  } catch (e) { toast("Couldn't save goals: " + e.message, "error"); }
}

async function newBuy() {
  const id = await allocId("budget");
  if (!id) return;
  const b = {
    id, item: "", purchaser: signerName(), purpose: (budgetCats()[0] || {}).name || "Manufacturing", status: "Submitted",
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

/* ---------- line items ----------
 *
 * A purchase can carry what was actually in it: one line per thing, with the
 * TOTAL and the COUNT typed (that's what a receipt says) and the unit price
 * derived live — $20 × 4 shows $5.00 ea while you type. Lines never write
 * `cost` by themselves: a line edit silently flipping the $50 approval gate
 * is a correctness bug (the integrity critic's veto), so the sum is offered
 * through an explicit "= set cost" button plus a visible mismatch chip.
 * Legacy purchases with no lines behave exactly as before. lineId keys every
 * mutation; chunk 5's receiving stamps lotRefs/receivedOn onto a line. */

function buyLines(b) { return b && Array.isArray(b.lines) ? b.lines : []; }

function buyLineEach(l) {
  const t = parseLooseMoney(l.total);
  const q = parseLooseMoney(l.qty);
  const n = q == null ? 1 : q;                 // no count typed = one of it
  if (t == null || !(n > 0)) return null;
  return Math.round(t / n * 100) / 100;
}

function buyLineSum(b) {
  let sum = 0, priced = 0;
  for (const l of buyLines(b)) {
    const t = parseLooseMoney(l.total);
    if (t != null) { sum += t; priced++; }
  }
  return { sum: Math.round(sum * 100) / 100, priced, count: buyLines(b).length };
}

function buyLineAdd() {
  const b = buyById(view.id);
  if (!b) return;
  const line = { lineId: bomLineId(), desc: "", qty: "1", total: "", lotRefs: [], receivedOn: "" };
  (b.lines = b.lines || []).push(line);
  saveField("budget", b, "lines", arr => [...(arr || []), line]);
  render();
  // The pen lands on the new row's first cell; from there it's Tab, Tab, Tab.
  const el = document.getElementById("bds-" + line.lineId);
  if (el && el.focus) el.focus();
}
function buyLineUpd(lid, k, v) {
  const b = buyById(view.id);
  const l = b && buyLines(b).find(x => x.lineId === lid);
  if (!l) return;
  l[k] = v;
  saveField("budget", b, "lines", arr => (arr || []).map(x => x.lineId === lid ? { ...x, [k]: v } : x));
  /* NO render() here, on purpose: onchange fires while Tab is moving focus
     to the next field, and a whole-page repaint destroys that field mid-hop
     — the grid became untabbable. The three things a line edit can change
     (its "each" cell, the sum, the match chip) update in place instead. */
  buyLinesRefresh(lid);
}
function buyLinesRefresh(lid) {
  const b = buyById(view.id);
  if (!b) return;
  if (lid) {
    const l = buyLines(b).find(x => x.lineId === lid);
    const ea = document.getElementById("ea-" + lid);
    if (l && ea) { const each = buyLineEach(l); ea.textContent = each == null ? "" : fmtMoney(each) + " ea"; }
  }
  const s = buyLineSum(b);
  const sumEl = document.getElementById("bl-sum");
  if (sumEl) sumEl.textContent = buyLineSumText(s);
  const chipEl = document.getElementById("bl-chip");
  if (chipEl) chipEl.innerHTML = buyLineSumChip(b);
}
function buyLineSumText(s) {
  return s.count ? `· sum ${fmtMoney(s.sum)}${s.priced < s.count ? ` (${s.count - s.priced} unpriced)` : ""}` : "";
}
function buyLineDel(lid) {
  const b = buyById(view.id);
  if (!b) return;
  b.lines = buyLines(b).filter(x => x.lineId !== lid);
  saveField("budget", b, "lines", arr => (arr || []).filter(x => x.lineId !== lid));
  render();
}
/* The live half: while total or count is being typed, only the "each" cell
   moves — no render, no save, just the aha of the unit price materializing. */
function buyLineLive(lid) {
  const ea = document.getElementById("ea-" + lid);
  if (!ea) return;
  const each = buyLineEach({
    total: (document.getElementById("bt-" + lid) || {}).value,
    qty: (document.getElementById("bq-" + lid) || {}).value,
  });
  ea.textContent = each == null ? "" : fmtMoney(each) + " ea";
}

function setCostFromLines(id) {
  const b = buyById(id);
  const s = buyLineSum(b);
  if (!s.count) return;
  b.cost = s.sum.toFixed(2);
  saveBuy(b, "cost");
  toast(`Cost set to ${fmtMoney(s.sum)} from ${s.count} line${s.count === 1 ? "" : "s"}.`);
  render();
}

/* "⚖ matches cost" or "⚠ cost says $18.00" beside the sum. Disagreement is
   shown, never silently fixed. */
function buyLineSumChip(b) {
  const s = buyLineSum(b);
  if (!s.count) return "";
  const cost = num(b.cost);
  const agree = Math.abs(cost - s.sum) < 0.005;
  return agree
    ? `<span class="tny muted nocaps">⚖ matches cost</span>`
    : `<span class="tny nocaps">⚠ cost field says ${fmtMoney(Math.round(cost * 100) / 100) || "$0.00"}</span>
       <button class="sm no-print" onclick="setCostFromLines('${esc(b.id)}')">= set cost from lines</button>`;
}

function buyLinesHtml(b, E) {
  const lines = buyLines(b);
  if (!lines.length && !E) return "";
  const s = buyLineSum(b);
  const rows = lines.map(l => {
    const lid = esc(l.lineId || "");
    const each = buyLineEach(l);
    if (!E) {
      return `<tr><td>${esc(l.desc)}${(l.lotRefs || []).length ? ` ${l.lotRefs.map(id => shopRefChip(String(id))).join("")}` : ""}</td>
        <td>${esc(l.total)}</td><td>${esc(l.qty) || "1"}</td>
        <td>${each == null ? '<span class="muted">—</span>' : esc(fmtMoney(each)) + " ea"}</td></tr>`;
    }
    /* The money cells wear the list's own .buy-cost dress ($-prefixed,
       right-aligned, fixed width) so the grid reads like the rest of the
       tab; the derived "each" cell is output, muted, never an input. The
       trash button sits outside the Tab order — Tab is for filling cells,
       and the next stop after a row's count is the next row's item. */
    return `<tr>
      <td><input id="bds-${lid}" value="${esc(l.desc)}" placeholder="what it is" aria-label="Line item" onchange="buyLineUpd('${lid}','desc',this.value)"></td>
      <td class="buy-cost">$<input id="bt-${lid}" value="${esc(l.total)}" inputmode="decimal" aria-label="Line total in dollars" oninput="buyLineLive('${lid}')" onchange="buyLineUpd('${lid}','total',this.value)"></td>
      <td class="buy-cost">×<input id="bq-${lid}" class="bl-n" value="${esc(l.qty)}" inputmode="numeric" aria-label="How many" oninput="buyLineLive('${lid}')" onchange="buyLineUpd('${lid}','qty',this.value)"></td>
      <td class="muted"><span id="ea-${lid}">${each == null ? "" : esc(fmtMoney(each)) + " ea"}</span></td>
      <td><button class="danger ib sm" tabindex="-1" title="Remove line" onclick="buyLineDel('${lid}')">${icon("trash", 13)}</button></td>
    </tr>`;
  }).join("");
  return `
    <h3>Line items <span id="bl-sum" class="muted nocaps">${esc(buyLineSumText(s))}</span> <span id="bl-chip">${s.count ? buyLineSumChip(b) : ""}</span></h3>
    ${lines.length ? `<table class="sub"><thead><tr><th>Item</th><th>Total $</th><th>Count</th><th>Each</th>${E ? "<th></th>" : ""}</tr></thead><tbody>${rows}</tbody></table>`
      : `<p class="muted">What was actually in the order — one line per thing, total and count, the unit price works itself out.</p>`}
    ${E ? `<button onclick="buyLineAdd()">+ Line</button>
    ${b.receiptPath ? `<button class="no-print" onclick="fillLinesFromReceipt('${esc(b.id)}')" title="Read the receipt photo into editable line items">✨ Fill from receipt</button>` : ""}` : ""}`;
}

/* ---------- receipt -> proposed lines ----------
 * The ✨ button calls the parseReceipt Cloud Function and drops the answer
 * into the SAME editable grid — parsing is a prefill, never a separate mode,
 * so a wrong read is fixed by typing in a normal cell and a dead function
 * degrades to the manual editor. Existing lines are never touched without a
 * confirm. */
let RECEIPT_PARSING = false;
async function fillLinesFromReceipt(id) {
  const b = buyById(id);
  if (!b || RECEIPT_PARSING) return;
  if (!b.receiptPath) { toast("Add a receipt photo first — the ✨ reads that.", "error"); return; }
  if (buyLines(b).length) {
    const go = await confirmAsync("This purchase already has line items. Add what the receipt says underneath them?", { ok: "Add lines", danger: false });
    if (!go) return;
  }
  RECEIPT_PARSING = true;
  toast("Reading the receipt…");
  try {
    const out = await fb.call("parseReceipt", { path: b.receiptPath });
    const lines = (out && out.lines || []).map(l => ({
      lineId: bomLineId(), desc: l.desc || "", qty: l.qty || "1", total: l.total || "", lotRefs: [], receivedOn: "",
    }));
    if (!lines.length) { toast("Couldn't find line items on that photo — type them in, it's five cells.", "error"); return; }
    b.lines = [...buyLines(b), ...lines];
    saveField("budget", b, "lines", arr => [...(arr || []), ...lines]);
    if (out.vendor && !String(b.source || "").trim()) { b.source = out.vendor; saveBuy(b, "source"); }
    toast(`${lines.length} line${lines.length === 1 ? "" : "s"} read from the receipt — every cell is editable.`);
    view.edit = true;
    render();
  } catch (e) {
    toast("Receipt parsing isn't available (" + (e && e.message || "no function") + ") — the manual grid still works.", "error");
  } finally {
    RECEIPT_PARSING = false;
  }
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
  fetchBudgetCfg();
  return `
  <div class="stat-row">
    <div class="stat-tile"><div class="bignum">$${total.toFixed(0)}</div><div class="stat-label">Season total</div></div>
    <div class="stat-tile"><div class="bignum">${open.length}</div><div class="stat-label">Open orders ($${openSum.toFixed(0)})</div></div>
    <div class="stat-tile"><div class="bignum">${unapproved}</div><div class="stat-label">Over $50, unapproved</div></div>
  </div>
  ${budgetBoardsHtml(total)}
  <div class="toolbar no-print"><button class="primary"${gx("Sign in to log a purchase — it is recorded against you.")} onclick="newBuy()">+ New Purchase</button></div>
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
    ${/* Status and cost are edited HERE, in the row (Simon, 2026-08-13): the
          week's real workflow is walking the list marking things Ordered or
          Reimbursed and fixing a price off the receipt, and that took a
          click into the detail and Edit for each one. The row still opens
          the detail; the two live cells stopPropagation so editing never
          navigates. */""}
    ${rows.map(b => {
      /* The category (purpose) is editable here too — tagging a purchase to a
         section is what makes the goal bars true, and a purchase that landed
         uncategorized should be one click to fix. A purpose that matches no
         category stays as its own selected option, so opening the dropdown
         never silently recategorizes. */
      const cats = budgetCats().length ? budgetCats().map(c => c.name) : PURPOSE;
      const opts = (cats.some(c => c.toLowerCase() === String(b.purpose || "").toLowerCase()) || !b.purpose ? cats : [b.purpose, ...cats]);
      return `<tr data-open="${b.id}" onclick="view={...view,mode:'detail',id:'${b.id}',edit:false};render()">
      <td><b>${esc(b.item || b.id)}</b>${b.retro ? ' <span class="pill retro">retro</span>' : ""}${needsApproval(b) ? ' <span class="pill OnHold" title="Over $50 — needs #purchasing sign-off before ordering">needs approval</span>' : ""}</td>
      <td>${esc(b.purchaser || "—")}</td>
      <td onclick="event.stopPropagation()"><select class="buy-cat" onchange="setBuyField('${b.id}','purpose',this.value)" aria-label="Category of ${esc(b.item || b.id)}">
        ${opts.map(o => `<option ${String(b.purpose || "") === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></td>
      <td onclick="event.stopPropagation()"><div class="statusdrop ${buyStatusClass(b.status)}">
        <select onchange="setBuyField('${b.id}','status',this.value)" aria-label="Status of ${esc(b.item || b.id)}">${BUY_STATUS.map(s => `<option ${b.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></div></td>
      <td class="buy-cost" onclick="event.stopPropagation()">$<input value="${num(b.cost).toFixed(2)}"
        onchange="setBuyField('${b.id}','cost',this.value)" aria-label="Cost of ${esc(b.item || b.id)}"></td>
      <td>${esc(b.dateOrdered || "")}</td>
    </tr>`; }).join("")}
  </table>`;
}

/* Row-level edit from the list. Same write path as updBuy but keyed by id
   rather than view.id, because nothing is "open". Rerender always: status and
   cost both feed the stat tiles and the needs-approval pill. */
function setBuyField(id, key, val) {
  const b = buyById(id);
  if (!b) return;
  b[key] = val;
  saveBuy(b, key);
  render();
}

function buyFld(b, label, key, opts) {
  const v = b[key] ?? "";
  if (!view.edit) return `<div class="f"><label>${label}</label><div class="ro">${esc(v) || "—"}</div></div>`;
  // Stable ids so budgetRenderSoon() can hand focus back after a repaint.
  if (opts) return `<div class="f"><label>${label}</label><select id="bf-${key}" onchange="updBuy('${key}',this.value)">${opts.map(o => `<option ${v === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></div>`;
  return `<div class="f"><label>${label}</label><input id="bf-${key}" value="${esc(v)}" onchange="updBuy('${key}',this.value)"></div>`;
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
    ${(() => { const gw = buyGoalWarning(b); return gw ? `<p class="warn">${esc(gw)}</p>` : ""; })()}
    <h3>Details</h3>
    <div class="grid">
      ${buyFld(b, "Item", "item")}${buyFld(b, "Purchaser", "purchaser")}${buyFld(b, "Purpose", "purpose", budgetCats().length ? budgetCats().map(c => c.name) : PURPOSE)}
      ${buyFld(b, "Status", "status", BUY_STATUS)}${buyFld(b, "Cost ($)", "cost")}${buyFld(b, "Date ordered", "dateOrdered")}
      ${buyFld(b, "Source / vendor", "source")}
    </div>
    ${buyLinesHtml(b, E)}
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

function updBuy(key, val) { const b = buyById(view.id); b[key] = val; saveBuy(b, key); if (key === "status" || key === "cost" || key === "purpose") renderSoonKeepFocus(); }
