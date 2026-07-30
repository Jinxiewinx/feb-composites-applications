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
// Wheel/pinch zoom, bounded so you can't invert through the model or lose it.
function zoomDistance(dist, deltaY, fitted) {
  const next = dist * Math.exp(deltaY * 0.0015);
  return Math.max(fitted * 0.15, Math.min(fitted * 6, next));
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
const MV_MESH = {};   // meshUrl -> triangles, fetched once
let MV_LIVE = null;   // the mounted viewer, so a re-render can tear it down

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
    ${plan.meshUrl ? "" : `<div class="meshview-note muted tny">This plan has no stored mold mesh, so only the blocks are shown. Plans made before the 3D view existed, or one whose mesh upload failed, look like this — re-plan the mold to add it.</div>`}
  </div>`;
}

function mvReset(planId) { delete MV_CAM[planId]; if (MV_LIVE && MV_LIVE.planId === planId) { mvInitCam(MV_LIVE); mvDraw(MV_LIVE); } }

/* The canvas clear colour and the edge colour both follow the theme, and
   toggleTheme() only redraws the topbar — not #main — so without this hook a
   live viewer keeps its old background until something else happens to
   re-render the page. Called from core.js's toggleTheme(). */
function mvThemeChanged() { if (MV_LIVE) mvSchedule(MV_LIVE); }

function mvInitCam(v) {
  const aspect = Math.max(0.2, v.canvas.clientWidth / Math.max(1, v.canvas.clientHeight));
  v.fitted = fitDistance(v.bounds, MV_FOV, aspect);
  MV_CAM[v.planId] = { yaw: -Math.PI / 4, pitch: 0.5, dist: v.fitted };
}

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

  if (!MV_CAM[planId]) mvInitCam(v);
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
    } catch (e) { /* blocks-only is a fine outcome; the note in the markup says so */ }
  }
}

async function mvLoadMesh(url) {
  if (MV_MESH[url]) return MV_MESH[url];
  const buf = await (await fetch(url)).arrayBuffer();
  const tris = parseSTL(buf).tris;
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

function mvBindEvents(v) {
  const on = (el, ev, fn, opts) => { el.addEventListener(ev, fn, opts); v.handlers.push([el, ev, fn]); };
  let drag = null;
  const pt = e => (e.touches && e.touches[0]) || e;
  const start = e => { const p = pt(e); drag = { x: p.clientX, y: p.clientY }; };
  const move = e => {
    if (!drag) return;
    const p = pt(e);
    const cam = MV_CAM[v.planId];
    const next = dragToOrbit(p.clientX - drag.x, p.clientY - drag.y, cam.yaw, cam.pitch);
    cam.yaw = next.yaw; cam.pitch = next.pitch;
    drag = { x: p.clientX, y: p.clientY };
    if (e.cancelable) e.preventDefault();
    mvSchedule(v);
  };
  const end = () => { drag = null; };
  on(v.canvas, "pointerdown", start);
  on(window, "pointermove", move, { passive: false });
  on(window, "pointerup", end);
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
  const gl = v.gl, cam = MV_CAM[v.planId];
  if (!gl || !cam) return;
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

  const aspect = w / h;
  const proj = mat4Perspective(MV_FOV, aspect, Math.max(0.1, v.fitted / 100), v.fitted * 12);
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
    fitDistance, dragToOrbit, zoomDistance, trisToBuffers, blankEdgeVerts,
    stockGeometry, stockBounds, MV_PITCH_LIMIT,
  };
}
