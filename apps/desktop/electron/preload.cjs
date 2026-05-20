const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("rp", {
  notify: (title, body) => ipcRenderer.send("notify", title, body),
  log: (...args) => ipcRenderer.send("frontend:log", "log", ...args),
  logError: (...args) => ipcRenderer.send("frontend:log", "error", ...args),
});

