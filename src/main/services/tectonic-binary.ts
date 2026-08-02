/**
 * Bundled Tectonic binary path resolution.
 * Packaged: <resources>/tectonic/tectonic[.exe]
 * Dev:      <project>/bin/tectonic/<platform>-<arch>/tectonic[.exe]
 */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";

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

export function resolveBundledTectonicBinaryPath(): string {
  const binName = process.platform === "win32" ? "tectonic.exe" : "tectonic";

  if (app.isPackaged) {
    return join(process.resourcesPath, "tectonic", binName);
  }

  const { platformDir, archDir } = platformArchDir();
  return join(app.getAppPath(), "bin", "tectonic", `${platformDir}-${archDir}`, binName);
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

/** Resolve bundled Tectonic first, then system install. */
export async function resolveTectonicBinary(opts?: { force?: boolean }): Promise<TectonicBinaryInfo> {
  if (cached && !opts?.force) return cached;

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
