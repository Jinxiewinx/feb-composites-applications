/* Preload bridge.

   Deliberately tiny. The renderer is the same code that runs in a browser, so
   the bridge only adds what a browser cannot do: a native file dialog and the
   menu accelerators. Everything else, including drag and drop, already works.

   CommonJS because Electron preload scripts are not ES modules. */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cfdNative", {
  isElectron: true,
  // The window is frameless, so the renderer needs to know when to leave room
  // for the macOS traffic lights in its own toolbar.
  platform: process.platform,
  openDialog: () => ipcRenderer.invoke("cfd:open"),
  onMenuOpen: (fn) => ipcRenderer.on("cfd:menu-open", () => fn()),
  onTab: (fn) => ipcRenderer.on("cfd:tab", (_e, tab) => fn(tab)),
});
