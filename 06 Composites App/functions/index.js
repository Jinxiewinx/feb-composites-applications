"use strict";
/* The repo's first (and only) backend: one callable that reads a receipt
 * photo and proposes budget line items.
 *
 * WHY A FUNCTION AT ALL. The app is static hosting; parsing needs an
 * Anthropic API key, and a key readable by ~30 rotating students in a
 * Firestore config doc is an open spend faucet (the Slack-webhook precedent
 * does not transfer: a leaked webhook posts noise, a leaked API key spends
 * money). The key lives in a Functions secret, server-side only.
 *
 * WHY IT'S SAFE TO BE DUMB. The client treats the response as a PREFILL of
 * the manual line editor — every cell stays editable, nothing auto-saves,
 * and a failure just leaves the editor empty. So this function can be ~100
 * lines with no retries and no state, and the feature still works when it
 * is down.
 *
 * Deploy (from 06 Composites App/):
 *   firebase functions:secrets:set ANTHROPIC_API_KEY
 *   firebase deploy --only functions
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");

admin.initializeApp();

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

// Haiku-class: a receipt is five lines of OCR-adjacent extraction, not an
// essay. Cold-start plus inference lands well under the patience budget of
// someone who just photographed a receipt.
const MODEL = "claude-haiku-4-5-20251001";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // storage.rules caps receipts at 10 MiB

exports.parseReceipt = onCall(
  { secrets: [ANTHROPIC_API_KEY], region: "us-central1", timeoutSeconds: 60, memory: "512MiB" },
  async (req) => {
    // Same gate as firestore.rules onRoster(): signed in AND on the roster.
    const email = req.auth && req.auth.token && req.auth.token.email;
    if (!email) throw new HttpsError("unauthenticated", "Sign in first.");
    const roster = await admin.firestore().doc(`roster/${email}`).get();
    if (!roster.exists) throw new HttpsError("permission-denied", "Not on the roster.");

    // Only budget receipts. The path shape is budget/{buyId}/{file}, written
    // by attachReceipt(); anything else is refused rather than fetched.
    const path = String((req.data && req.data.path) || "");
    if (!/^budget\/[A-Za-z0-9-]+\/[^/]+$/.test(path)) {
      throw new HttpsError("invalid-argument", "Not a budget receipt path.");
    }

    const file = admin.storage().bucket().file(path);
    const [meta] = await file.getMetadata().catch(() => {
      throw new HttpsError("not-found", "No receipt at that path.");
    });
    const type = String(meta.contentType || "image/jpeg");
    if (!/^image\//.test(type) || Number(meta.size || 0) > MAX_IMAGE_BYTES) {
      throw new HttpsError("invalid-argument", "Receipt must be an image under 10 MiB.");
    }
    const [bytes] = await file.download();

    const body = {
      model: MODEL,
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: type, data: bytes.toString("base64") } },
          { type: "text", text:
            'Read this purchase receipt. Return ONLY a JSON object, no prose: ' +
            '{"lines":[{"desc":"<short item name>","qty":"<count, digits, default 1>","total":"<line total in dollars, digits and decimal point only>"}],' +
            '"vendor":"<store name or empty>","receiptTotal":"<grand total or empty>"}. ' +
            'One entry per purchased item; skip tax/subtotal/payment rows but include shipping as its own line if charged. ' +
            'If a value is unreadable, use an empty string rather than guessing.' },
        ],
      }],
    };

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY.value(),
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      throw new HttpsError("internal", `Model call failed (${resp.status}).`, detail.slice(0, 500));
    }
    const out = await resp.json();
    const text = ((out.content || []).find((c) => c.type === "text") || {}).text || "";

    // The model is asked for bare JSON; tolerate a fenced block, refuse the rest.
    const m = text.match(/\{[\s\S]*\}/);
    let parsed;
    try { parsed = JSON.parse(m ? m[0] : text); } catch (e) {
      throw new HttpsError("internal", "Couldn't read the model's answer as line items.");
    }
    const lines = (Array.isArray(parsed.lines) ? parsed.lines : []).slice(0, 50).map((l) => ({
      desc: String(l.desc || "").slice(0, 200),
      qty: String(l.qty || "").replace(/[^\d.]/g, "").slice(0, 10),
      total: String(l.total || "").replace(/[^\d.]/g, "").slice(0, 12),
    })).filter((l) => l.desc);

    return {
      lines,
      vendor: String(parsed.vendor || "").slice(0, 100),
      receiptTotal: String(parsed.receiptTotal || "").replace(/[^\d.]/g, "").slice(0, 12),
    };
  }
);
