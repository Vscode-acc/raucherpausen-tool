import { app, BrowserWindow, dialog, ipcMain, nativeImage, Notification, screen } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import type { OpenDialogOptions } from "electron";
import { log, logError, getLogFilePath } from "./logger";

const isDev = !app.isPackaged;
const shouldOpenDevTools = process.argv.includes("-dev");

log("=== APP START ===");
log(`isDev: ${isDev}, openDevTools: ${shouldOpenDevTools}`);
log(`logFile: ${getLogFilePath()}`);
let controlWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let latestOverlayState: {
  gifBytesBase64: string | null;
  scale: number;
  speed: number;
  animSpeed: number;
  freeze: boolean;
  visible: boolean;
} | null = null;

function getAssetPath(...parts: string[]) {
  return path.join(app.getAppPath(), ...parts);
}

function getDefaultGifCandidates() {
  const filename = "shikanoko-dance-shikanoko-memeclean.gif";
  if (isDev) {
    return [
      // typical dev path when appPath = <repo>/apps/desktop
      path.join(app.getAppPath(), "..", "..", "assets", filename),
      // fallback when appPath already points to repo root
      path.join(app.getAppPath(), "assets", filename),
      // fallback from current working directory
      path.join(process.cwd(), "assets", filename),
    ];
  }
  return [getAssetPath("assets", filename)];
}

function getPreloadPath() {
  // In dev we run `electron .` from `apps/desktop`, so app.getAppPath() already
  // points to that folder. Using `apps/desktop/...` would duplicate the path.
  return isDev ? path.join(app.getAppPath(), "electron", "preload.cjs") : getAssetPath("electron", "preload.cjs");
}

async function loadRenderer(win: BrowserWindow, hash?: string) {
  if (isDev) {
    const url = hash ? `http://localhost:5173/${hash}` : "http://localhost:5173";
    await win.loadURL(url);
    return;
  }
  await win.loadFile(getAssetPath("dist-renderer", "index.html"), hash ? { hash: hash.replace(/^#/, "") } : undefined);
}

async function createControlWindow() {
  log("[window] creating control window");
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    backgroundColor: "#0b0d12",
    webPreferences: {
      preload: getPreloadPath(),
    },
  });
  await loadRenderer(win);
  log("[window] control window rendered");
  // Ensure OS screenshot tools are never blocked by this app window.
  win.setContentProtection(false);
  win.setAlwaysOnTop(false);
  if (isDev && shouldOpenDevTools) {
    win.webContents.openDevTools({ mode: "detach" });
  }
  win.on("closed", () => {
    controlWindow = null;
    // If the main/control window is closed, terminate the full app stack.
    if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.close();
    app.quit();
  });
  return win;
}

async function createOverlayWindow() {
  log("[window] creating overlay window");
  const primary = screen.getPrimaryDisplay();
  const win = new BrowserWindow({
    x: primary.bounds.x,
    y: primary.bounds.y,
    width: primary.bounds.width,
    height: primary.bounds.height,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: getPreloadPath(),
    },
  });
  win.setVisibleOnAllWorkspaces(true);
  // Ensure OS screenshot tools and system notifications are never blocked by the overlay window.
  win.setContentProtection(false);
  // Don't set always on top initially - it will be set when overlay becomes visible
  await loadRenderer(win, "#overlay");
  win.webContents.on("did-finish-load", () => {
    if (latestOverlayState) win.webContents.send("overlay:state", latestOverlayState);
  });
  return win;
}

app.whenReady().then(async () => {
  controlWindow = await createControlWindow();
  overlayWindow = await createOverlayWindow();

  app.on("activate", async () => {
    if (!controlWindow || controlWindow.isDestroyed()) controlWindow = await createControlWindow();
    if (!overlayWindow || overlayWindow.isDestroyed()) overlayWindow = await createOverlayWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("pickGif", async () => {
  log("[ipc] pickGif requested");
  const opts: OpenDialogOptions = {
    title: "GIF auswählen",
    properties: ["openFile"],
    filters: [{ name: "GIF", extensions: ["gif"] }],
  };
  const res = controlWindow ? await dialog.showOpenDialog(controlWindow, opts) : await dialog.showOpenDialog(opts);
  if (res.canceled || res.filePaths.length === 0) {
    log("[ipc] pickGif canceled");
    return null;
  }
  const filePath = res.filePaths[0]!;
  const buf = await fs.readFile(filePath);
  log(`[ipc] pickGif loaded: ${filePath} (${buf.length} bytes)`);
  return { filePath, dataBase64: buf.toString("base64") };
});

ipcMain.handle("getDefaultGif", async () => {
  log("[ipc] getDefaultGif requested");
  for (const filePath of getDefaultGifCandidates()) {
    try {
      const buf = await fs.readFile(filePath);
      log(`[ipc] getDefaultGif loaded: ${filePath} (${buf.length} bytes)`);
      return { filePath, dataBase64: buf.toString("base64") };
    } catch {
      // try next candidate
    }
  }
  return null;
});

ipcMain.on("notify", (_evt, title: string, body: string) => {
  try {
    const n = new Notification({ title, body, icon: nativeImage.createEmpty() });
    n.show();
  } catch {
    // ignore if notifications are not available
  }
});

ipcMain.handle("setAlwaysOnTop", (_evt, enabled: boolean) => {
  if (!overlayWindow) return;
  overlayWindow.setAlwaysOnTop(Boolean(enabled), "screen-saver");
});

ipcMain.handle("setFullScreenMode", (_evt, enabled: boolean) => {
  if (!overlayWindow) return;
  const on = Boolean(enabled);
  overlayWindow.setFullScreen(on);
});

ipcMain.handle("snapToPrimaryDisplay", () => {
  if (!overlayWindow) return null;
  const d = screen.getPrimaryDisplay();
  overlayWindow.setBounds(d.bounds);
  return d.bounds;
});

ipcMain.handle("getDisplays", () => {
  const displays = screen.getAllDisplays().map((d) => ({
    id: d.id,
    bounds: d.bounds,
    workArea: d.workArea,
    size: d.size,
    scaleFactor: d.scaleFactor,
    isPrimary: d.id === screen.getPrimaryDisplay().id,
  }));
  return displays;
});

ipcMain.handle("snapToDisplay", (_evt, displayId: number) => {
  if (!overlayWindow) return null;
  const display = screen.getAllDisplays().find((d) => d.id === displayId);
  if (!display) return null;
  overlayWindow.setBounds(display.bounds);
  return display.bounds;
});

ipcMain.on("overlay:state", (_evt, nextState: {
  gifBytesBase64: string | null;
  scale: number;
  speed: number;
  animSpeed: number;
  freeze: boolean;
  visible: boolean;
}) => {
  latestOverlayState = nextState;
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  // Only keep overlay on top when it's actually visible
  if (nextState.visible) {
    overlayWindow.setAlwaysOnTop(true, "floating");
    overlayWindow.show();
  } else {
    overlayWindow.setAlwaysOnTop(false);
    overlayWindow.hide();
  }
  overlayWindow.webContents.send("overlay:state", nextState);
});

ipcMain.on("frontend:log", (_evt, level: string, ...args: any[]) => {
  const msg = args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" ");
  if (level === "error") {
    logError(msg, "frontend");
  } else {
    log(`[${level}]`, msg);
  }
});

