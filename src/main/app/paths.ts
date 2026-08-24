import { join } from "node:path";
import { app } from "electron";

function tryAppPath(name: "userData" | "logs" | "exe"): string | null {
  try {
    if (typeof app?.getPath === "function") return app.getPath(name);
  } catch {
    // app not ready, or running under vitest without Electron.
  }
  return null;
}

export function getUserDataPath(): string {
  return tryAppPath("userData") ?? "/tmp";
}

export function getAppPath(): string {
  try {
    if (typeof app?.getAppPath === "function") return app.getAppPath();
  } catch {
    // ignore
  }
  return process.cwd();
}

export function isAppPackaged(): boolean {
  try {
    return Boolean(app?.isPackaged);
  } catch {
    return false;
  }
}

export function getResourcesPath(): string {
  if (typeof process.resourcesPath === "string" && process.resourcesPath) {
    return process.resourcesPath;
  }
  return getAppPath();
}

export function getLogsPath(): string {
  return tryAppPath("logs") ?? join(getUserDataPath(), "logs");
}
