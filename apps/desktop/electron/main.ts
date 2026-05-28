import { app, BrowserWindow, dialog, ipcMain, nativeImage, Notification, screen } from "electron";
import fsSync from "node:fs";
import type { OpenDialogOptions } from "electron";
import { getLogsDir, getLogFilePath, getPreloadPath, getRendererHtmlPath, getDevServerUrl } from "./paths.js";

// ===== LOGGING =====
function ensureLogsDir() {
  try {
    const logsDir = getLogsDir();
    if (!fsSync.existsSync(logsDir)) {
      fsSync.mkdirSync(logsDir, { recursive: true });
    }
  } catch (e) {
    console.error("Failed to create logs directory:", e);
  }
}

function log(...args: any[]) {
  const timestamp = new Date().toISOString();
  const message = `[${timestamp}] ${args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" ")}`;
  console.log(message);
  try {
    ensureLogsDir();
    fsSync.appendFileSync(getLogFilePath(), message + "\n", { encoding: "utf-8" });
  } catch (e) {
    console.error("Failed to write to log file:", e);
  }
}

function logError(error: any, context?: string) {
  const timestamp = new Date().toISOString();
  const errorStr = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack}` : JSON.stringify(error);
  const message = context ? `[${timestamp}] ERROR [${context}] ${errorStr}` : `[${timestamp}] ERROR ${errorStr}`;
  console.error(message);
  try {
    ensureLogsDir();
    fsSync.appendFileSync(getLogFilePath(), message + "\n", { encoding: "utf-8" });
  } catch (e) {
    console.error("Failed to write error to log file:", e);
  }
}
// ===== END LOGGING =====

const isDev = !app.isPackaged;
const shouldOpenDevTools = process.argv.includes("-dev");

log("=== APP START ===");
log(`isDev: ${isDev}, openDevTools: ${shouldOpenDevTools}`);
log(`logFile: ${getLogFilePath()}`);
let controlWindow: BrowserWindow | null = null;

async function loadRenderer(win: BrowserWindow) {
  try {
    if (isDev) {
      const devUrl = getDevServerUrl();
      log(`[window] loading dev server: ${devUrl}`);
      await win.loadURL(devUrl);
      return;
    }
    
    const htmlPath = getRendererHtmlPath();
    log(`[window] loading HTML from: ${htmlPath}`);
    log(`[window] app.isPackaged: ${app.isPackaged}`);
    log(`[window] app.getAppPath(): ${app.getAppPath()}`);
    
    await win.loadFile(htmlPath);
    log(`[window] HTML loaded successfully`);
  } catch (err: any) {
    logError(err, "loadRenderer");
    log(`[window] Error details: ${err?.message}`);
    // Try to show an error message
    if (controlWindow) {
      controlWindow.webContents.send("error", {
        title: "Fehler beim Laden",
        message: err?.message || "Unbekannter Fehler beim Laden der Anwendung"
      });
    }
  }
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
    app.quit();
  });
  return win;
}

app.whenReady().then(async () => {
  controlWindow = await createControlWindow();

  app.on("activate", async () => {
    if (!controlWindow || controlWindow.isDestroyed()) controlWindow = await createControlWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.on("notify", (_evt, title: string, body: string) => {
  try {
    const n = new Notification({ title, body, icon: nativeImage.createEmpty() });
    n.show();
  } catch {
    // ignore if notifications are not available
  }
});

ipcMain.on("frontend:log", (_evt, level: string, ...args: any[]) => {
  const msg = args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" ");
  if (level === "error") {
    logError(msg, "frontend");
  } else {
    log(`[${level}]`, msg);
  }
});

ipcMain.on("badge:set", (_evt, count: number) => {
  try {
    if (controlWindow) {
      app.setBadgeCount(count);
      log(`[badge] set to ${count}`);
    }
  } catch (e) {
    logError(e, "badge:set");
  }
});

