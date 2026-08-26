/**
 * Bundled Tectonic binary path resolution.
 * Packaged: <resources>/tectonic/tectonic[.exe]
 * Dev:      <project>/bin/tectonic/<platform>-<arch>/tectonic[.exe]
 */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { getAppPath, isAppPackaged, getResourcesPath } from "../app/paths";

export interface TectonicBinaryInfo {
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

/** Host runtime: `~/.prismnext-host/current/bin/tectonic` next to the dedicated Node. */
export function resolveHostPayloadTectonicPath(): string | null {
  const binName = process.platform === "win32" ? "tectonic.exe" : "tectonic";
  const fromEnv = process.env.PRISM_HOST_BIN_DIR?.trim();
  if (fromEnv) {
    const candidate = join(fromEnv, binName);
    if (existsSync(candidate)) return candidate;
  }
  const besideNode = join(dirname(process.execPath), binName);
  if (existsSync(besideNode)) return besideNode;
  return null;
}

export function resolveBundledTectonicBinaryPath(): string {
  const binName = process.platform === "win32" ? "tectonic.exe" : "tectonic";

  if (isAppPackaged()) {
    return join(getResourcesPath(), "tectonic", binName);
  }

  const { platformDir, archDir } = platformArchDir();
  return join(getAppPath(), "bin", "tectonic", `${platformDir}-${archDir}`, binName);
}

async function findSystemTectonic(): Promise<string | null> {
  try {
    const result = execSync("which tectonic", { encoding: "utf-8", timeout: 5000 });
    const path = result.trim();
    if (path && existsSync(path)) return path;
  } catch {
    // ignore
  }

  if (process.platform === "darwin") {
    try {
      const result = execSync(`/bin/zsh -l -c "which tectonic"`, {
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
    standardPaths.push(
      "/Library/TeX/texbin/tectonic",
      "/opt/homebrew/bin/tectonic",
      "/usr/local/bin/tectonic",
    );
  } else if (process.platform === "linux") {
    standardPaths.push("/usr/bin/tectonic", "/usr/local/bin/tectonic");
  } else if (process.platform === "win32") {
    standardPaths.push("C:\\texlive\\2025\\bin\\windows\\tectonic.exe");
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

let cached: TectonicBinaryInfo | null = null;

/** Drop the process-wide resolve cache (tests that mock `app.getAppPath`). */
export function resetTectonicBinaryCacheForTests(): void {
  cached = null;
}

/** Resolve bundled Tectonic first, then system install. */
export async function resolveTectonicBinary(opts?: { force?: boolean }): Promise<TectonicBinaryInfo> {
  if (cached && !opts?.force) return cached;

  const hostPayload = resolveHostPayloadTectonicPath();
  if (hostPayload) {
    cached = {
      available: true,
      path: hostPayload,
      bundled: true,
      version: probeVersion(hostPayload),
    };
    return cached;
  }

  const bundledPath = resolveBundledTectonicBinaryPath();
  if (existsSync(bundledPath)) {
    cached = {
      available: true,
      path: bundledPath,
      bundled: true,
      version: probeVersion(bundledPath),
    };
    return cached;
  }

  const systemPath = await findSystemTectonic();
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
