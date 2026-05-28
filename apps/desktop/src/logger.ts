import fs from "fs";
import path from "path";
import os from "os";

let logFile: string;

// Initialize on first use - use platform-independent paths
function init() {
  if (!logFile) {
    const logsDir = path.join(os.homedir(), ".raucherpausen-tool", "logs");
    
    try {
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }
    } catch {
      console.error("Failed to create logs directory");
    }
    
    const today = new Date().toISOString().split("T")[0];
    logFile = path.join(logsDir, `app-${today}.log`);
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
