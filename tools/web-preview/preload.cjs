/* global require */
/* eslint-disable @typescript-eslint/no-require-imports -- Sandboxed Electron preload requires CommonJS. */
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("preview", {
  action: (action, value) =>
    ipcRenderer.invoke("preview:action", action, value),
  onState: (callback) =>
    ipcRenderer.on("preview:state", (_event, state) => callback(state)),
});
