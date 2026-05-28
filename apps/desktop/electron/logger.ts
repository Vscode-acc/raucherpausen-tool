import fs from "fs";
import { getLogsDir, getLogFilePath as getLogFilePathFromPaths } from "./paths";

let logsDir: string;
let logFile: string;

// Initialize on first use
function init() {
  if (!logFile) {
    logsDir = getLogsDir();
    logFile = getLogFilePathFromPaths();
    
    try {
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }
    } catch {
      console.error("Failed to create logs directory");
    }
  }
}

export function log(...args: any[]) {
  init();
  const timestamp = new Date().toISOString();
  const message = `[${timestamp}] ${args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" ")}`;

  console.log(message);

  try {
    fs.appendFileSync(logFile, message + "\n", { encoding: "utf-8" });
  } catch (e) {
    console.error("Failed to write to log file:", e);
  }
}

export function logError(error: any, context?: string) {
  init();
  const timestamp = new Date().toISOString();
  const errorStr = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack}` : JSON.stringify(error);
  const message = context ? `[${timestamp}] ERROR [${context}] ${errorStr}` : `[${timestamp}] ERROR ${errorStr}`;

  console.error(message);

  try {
    fs.appendFileSync(logFile, message + "\n", { encoding: "utf-8" });
  } catch (e) {
    console.error("Failed to write error to log file:", e);
  }
}

export function getLogFilePath() {
  init();
  return logFile;
}
