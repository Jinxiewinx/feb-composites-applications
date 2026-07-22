/* Electron shell.

   The window loads the app over a custom `app://` protocol rather than a file://
   URL. That is not decoration: pdf.js is an ES module and starts a module
   worker, and Chromium refuses to load module scripts from a file:// origin. A
   custom protocol gives the page a real origin, so the packaged app runs exactly
   the same code path as the browser build with nothing conditional in between.

   Everything else here is shell: a native Open dialog, a menu, and drag-and-drop
   already works because the renderer handles it. */

import { app, BrowserWindow, dialog, ipcMain, Menu, protocol, shell } from "electron";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = join(fileURLToPath(new URL("../app", import.meta.url)));

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".pdf": "application/pdf",
  ".svg": "image/svg+xml", ".png": "image/png", ".map": "application/json",
};

let win;

async function createWindow() {
  win = new BrowserWindow({
    width: 1500, height: 950, minWidth: 900, minHeight: 600,
    backgroundColor: "#16181d",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: fileURLToPath(new URL("./preload.cjs", import.meta.url)),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  await win.loadURL("app://cfd/index.html");
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
}

app.whenReady().then(() => {
  protocol.handle("app", async (request) => {
    const url = new URL(request.url);
    // Serve app/ for the UI, and the folder above it so the bundled sample
    // report is reachable at ../DP_22.pdf exactly as in the browser build.
    let rel = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    let base = APP_DIR;
    if (rel.startsWith("../") || url.hostname === "root") { base = join(APP_DIR, ".."); rel = rel.replace(/^\.\.\//, ""); }
    const file = normalize(join(base, rel));
    // Refuse to serve anything outside the app folder.
    if (!file.startsWith(normalize(join(APP_DIR, "..")))) return new Response("denied", { status: 403 });
    try {
      const body = await readFile(file);
      return new Response(body, { headers: { "content-type": MIME[extname(file).toLowerCase()] || "application/octet-stream" } });
    } catch {
      return new Response("not found: " + rel, { status: 404 });
    }
  });

  buildMenu();
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });

/* Native open dialog. The renderer can also take files by drag and drop, so this
   is the "File > Open" path rather than the only way in. */
ipcMain.handle("cfd:open", async () => {
  const res = await dialog.showOpenDialog(win, {
    title: "Open CFD reports",
    filters: [{ name: "CFD report PDF", extensions: ["pdf"] }],
    properties: ["openFile", "multiSelections"],
  });
  if (res.canceled) return [];
  return Promise.all(res.filePaths.map(async p => ({
    name: p.split(/[\\/]/).pop(),
    bytes: new Uint8Array(await readFile(p)),
  })));
});

function buildMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac ? [{ role: "appMenu" }] : []),
    {
      label: "File",
      submenu: [
        { label: "Open reports…", accelerator: "CmdOrCtrl+O", click: () => win?.webContents.send("cfd:menu-open") },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { label: "Pages", accelerator: "CmdOrCtrl+1", click: () => win?.webContents.send("cfd:tab", "pages") },
        { label: "Panels", accelerator: "CmdOrCtrl+2", click: () => win?.webContents.send("cfd:tab", "panels") },
        { label: "Overlay", accelerator: "CmdOrCtrl+3", click: () => win?.webContents.send("cfd:tab", "overlay") },
        { label: "Summary", accelerator: "CmdOrCtrl+4", click: () => win?.webContents.send("cfd:tab", "summary") },
        { type: "separator" },
        { role: "reload" }, { role: "toggleDevTools" }, { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
