/**
 * Bundled Typst binary path resolution.
 * Packaged: <resources>/typst/typst[.exe]
 * Dev:      <project>/bin/typst/<platform>-<arch>/typst[.exe]
 */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { listHostRuntimeBinCandidates } from "../../shared/remote/host-runtime-env";
import { getAppPath, isAppPackaged, getResourcesPath } from "../app/paths";

export interface TypstBinaryInfo {
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

export function resolveHostPayloadTypstPath(): string | null {
  const binName = process.platform === "win32" ? "typst.exe" : "typst";
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

export function resolveBundledTypstBinaryPath(): string {
  const binName = process.platform === "win32" ? "typst.exe" : "typst";

  if (isAppPackaged()) {
    return join(getResourcesPath(), "typst", binName);
  }

  const { platformDir, archDir } = platformArchDir();
  return join(getAppPath(), "bin", "typst", `${platformDir}-${archDir}`, binName);
}

async function findSystemTypst(): Promise<string | null> {
  try {
    const result = execSync("which typst", { encoding: "utf-8", timeout: 5000 });
    const path = result.trim();
    if (path && existsSync(path)) return path;
  } catch {
    // ignore
  }

  if (process.platform === "darwin") {
    try {
      const result = execSync(`/bin/zsh -l -c "which typst"`, {
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
    standardPaths.push("/opt/homebrew/bin/typst", "/usr/local/bin/typst");
  } else if (process.platform === "linux") {
    standardPaths.push("/usr/bin/typst", "/usr/local/bin/typst");
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

let cached: TypstBinaryInfo | null = null;

export function resetTypstBinaryCacheForTests(): void {
  cached = null;
}

export function isHostRuntimeProcess(): boolean {
  return Boolean(process.env.PRISM_HOST_BIN_DIR);
}

/** Product Typst engine. Do not mention TeX Live. */
export function typstUnavailableError(): string {
  if (isHostRuntimeProcess()) {
    return (
      "Typst was not found on this Host (~/.prismnext-host/current/bin/typst). "
      + "Disconnect and reconnect so PrismNext can download it."
    );
  }
  return "Typst was not found. Install the Typst CLI, or reconnect so a Host can download the pinned binary.";
}

export async function resolveTypstBinary(opts?: { force?: boolean }): Promise<TypstBinaryInfo> {
  if (cached?.available && !opts?.force) return cached;

  const hostPayload = resolveHostPayloadTypstPath();
  if (hostPayload) {
    cached = {
      available: true,
      path: hostPayload,
      bundled: true,
      version: probeVersion(hostPayload),
    };
    return cached;
  }

  const bundledPath = resolveBundledTypstBinaryPath();
  if (existsSync(bundledPath)) {
    cached = {
      available: true,
      path: bundledPath,
      bundled: true,
      version: probeVersion(bundledPath),
    };
    return cached;
  }

  const systemPath = await findSystemTypst();
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
