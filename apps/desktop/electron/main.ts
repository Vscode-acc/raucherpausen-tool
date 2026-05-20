import { app, BrowserWindow, dialog, ipcMain, nativeImage, Notification, screen } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import type { OpenDialogOptions } from "electron";

// ===== LOGGING =====
const logsDir = path.join(os.homedir(), "AppData", "Local", "raucherpausen-tool", "logs");
try {
  if (!fsSync.existsSync(logsDir)) {
    fsSync.mkdirSync(logsDir, { recursive: true });
  }
} catch {
  console.error("Failed to create logs directory");
}

const logFile = path.join(logsDir, `app-${new Date().toISOString().split("T")[0]}.log`);

function log(...args: any[]) {
  const timestamp = new Date().toISOString();
  const message = `[${timestamp}] ${args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" ")}`;
  console.log(message);
  try {
    fsSync.appendFileSync(logFile, message + "\n", { encoding: "utf-8" });
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
    fsSync.appendFileSync(logFile, message + "\n", { encoding: "utf-8" });
  } catch (e) {
    console.error("Failed to write error to log file:", e);
  }
}

function getLogFilePath() {
  return logFile;
}
// ===== END LOGGING =====

const isDev = !app.isPackaged;
const shouldOpenDevTools = process.argv.includes("-dev");

log("=== APP START ===");
log(`isDev: ${isDev}, openDevTools: ${shouldOpenDevTools}`);
log(`logFile: ${getLogFilePath()}`);
let controlWindow: BrowserWindow | null = null;

function getAssetPath(...parts: string[]) {
  return path.join(app.getAppPath(), ...parts);
}

function getPreloadPath() {
  // In dev we run `electron .` from `apps/desktop`, so app.getAppPath() already
  // points to that folder. Using `apps/desktop/...` would duplicate the path.
  return isDev ? path.join(app.getAppPath(), "electron", "preload.cjs") : getAssetPath("electron", "preload.cjs");
}

async function loadRenderer(win: BrowserWindow) {
  if (isDev) {
    await win.loadURL("http://localhost:5173");
    return;
  }
  await win.loadFile(getAssetPath("dist-renderer", "index.html"));
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

