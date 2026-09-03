/* util.js — DOM helpers shared by every module. Lives apart from core.js so
   shell.js can use them without importing core.js (which imports shell.js). */
export const $ = s => document.querySelector(s);
export const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
export function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
export function toast(msg, kind) {
  const t = el("div", "toast " + (kind === "err" ? "err" : kind === "ok" ? "ok" : "info"), esc(msg));
  $("#toasts").appendChild(t);
  setTimeout(() => { t.classList.add("hide"); setTimeout(() => t.remove(), 350); }, 3200);
}
export const fmtMB = b => (b / 1048576).toFixed(b >= 10485760 ? 0 : 1) + " MB";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/* "29 Mar", the composites app's short date. */
export function shortDate(iso) {
  if (!iso) return "";
  const d = new Date(iso); if (isNaN(d)) return "";
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
export const fmtN = (v, digits = 0) => v == null || !isFinite(v) ? "—" : v.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
