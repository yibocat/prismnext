/**
 * Bundled OpenCode binary path + version probe.
 * Packaged: <resources>/opencode/opencode
 * Dev:      <project>/bin/opencode/<platform>-<arch>/opencode
 */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { app } from "electron";
import { parseOpencodeVersionOutput } from "../../shared/opencode-version";

const execFileAsync = promisify(execFile);

export { parseOpencodeVersionOutput };

export interface BundledOpencodeInfo {
  available: boolean;
  /** Parsed semver-ish string from `opencode --version`, or null if missing/unreadable. */
  version: string | null;
  path: string;
  error?: string;
}

export interface AboutVersions {
  appVersion: string;
  opencode: BundledOpencodeInfo;
}

export function resolveOpencodeBinaryPath(): string {
  const binName = process.platform === "win32" ? "opencode.exe" : "opencode";

  if (app.isPackaged) {
    return join(process.resourcesPath, "opencode", binName);
  }

  const platform = process.platform;
  const arch = process.arch;
  let platformDir: string;
  if (platform === "darwin") platformDir = "darwin";
  else if (platform === "linux") platformDir = "linux";
  else if (platform === "win32") platformDir = "windows";
  else platformDir = platform;
  let archDir: string;
  if (arch === "arm64") archDir = "arm64";
  else if (arch === "x64") archDir = "x64";
  else archDir = arch;

  return join(app.getAppPath(), "bin", "opencode", `${platformDir}-${archDir}`, binName);
}

let cached: BundledOpencodeInfo | null = null;

/** Probe once per process — binary does not change while the app runs. */
export async function getBundledOpencodeInfo(opts?: {
  force?: boolean;
}): Promise<BundledOpencodeInfo> {
  if (cached && !opts?.force) return cached;

  const path = resolveOpencodeBinaryPath();
  if (!existsSync(path)) {
    cached = {
      available: false,
      version: null,
      path,
      error: "Bundled OpenCode binary not found",
    };
    return cached;
  }

  try {
    const { stdout, stderr } = await execFileAsync(path, ["--version"], {
      timeout: 8_000,
      windowsHide: true,
      maxBuffer: 64 * 1024,
    });
    const version = parseOpencodeVersionOutput(stdout) ?? parseOpencodeVersionOutput(stderr);
    cached = {
      available: true,
      version,
      path,
      error: version ? undefined : "Could not parse OpenCode --version output",
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    cached = {
      available: true,
      version: null,
      path,
      error: message.slice(0, 300),
    };
  }
  return cached;
}

export async function getAboutVersions(): Promise<AboutVersions> {
  return {
    appVersion: app.getVersion(),
    opencode: await getBundledOpencodeInfo(),
  };
}
