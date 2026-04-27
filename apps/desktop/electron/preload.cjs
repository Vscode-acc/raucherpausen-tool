const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("rp", {
  pickGif: () => ipcRenderer.invoke("pickGif"),
  getDefaultGif: () => ipcRenderer.invoke("getDefaultGif"),
  notify: (title, body) => ipcRenderer.send("notify", title, body),
  setAlwaysOnTop: (enabled) => ipcRenderer.invoke("setAlwaysOnTop", enabled),
  setFullScreenMode: (enabled) => ipcRenderer.invoke("setFullScreenMode", enabled),
  snapToPrimaryDisplay: () => ipcRenderer.invoke("snapToPrimaryDisplay"),
  getDisplays: () => ipcRenderer.invoke("getDisplays"),
  snapToDisplay: (displayId) => ipcRenderer.invoke("snapToDisplay", displayId),
  pushOverlayState: (state) => ipcRenderer.send("overlay:state", state),
  onOverlayState: (cb) => ipcRenderer.on("overlay:state", (_evt, state) => cb(state)),
  log: (...args) => ipcRenderer.send("frontend:log", "log", ...args),
  logError: (...args) => ipcRenderer.send("frontend:log", "error", ...args),
});

