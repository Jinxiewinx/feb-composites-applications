"use strict";
/* meshview.js — the mold sitting inside its stock, in 3D, rotatable.

   WHY THIS EXISTS
   ===============
   stackview.js draws the exploded isometric SVG, and that stays: it is what
   gets printed and initialled for the CS-003 §7.2 review blocker. But it shows
   the mold as a dashed outline traced on each layer's top face, so a reviewer
   confirming "the mold fits inside these blocks" is reading a 2D trace and
   taking the third dimension on trust. This view answers the question directly
   — the actual mesh, inside the actual blocks, from any angle.

   Screen only. It is hidden in print (index.html's @media print) because a
   canvas is not a reliable printed artifact and the SVG already is one.

   WHY NOT THREE.JS
   ================
   The app ships no external scripts at all. three.js is 331 KB raw / 77 KB
   gzipped against a ~400 KB payload, and this needs one shader, flat shading
   and an orbit camera. So: hand-rolled, and split the way slicer.js is —
   the MATH below is pure and tested under node in tools/test_app.mjs, the GL
   glue underneath it is thin and only ever runs in a browser.

   TRANSPARENCY
   ============
   No sorting. Draw the mold opaque with depth write on, then the block faces
   with depth write OFF and blending on. The depth buffer still hides blocks
   behind the mold, but blocks stop fighting each other for who is in front —
   which for a stack of mostly-disjoint slabs looks right and costs nothing.
   Edges are drawn opaque so the block boundaries stay legible regardless. */

/* ============================ pure math ============================
   Column-major Float32Array(16), which is what WebGL's uniformMatrix4fv wants
   without a transpose. */

function mat4Multiply(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return o;
}
function mat4Perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2);
  const o = new Float32Array(16);
  o[0] = f / aspect; o[5] = f;
  o[10] = (far + near) / (near - far); o[11] = -1;
  o[14] = (2 * far * near) / (near - far);
  return o;
}
function mat4LookAt(eye, center, up) {
  const zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
  const zl = Math.hypot(zx, zy, zz) || 1;
  const z = [zx / zl, zy / zl, zz / zl];
  let x = [up[1] * z[2] - up[2] * z[1], up[2] * z[0] - up[0] * z[2], up[0] * z[1] - up[1] * z[0]];
  const xl = Math.hypot(x[0], x[1], x[2]) || 1;
  x = [x[0] / xl, x[1] / xl, x[2] / xl];
  const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]),
    -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]),
    -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]), 1,
  ]);
}

// Z is up here, matching the slicer's frame (layers stack along +Z), so pitch is
// the angle above the XY plane rather than the usual Y-up convention.
function orbitEye(yaw, pitch, dist, center) {
  const cp = Math.cos(pitch);
  return [
    center[0] + dist * cp * Math.cos(yaw),
    center[1] + dist * cp * Math.sin(yaw),
    center[2] + dist * Math.sin(pitch),
  ];
}
function boundsCenter(b) { return [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2]; }
function boundsRadius(b) { return 0.5 * Math.hypot(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0); }

/* Distance that frames the whole bounding sphere. Uses the NARROWER of the two
   field-of-view angles: on a wide short canvas the vertical one binds, on a
   narrow tall one the horizontal does, and picking the wrong one crops the mold
   off the edge of the view. 1.15 is breathing room. */
function fitDistance(bounds, fovY, aspect) {
  const r = boundsRadius(bounds);
  if (!(r > 0)) return 1;
  const fovX = 2 * Math.atan(Math.tan(fovY / 2) * Math.max(0.0001, aspect));
  return (r / Math.sin(Math.min(fovY, fovX) / 2)) * 1.15;
}

// Pitch is clamped just short of vertical: exactly ±90° makes the view vector
// parallel to `up` and mat4LookAt's cross product collapses, flipping the scene.
const MV_PITCH_LIMIT = Math.PI / 2 - 0.01;
function dragToOrbit(dx, dy, yaw, pitch) {
  const k = 0.008;
  return {
    yaw: yaw - dx * k,
    pitch: Math.max(-MV_PITCH_LIMIT, Math.min(MV_PITCH_LIMIT, pitch + dy * k)),
  };
}
/* The one place the zoom limits live, so the wheel and a pinch cannot disagree
   about how far in or out the camera may go. Bounded so you can't invert through
   the model or shrink it to a dot you then have to hunt for. */
function clampDistance(next, fitted) {
  if (!Number.isFinite(next)) return fitted;
  return Math.max(fitted * 0.15, Math.min(fitted * 6, next));
}
// Wheel zoom (and a trackpad pinch, which arrives as a ctrl-wheel).
function zoomDistance(dist, deltaY, fitted) {
  return clampDistance(dist * Math.exp(deltaY * 0.0015), fitted);
}
/* Touchscreen pinch. The camera distance tracks the INVERSE of the finger span:
   spread your fingers to twice the gap and the model comes twice as close. That
   ratio is what makes a pinch feel attached to the fingers rather than merely
   responding to them — an exponential curve like the wheel's would slide out
   from under the touch. Guards a zero span, which is what a browser reports for
   the instant both pointers are at the same coordinate. */
function pinchDistance(dist, prevSpan, span, fitted) {
  if (!(prevSpan > 0) || !(span > 0)) return dist;
  return clampDistance(dist * (prevSpan / span), fitted);
}
// Gap between two active pointers, in CSS px.
function pointerSpan(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

/* ONE finger orbits, TWO pinch to zoom — as a state machine, with no DOM in it.

   This is the same split the rest of the file makes: the part that can be wrong
   is pure and tested under node, the part that touches the browser is thin. It
   is not a theoretical distinction here. The bug this replaces was that the
   viewer tracked a SINGLE drag point, so a second finger overwrote the first and
   a pinch came out as a spin — the model rotated under your fingers and never
   got closer. On a phone that is the only way to zoom at all: a touchscreen
   pinch produces no wheel event (a trackpad pinch arrives as a ctrl-wheel, which
   is why the desktop path never noticed), and the canvas sets touch-action:none
   so the browser's own pinch is suppressed as well.

   Two behaviours only a real phone shows, both pinned by tests:

     - lifting one finger of two must RE-ANCHOR the orbit on the finger left
       behind, or the next move is measured from the finger that went away and
       the model jumps by the whole gap between them.
     - a CANCELLED pointer has to be treated exactly like a lifted one. The
       browser cancels whenever it takes a gesture over, and a pointer that is
       never cleaned up stays "down" forever — the model then spins on the next
       unrelated touch anywhere on the page. */
function mvGesture() {
  const pts = new Map();      // pointerId -> {x, y}
  let orbitId = null;
  let span = 0;
  const ids = () => [...pts.keys()];
  const rearm = () => {
    const k = ids();
    if (k.length >= 2) {
      orbitId = null;                                   // two fingers: pinching, not orbiting
      span = pointerSpan(pts.get(k[0]), pts.get(k[1]));
    } else {
      orbitId = k.length ? k[0] : null;
      span = 0;
    }
  };
  return {
    count: () => pts.size,
    down(id, x, y) { pts.set(id, { x, y }); rearm(); },
    up(id) { pts.delete(id); rearm(); },
    /* Returns what the camera should do, or null for a pointer that is merely
       along for the ride: {kind:"orbit", dx, dy} or {kind:"pinch", prevSpan, span}. */
    move(id, x, y) {
      if (!pts.has(id)) return null;
      const prev = pts.get(id);
      pts.set(id, { x, y });
      const k = ids();
      if (k.length >= 2) {
        const next = pointerSpan(pts.get(k[0]), pts.get(k[1]));
        const out = { kind: "pinch", prevSpan: span, span: next };
        span = next;
        return out;
      }
      if (id !== orbitId) return null;
      return { kind: "orbit", dx: x - prev.x, dy: y - prev.y };
    },
  };
}

/* Triangles -> interleaved position+normal arrays for one flat-shaded draw.
   Normals are per-FACE, repeated across the face's three vertices: flat shading
   is what makes a machined block read as faceted rather than as a smooth blob,
   and it avoids needing adjacency to average anything. */
function trisToBuffers(tris) {
  const n = tris.length;
  const pos = new Float32Array(n * 9);
  const nrm = new Float32Array(n * 9);
  for (let i = 0; i < n; i++) {
    const t = tris[i];
    const f = triNormal(t);
    const p = i * 9;
    pos[p] = t.ax; pos[p + 1] = t.ay; pos[p + 2] = t.az;
    pos[p + 3] = t.bx; pos[p + 4] = t.by; pos[p + 5] = t.bz;
    pos[p + 6] = t.cx; pos[p + 7] = t.cy; pos[p + 8] = t.cz;
    for (let v = 0; v < 3; v++) { nrm[p + v * 3] = f.x; nrm[p + v * 3 + 1] = f.y; nrm[p + v * 3 + 2] = f.z; }
  }
  return { pos, nrm, count: n * 3 };
}
// The 12 edges of one blank, as GL_LINES vertex pairs.
function blankEdgeVerts(b, z0, z1) {
  const P = (i, j, k) => [i ? b.x1 : b.x0, j ? b.y1 : b.y0, k ? z1 : z0];
  const c = [P(0,0,0), P(1,0,0), P(1,1,0), P(0,1,0), P(0,0,1), P(1,0,1), P(1,1,1), P(0,1,1)];
  const E = [[0,1],[1,2],[2,3],[3,0], [4,5],[5,6],[6,7],[7,4], [0,4],[1,5],[2,6],[3,7]];
  const out = [];
  E.forEach(([a, z]) => { out.push(...c[a], ...c[z]); });
  return new Float32Array(out);
}
// Every blank of the plan, as triangles and as edge lines.
function stockGeometry(plan) {
  const tris = [];
  const edges = [];
  ((plan && plan.layers) || []).forEach(L => (L.blanks || []).forEach(b => {
    tris.push(...blankTris(b, L.z0, L.z1));
    edges.push(blankEdgeVerts(b, L.z0, L.z1));
  }));
  const total = edges.reduce((n, e) => n + e.length, 0);
  const edgeArr = new Float32Array(total);
  let o = 0;
  edges.forEach(e => { edgeArr.set(e, o); o += e.length; });
  return { tris, edges: edgeArr };
}
// Union of the stock blocks; the camera frames THIS, not the mold, because the
// stock is always the larger of the two and is what has to be seen whole.
function stockBounds(plan) {
  let b = null;
  ((plan && plan.layers) || []).forEach(L => (L.blanks || []).forEach(k => {
    const one = { x0: k.x0, y0: k.y0, z0: L.z0, x1: k.x1, y1: k.y1, z1: L.z1 };
    b = b ? {
      x0: Math.min(b.x0, one.x0), y0: Math.min(b.y0, one.y0), z0: Math.min(b.z0, one.z0),
      x1: Math.max(b.x1, one.x1), y1: Math.max(b.y1, one.y1), z1: Math.max(b.z1, one.z1),
    } : one;
  }));
  return b;
}

/* ============================ browser glue ============================ */

const MV_FOV = Math.PI / 4;
// Camera per plan id, so the routine re-render that a teammate's edit triggers
// doesn't snap the view back to the default angle mid-inspection.
const MV_CAM = {};
const MV_MESH = {};      // meshUrl -> triangles, fetched once
const MV_MESH_ERR = {};  // planId -> why the mesh didn't load, so a remount can say so again
let MV_LIVE = null;      // the mounted viewer, so a re-render can tear it down

function mvHasWebGL() {
  if (typeof document === "undefined" || !document.createElement) return false;
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext && (c.getContext("webgl") || c.getContext("experimental-webgl")));
  } catch (e) { return false; }
}

/* The markup, plus a deferred mount. render() assigns innerHTML synchronously,
   so the canvas does not exist yet when this string is built — setTimeout(0)
   runs after it lands, the same trick documents.js uses to re-render after its
   manifest fetch. */
function meshViewHtml(plan) {
  const stock = stockBounds(plan);
  if (!stock) return `<p class="muted">No blocks in this plan to show.</p>`;
  if (!mvHasWebGL()) {
    return `<p class="muted">This browser has no WebGL, so the 3D view is unavailable. The exploded view below shows the same stack.</p>`;
  }
  const id = "mv-" + plan.id;
  if (typeof setTimeout === "function") setTimeout(() => mvMount(id, plan.id), 0);
  return `<div class="meshview no-print">
    <canvas id="${id}" aria-label="Three-dimensional view of the mold inside its stock blocks"></canvas>
    <div class="meshview-hint">
      <span class="mv-swatch mv-mold"></span> mold
      <span class="mv-swatch mv-stock"></span> stock
      <button class="btn sm" onclick="mvReset('${esc(plan.id)}')">Reset view</button>
    </div>
    ${plan.meshUrl
      ? (MV_MESH_ERR[plan.id] ? `<div class="meshview-note muted tny">${esc(MV_MESH_ERR[plan.id])}</div>` : "")
      : `<div class="meshview-note muted tny">This plan has no stored mold mesh, so only the blocks are shown. Plans made before the 3D view existed, or one whose mesh upload failed, look like this — re-plan the mold to add it.</div>`}
  </div>`;
}

function mvReset(planId) { delete MV_CAM[planId]; if (MV_LIVE && MV_LIVE.planId === planId) { mvInitCam(MV_LIVE); mvDraw(MV_LIVE); } }

/* The canvas clear colour and the edge colour both follow the theme, and
   toggleTheme() only redraws the topbar — not #main — so without this hook a
   live viewer keeps its old background until something else happens to
   re-render the page. Called from core.js's toggleTheme(). */
function mvThemeChanged() { if (MV_LIVE) mvSchedule(MV_LIVE); }

/* Framing distance and near/far for one viewport, plus whichever camera angles
   apply — the saved ones if this plan has been looked at before, the default
   three-quarter view if not.

   Pure, and separate from MV_CAM on purpose. These two jobs used to live in one
   function that ran ONLY when no saved camera existed, so `fitted` was left
   undefined on every remount — and since render() rebuilds #main on each
   Firestore snapshot, a remount is what normally happens. mat4Perspective then
   got Math.max(0.1, undefined/100), which is NaN (Math.max propagates it), so
   the whole projection matrix went NaN and the canvas drew nothing until a
   reload cleared MV_CAM. Keeping the fit unconditional is the fix; keeping it
   pure is what lets a test pin it. */
function viewerCamera(bounds, w, h, saved) {
  const aspect = Math.max(0.2, (w || 1) / Math.max(1, h || 1));
  const fitted = fitDistance(bounds, MV_FOV, aspect);
  const base = saved && Number.isFinite(saved.dist)
    ? saved
    : { yaw: -Math.PI / 4, pitch: 0.5, dist: fitted };
  return {
    yaw: base.yaw, pitch: base.pitch, dist: base.dist, fitted,
    near: Math.max(0.1, fitted / 100), far: fitted * 12,
  };
}
// Apply the fit to a live viewer, seeding MV_CAM only the first time.
function mvFit(v) {
  const c = viewerCamera(v.bounds, v.canvas.clientWidth, v.canvas.clientHeight, MV_CAM[v.planId]);
  v.fitted = c.fitted; v.near = c.near; v.far = c.far;
  MV_CAM[v.planId] = { yaw: c.yaw, pitch: c.pitch, dist: c.dist };
  return c;
}
function mvInitCam(v) { delete MV_CAM[v.planId]; return mvFit(v); }

const MV_VERT = `
attribute vec3 aPos; attribute vec3 aNormal;
uniform mat4 uMVP; varying vec3 vN;
void main(){ vN = aNormal; gl_Position = uMVP * vec4(aPos, 1.0); }`;
/* abs(), not max(…, 0): two-sided lighting, so a face lights the same whichever
   way it is wound. The slicer already goes out of its way to accept rough real
   exports (see stitchRelaxed), and inconsistent winding is one of the things
   those turn up — with one-sided lighting every inward-facing triangle drops to
   the ambient term and the mold renders as a black silhouette. We do not
   control the mesh, and this is a display, so shade both sides. */
const MV_FRAG = `
precision mediump float;
varying vec3 vN; uniform vec4 uColor; uniform vec3 uLight; uniform float uShade;
void main(){
  float d = abs(dot(normalize(vN), normalize(uLight)));
  float sh = mix(1.0, 0.42 + 0.58 * d, uShade);
  gl_FragColor = vec4(uColor.rgb * sh, uColor.a);
}`;

function mvCompile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader");
  return s;
}
function mvBuffer(gl, data) {
  const b = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  return b;
}

async function mvMount(canvasId, planId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const plan = typeof planById === "function" ? planById(planId) : null;
  if (!plan) return;
  /* Idempotent per canvas ELEMENT. render() runs once per Firestore snapshot
     and each run schedules a mount, so a burst of saves queues a burst of
     mounts that all resolve to the one canvas now in the DOM. Without this
     guard the second mount tears down the context the first just built —
     losing it — and then tries to compile a shader against the dead context,
     which throws and leaves a permanently blank canvas. A genuinely new render
     produces a new element, which has no live viewer and mounts normally. */
  if (MV_LIVE && MV_LIVE.canvas === canvas) return;
  if (MV_LIVE) { mvTeardown(MV_LIVE); MV_LIVE = null; }

  const gl = canvas.getContext("webgl", { antialias: true, alpha: false, premultipliedAlpha: false });
  if (!gl) return;

  const geo = stockGeometry(plan);
  const v = {
    planId, canvas, gl, bounds: stockBounds(plan),
    center: boundsCenter(stockBounds(plan)),
    stock: trisToBuffers(geo.tris), edges: geo.edges, mold: null,
    buffers: [], handlers: [], raf: 0,
  };

  const prog = gl.createProgram();
  gl.attachShader(prog, mvCompile(gl, gl.VERTEX_SHADER, MV_VERT));
  gl.attachShader(prog, mvCompile(gl, gl.FRAGMENT_SHADER, MV_FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
  v.prog = prog;
  v.loc = {
    pos: gl.getAttribLocation(prog, "aPos"), nrm: gl.getAttribLocation(prog, "aNormal"),
    mvp: gl.getUniformLocation(prog, "uMVP"), color: gl.getUniformLocation(prog, "uColor"),
    light: gl.getUniformLocation(prog, "uLight"), shade: gl.getUniformLocation(prog, "uShade"),
  };
  v.gpu = {
    stockPos: mvBuffer(gl, v.stock.pos), stockNrm: mvBuffer(gl, v.stock.nrm),
    edgePos: mvBuffer(gl, v.edges), edgeNrm: mvBuffer(gl, new Float32Array(v.edges.length)),
  };

  // Unconditional: the fit belongs to THIS viewport, not to the saved camera.
  mvFit(v);
  MV_LIVE = v;
  mvBindEvents(v);
  mvDraw(v);

  // The mesh is a separate, slower story than the blocks: show the blocks
  // immediately and let the mold appear when it arrives, rather than staring at
  // an empty canvas while a few MB downloads.
  if (plan.meshUrl) {
    try {
      const tris = await mvLoadMesh(plan.meshUrl);
      if (MV_LIVE !== v || !tris.length) return;
      v.mold = trisToBuffers(tris);
      v.gpu.moldPos = mvBuffer(gl, v.mold.pos);
      v.gpu.moldNrm = mvBuffer(gl, v.mold.nrm);
      mvDraw(v);
    } catch (e) {
      /* Blocks-only is a survivable outcome, but a SILENT one is not: the user
         sees a stock stack with no mold in it and has no way to tell whether the
         mold is missing, mis-planned, or just failed to download. Say which.
         Written straight into the note element rather than via render(), which
         would remount the viewer and start the whole fetch over. */
      MV_MESH_ERR[planId] = e.message;
      mvShowNote(e.message);
      console.warn("mesh load failed for " + planId + ":", e);
    }
  }
}
// The note slot already exists in the markup for the "no stored mesh" case;
// this is one more state in it, not new furniture.
function mvShowNote(msg) {
  const host = document.querySelector(".meshview");
  if (!host) return;
  let note = host.querySelector(".meshview-note");
  if (!note) {
    note = document.createElement("div");
    note.className = "meshview-note muted tny";
    host.appendChild(note);
  }
  note.textContent = msg;
}

/* Fetch and parse the stored mold mesh, naming the failure instead of hiding it.
   Every one of these used to collapse into one bare `catch {}`, so a mold that
   never loaded looked exactly like a plan that never had one: blocks, no mold,
   no explanation anywhere. */
async function mvLoadMesh(url) {
  if (MV_MESH[url]) return MV_MESH[url];
  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    // A cross-origin fetch the browser refuses rejects here with a TypeError and
    // no status at all — the request never left. That is the default state of a
    // Storage bucket with no CORS policy, and it's what shipped: every other
    // Storage URL in this app is used by <img src> or <a href>, which need no
    // CORS, so this was the first fetch() to ever hit it.
    throw new Error("The browser blocked the request for the 3D mesh. The storage bucket needs a CORS rule allowing GET from this site — see cors.json and the setup note in the app README.");
  }
  if (!res.ok) {
    throw new Error(res.status === 403
      ? "Storage refused the 3D mesh (403). Deploy storage.rules — the stackplans/ rule may not be live yet."
      : res.status === 404
        ? "The stored 3D mesh is missing (404). Re-plan the mold to regenerate it."
        : `Couldn't download the 3D mesh (HTTP ${res.status}).`);
  }
  const buf = await res.arrayBuffer();
  let tris;
  try { tris = parseSTL(buf).tris; }
  catch (e) { throw new Error("The stored 3D mesh isn't a readable STL: " + e.message); }
  MV_MESH[url] = tris;
  return tris;
}

/* Release the previous viewer completely, INCLUDING its GL context.
   render() rebuilds #main from scratch on every Firestore snapshot — a
   teammate saving anything re-renders this page — so each one hands us a brand
   new <canvas> and we ask for a brand new context. Browsers cap how many live
   WebGL contexts a page may hold (Chromium ~16) and silently drop the oldest
   when you pass it, which shows up as the canvas going permanently blank after
   a few minutes on a busy day. Dropping listeners is not enough; the context
   has to be handed back explicitly. */
function mvTeardown(v) {
  if (v.raf) cancelAnimationFrame(v.raf);
  v.handlers.forEach(([el, ev, fn]) => el.removeEventListener(ev, fn));
  v.handlers.length = 0;
  try {
    const ext = v.gl && v.gl.getExtension("WEBGL_lose_context");
    if (ext) ext.loseContext();
  } catch (e) { /* context already gone */ }
}

/* render() rebuilds #main wholesale, so a pane with no viewer drops the canvas
   without telling the viewer. mvMount only tears down when it is about to
   build a replacement, which means leaving a plan and never opening another
   leaks a live GL context attached to a detached canvas — the "canvas goes
   permanently blank after a while on a busy day" failure mvTeardown exists to
   prevent. Rare when the viewer lived on one pane; routine now that every
   planned mold has one. Called from render() after the paint.
   Identity is not compared: if an element with this id is on the page, a
   viewer belongs there and mvMount owns it. */
function mvSweep() {
  if (!MV_LIVE) return;
  if (typeof document === "undefined" || !document.getElementById) return;
  if (document.getElementById(MV_LIVE.canvas.id)) return;
  mvTeardown(MV_LIVE);
  MV_LIVE = null;
}

/* Thin glue over mvGesture: turn pointer events into camera changes. Pointer
   events already cover mouse, pen and touch uniformly, so there is no separate
   touch path to keep in step. */
function mvBindEvents(v) {
  const on = (el, ev, fn, opts) => { el.addEventListener(ev, fn, opts); v.handlers.push([el, ev, fn]); };
  const g = mvGesture();
  const start = e => {
    g.down(e.pointerId, e.clientX, e.clientY);
    // Capture so a finger that slides off the canvas mid-pinch keeps reporting.
    if (v.canvas.setPointerCapture) { try { v.canvas.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ } }
  };
  const move = e => {
    const cam = MV_CAM[v.planId];
    if (!cam) return;
    const act = g.move(e.pointerId, e.clientX, e.clientY);
    if (!act) return;
    if (act.kind === "pinch") {
      cam.dist = pinchDistance(cam.dist, act.prevSpan, act.span, v.fitted);
    } else {
      const o = dragToOrbit(act.dx, act.dy, cam.yaw, cam.pitch);
      cam.yaw = o.yaw; cam.pitch = o.pitch;
    }
    if (e.cancelable) e.preventDefault();
    mvSchedule(v);
  };
  const end = e => g.up(e.pointerId);

  on(v.canvas, "pointerdown", start);
  on(window, "pointermove", move, { passive: false });
  on(window, "pointerup", end);
  on(window, "pointercancel", end);
  on(v.canvas, "wheel", e => {
    const cam = MV_CAM[v.planId];
    cam.dist = zoomDistance(cam.dist, e.deltaY, v.fitted);
    e.preventDefault();
    mvSchedule(v);
  }, { passive: false });
  on(v.canvas, "dblclick", () => mvReset(v.planId));
  on(window, "resize", () => mvSchedule(v));
}
function mvSchedule(v) {
  if (v.raf) return;
  v.raf = requestAnimationFrame(() => { v.raf = 0; mvDraw(v); });
}

function mvDraw(v) {
  const gl = v.gl;
  if (!gl || !MV_CAM[v.planId]) return;
  // Canvas is sized by CSS; match the drawing buffer to it in device pixels so
  // the render isn't soft on a retina screen or a scaled Windows display.
  const dpr = Math.min(2, (typeof devicePixelRatio === "number" ? devicePixelRatio : 1) || 1);
  const w = Math.max(1, Math.round(v.canvas.clientWidth * dpr));
  const h = Math.max(1, Math.round(v.canvas.clientHeight * dpr));
  if (v.canvas.width !== w || v.canvas.height !== h) { v.canvas.width = w; v.canvas.height = h; }
  gl.viewport(0, 0, w, h);

  const dark = typeof currentTheme === "function" && currentTheme() === "dark";
  gl.clearColor.apply(gl, dark ? [0.08, 0.11, 0.16, 1] : [0.93, 0.95, 0.97, 1]);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  gl.useProgram(v.prog);

  // A non-finite fit silently blanks the canvas rather than throwing, which is
  // the worst way for a renderer to fail — it looks like "the feature is broken"
  // with nothing in the console. Re-fit instead of drawing NaN. Read `cam` AFTER
  // this: mvFit replaces MV_CAM[planId], so a reference taken earlier is stale.
  if (!Number.isFinite(v.fitted) || !Number.isFinite(MV_CAM[v.planId].dist)) mvFit(v);
  const cam = MV_CAM[v.planId];
  const aspect = w / h;
  const proj = mat4Perspective(MV_FOV, aspect, v.near, v.far);
  const eye = orbitEye(cam.yaw, cam.pitch, cam.dist, v.center);
  const mvp = mat4Multiply(proj, mat4LookAt(eye, v.center, [0, 0, 1]));
  gl.uniformMatrix4fv(v.loc.mvp, false, mvp);
  // Light rides with the camera, so a face you rotate toward is never black.
  gl.uniform3f(v.loc.light, eye[0] - v.center[0], eye[1] - v.center[1], eye[2] - v.center[2] + v.fitted * 0.4);

  const bind = (posBuf, nrmBuf) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.enableVertexAttribArray(v.loc.pos); gl.vertexAttribPointer(v.loc.pos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, nrmBuf);
    gl.enableVertexAttribArray(v.loc.nrm); gl.vertexAttribPointer(v.loc.nrm, 3, gl.FLOAT, false, 0, 0);
  };

  // 1. The mold, opaque and depth-writing, so stock behind it is correctly hidden.
  gl.disable(gl.BLEND);
  gl.depthMask(true);
  if (v.mold) {
    gl.uniform4f(v.loc.color, 0.18, 0.42, 0.89, 1);
    gl.uniform1f(v.loc.shade, 1);
    bind(v.gpu.moldPos, v.gpu.moldNrm);
    gl.drawArrays(gl.TRIANGLES, 0, v.mold.count);
  }

  // 2. Block edges, opaque, so the boundaries stay readable through the wash.
  gl.uniform4f(v.loc.color, dark ? 0.62 : 0.16, dark ? 0.68 : 0.20, dark ? 0.78 : 0.28, 1);
  gl.uniform1f(v.loc.shade, 0);
  bind(v.gpu.edgePos, v.gpu.edgeNrm);
  gl.drawArrays(gl.LINES, 0, v.edges.length / 3);

  // 3. Block faces, translucent, depth-test on but depth-write OFF — see the
  //    transparency note at the top of the file.
  //
  //    Polygon offset because the two surfaces are routinely EXACTLY coplanar:
  //    a stack that fits the mold perfectly puts the top block's top face on the
  //    same plane as the mold's, and the resulting z-fight draws a shimmering
  //    comb along the edge that reads as a rendering bug. Nudging the stock back
  //    lets the mold win the tie, which is also the more useful picture.
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.enable(gl.POLYGON_OFFSET_FILL);
  gl.polygonOffset(1, 1);
  gl.depthMask(false);
  gl.uniform4f(v.loc.color, 0.99, 0.71, 0.09, 0.22);
  gl.uniform1f(v.loc.shade, 1);
  bind(v.gpu.stockPos, v.gpu.stockNrm);
  gl.drawArrays(gl.TRIANGLES, 0, v.stock.count);
  gl.depthMask(true);
  gl.disable(gl.POLYGON_OFFSET_FILL);
  gl.disable(gl.BLEND);
}

/* Node (tests) needs the pure half by name; the browser gets everything as
   globals from the classic script tag. */
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    mat4Multiply, mat4Perspective, mat4LookAt, orbitEye, boundsCenter, boundsRadius,
    fitDistance, dragToOrbit, zoomDistance, clampDistance, pinchDistance, pointerSpan, mvGesture,
    trisToBuffers, blankEdgeVerts,
    stockGeometry, stockBounds, viewerCamera, mvLoadMesh, MV_PITCH_LIMIT,
  };
}
