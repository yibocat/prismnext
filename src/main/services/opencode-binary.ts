/**
 * Bundled OpenCode binary path + version probe.
 * Packaged: <resources>/opencode/opencode
 * Dev:      <project>/bin/opencode/<platform>-<arch>/opencode
 */

import { execFile, execFileSync } from "node:child_process";
import { closeSync, existsSync, openSync, readSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { app } from "electron";
import {
  parseOpencodeVersionOutput,
  shouldSkipEffortVariantConfigSync,
} from "../../shared/opencode-version";

export type OpencodeBinaryKind = "pe" | "macho" | "elf" | "zip" | "unknown";

/** Classify an OpenCode file from its first bytes — zip-as-exe is the Windows spawn UNKNOWN case. */
export function classifyOpencodeBinaryHeader(bytes: Uint8Array): OpencodeBinaryKind {
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b) return "zip";
  if (bytes.length >= 2 && bytes[0] === 0x4d && bytes[1] === 0x5a) return "pe";
  if (bytes.length >= 4 && bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c && bytes[3] === 0x46) {
    return "elf";
  }
  if (bytes.length >= 4) {
    const a = bytes[0];
    const b = bytes[1];
    const c = bytes[2];
    const d = bytes[3];
    if (
      (a === 0xfe && b === 0xed && c === 0xfa && (d === 0xce || d === 0xcf))
      || (a === 0xce && b === 0xfa && c === 0xed && d === 0xfe)
      || (a === 0xcf && b === 0xfa && c === 0xed && d === 0xfe)
      || (a === 0xca && b === 0xfe && c === 0xba && d === 0xbe)
    ) {
      return "macho";
    }
  }
  return "unknown";
}

export function opencodeBinarySpawnError(
  kind: OpencodeBinaryKind,
  platform: string,
): string | null {
  if (kind === "zip") {
    return platform === "win32"
      ? "Bundled OpenCode is a zip archive, not a Windows executable. Re-download opencode.exe (this causes spawn UNKNOWN)."
      : "Bundled OpenCode is a zip archive, not an executable. Re-download the OpenCode binary.";
  }
  if (platform === "win32" && kind !== "pe") {
    return "Bundled OpenCode is not a Windows PE executable. Re-download opencode.exe (this causes spawn UNKNOWN).";
  }
  return null;
}

export function inspectOpencodeBinaryFile(filePath: string): OpencodeBinaryKind {
  const fd = openSync(filePath, "r");
  try {
    const buf = Buffer.alloc(4);
    const n = readSync(fd, buf, 0, 4, 0);
    return classifyOpencodeBinaryHeader(buf.subarray(0, n));
  } finally {
    closeSync(fd);
  }
}

export function assertOpencodeBinarySpawnable(
  filePath: string,
  platform: NodeJS.Platform = process.platform,
): void {
  const err = opencodeBinarySpawnError(inspectOpencodeBinaryFile(filePath), platform);
  if (err) throw new Error(`${err} (${filePath})`);
}

const execFileAsync = promisify(execFile);

export { parseOpencodeVersionOutput, shouldSkipEffortVariantConfigSync };

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

/** Synchronous version probe (startup config sync — before ACP spawn). */
export function probeBundledOpencodeVersionSync(): string | null {
  const path = resolveOpencodeBinaryPath();
  if (!existsSync(path)) return null;
  try {
    assertOpencodeBinarySpawnable(path);
  } catch {
    return null;
  }
  try {
    const out = execFileSync(path, ["--version"], {
      encoding: "utf8",
      timeout: 8_000,
      windowsHide: true,
      maxBuffer: 64 * 1024,
    });
    return parseOpencodeVersionOutput(out);
  } catch {
    return null;
  }
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
    assertOpencodeBinarySpawnable(path);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    cached = {
      available: false,
      version: null,
      path,
      error: message.slice(0, 300),
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
