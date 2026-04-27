import fs from "fs";
import path from "path";
import os from "os";

const logsDir = path.join(os.homedir(), "AppData", "Local", "raucherpausen-tool", "logs");

// Ensure logs directory exists
try {
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
} catch {
  console.error("Failed to create logs directory");
}

const logFile = path.join(logsDir, `app-${new Date().toISOString().split("T")[0]}.log`);

export function log(...args: any[]) {
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
  return logFile;
}
