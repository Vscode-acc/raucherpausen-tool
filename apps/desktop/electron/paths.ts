/**
 * Centralized path configuration for Electron main process
 * All paths are computed at runtime and are plattform-independent
 */

import path from "node:path";
import { app } from "electron";
import os from "node:os";

/**
 * Get application data directory
 * Plattform-independent: Uses Electron's built-in app.getPath("userData")
 */
export function getAppDataDir(): string {
  return app.getPath("userData");
}

/**
 * Get logs directory (inside userData)
 */
export function getLogsDir(): string {
  return path.join(getAppDataDir(), "logs");
}

/**
 * Get log file path for today
 */
export function getLogFilePath(): string {
  const logsDir = getLogsDir();
  const today = new Date().toISOString().split("T")[0];
  return path.join(logsDir, `app-${today}.log`);
}

/**
 * Get asset path from app bundle
 * In dev: relative to app.getAppPath() (which is the workspace root during dev)
 * In prod: relative to app.getAppPath() (which is the resources/app directory)
 */
export function getAssetPath(...parts: string[]): string {
  const appPath = app.getAppPath();
  // For packaged app with asar: false, files are in resources/app/
  // For dev, files are in workspace root
  return path.join(appPath, ...parts);
}

/**
 * Get preload script path
 * In both dev and packaged: electron/preload.cjs is in app.getAppPath()
 */
export function getPreloadPath(): string {
  return getAssetPath("electron", "preload.cjs");
}

/**
 * Get renderer HTML file path
 * For both dev and packaged: dist-renderer/index.html is in app.getAppPath()
 */
export function getRendererHtmlPath(): string {
  const htmlPath = getAssetPath("dist-renderer", "index.html");
  return htmlPath;
}

/**
 * Get dev server URL
 */
export function getDevServerUrl(): string {
  const port = process.env.VITE_DEV_SERVER_PORT || "5173";
  return `http://localhost:${port}`;
}
