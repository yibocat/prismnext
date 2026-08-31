/**
 * Bundled Tinymist binary path resolution.
 * Packaged: <resources>/tinymist/tinymist[.exe]
 * Dev:      <project>/bin/tinymist/<platform>-<arch>/tinymist[.exe]
 */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { listHostRuntimeBinCandidates } from "../../shared/remote/host-runtime-env";
import { getAppPath, isAppPackaged, getResourcesPath } from "../app/paths";

export interface TinymistBinaryInfo {
  available: boolean;
  path: string;
  bundled: boolean;
  version: string | null;
}

function platformArchDir(): { platformDir: string; archDir: string } {
  const platform = process.platform;
  let platformDir: string;
  if (platform === "darwin") platformDir = "darwin";
  else if (platform === "linux") platformDir = "linux";
  else if (platform === "win32") platformDir = "windows";
  else platformDir = platform;

  const arch = process.arch;
  let archDir: string;
  if (arch === "arm64") archDir = "arm64";
  else if (arch === "x64") archDir = "x64";
  else archDir = arch;

  return { platformDir, archDir };
}

function tinymistBinName(): string {
  return process.platform === "win32" ? "tinymist.exe" : "tinymist";
}

export function resolveHostPayloadTinymistPath(): string | null {
  const binName = tinymistBinName();
  const candidates = listHostRuntimeBinCandidates({
    envBinDir: process.env.PRISM_HOST_BIN_DIR,
    execPath: process.execPath,
    argv1: process.argv[1],
    home: process.env.HOME || homedir(),
  });
  for (const dir of candidates) {
    const candidate = join(dir, binName);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export function resolveBundledTinymistBinaryPath(): string {
  const binName = tinymistBinName();

  if (isAppPackaged()) {
    return join(getResourcesPath(), "tinymist", binName);
  }

  const { platformDir, archDir } = platformArchDir();
  return join(getAppPath(), "bin", "tinymist", `${platformDir}-${archDir}`, binName);
}

async function findSystemTinymist(): Promise<string | null> {
  try {
    const result = execSync("which tinymist", { encoding: "utf-8", timeout: 5000 });
    const path = result.trim();
    if (path && existsSync(path)) return path;
  } catch {
    // ignore
  }

  if (process.platform === "darwin") {
    try {
      const result = execSync(`/bin/zsh -l -c "which tinymist"`, {
        encoding: "utf-8",
        timeout: 5000,
      });
      const path = result.trim();
      if (path && existsSync(path)) return path;
    } catch {
      // ignore
    }
  }

  const standardPaths: string[] = [];
  if (process.platform === "darwin") {
    standardPaths.push("/opt/homebrew/bin/tinymist", "/usr/local/bin/tinymist");
  } else if (process.platform === "linux") {
    standardPaths.push("/usr/bin/tinymist", "/usr/local/bin/tinymist");
  }

  for (const p of standardPaths) {
    if (existsSync(p)) return p;
  }

  return null;
}

function probeVersion(binaryPath: string): string | null {
  try {
    const out = execSync(`"${binaryPath}" --version`, {
      encoding: "utf-8",
      timeout: 8000,
    });
    const first = out.split("\n")[0]?.trim();
    return first || null;
  } catch {
    return null;
  }
}

let cached: TinymistBinaryInfo | null = null;

export function resetTinymistBinaryCacheForTests(): void {
  cached = null;
}

export function isHostRuntimeProcess(): boolean {
  return Boolean(process.env.PRISM_HOST_BIN_DIR);
}

export function tinymistUnavailableError(): string {
  if (isHostRuntimeProcess()) {
    return (
      "Tinymist was not found on this Host (~/.prismnext-host/current/bin/tinymist). "
      + "Disconnect and reconnect so PrismNext can download it."
    );
  }
  return (
    "Tinymist was not found. Run scripts/download-tinymist.sh, or reconnect so a Host can download the pinned binary."
  );
}

export async function resolveTinymistBinary(opts?: { force?: boolean }): Promise<TinymistBinaryInfo> {
  if (cached?.available && !opts?.force) return cached;

  const hostPayload = resolveHostPayloadTinymistPath();
  if (hostPayload) {
    cached = {
      available: true,
      path: hostPayload,
      bundled: true,
      version: probeVersion(hostPayload),
    };
    return cached;
  }

  const bundledPath = resolveBundledTinymistBinaryPath();
  if (existsSync(bundledPath)) {
    cached = {
      available: true,
      path: bundledPath,
      bundled: true,
      version: probeVersion(bundledPath),
    };
    return cached;
  }

  const systemPath = await findSystemTinymist();
  if (systemPath) {
    cached = {
      available: true,
      path: systemPath,
      bundled: false,
      version: probeVersion(systemPath),
    };
    return cached;
  }

  cached = {
    available: false,
    path: bundledPath,
    bundled: false,
    version: null,
  };
  return cached;
}
