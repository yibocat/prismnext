import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { resolveTectonicBinary } from "./tectonic-binary";

export interface TexliveStatus {
  available: boolean;
  engines: string[];
  version: string | null;
}

/**
 * Check standard TeXLive locations for a binary.
 */
function checkStandardPaths(name: string): string | null {
  const standardPaths: string[] = [];

  if (process.platform === "darwin") {
    standardPaths.push(
      `/Library/TeX/texbin/${name}`,
      `/usr/local/texlive/2025/bin/universal-darwin/${name}`,
      `/usr/local/texlive/2024/bin/universal-darwin/${name}`,
      `/opt/homebrew/bin/${name}`,
      `/usr/bin/${name}`
    );
  } else if (process.platform === "linux") {
    standardPaths.push(
      `/usr/local/texlive/2025/bin/x86_64-linux/${name}`,
      `/usr/local/texlive/2024/bin/x86_64-linux/${name}`,
      `/usr/bin/${name}`
    );
  } else if (process.platform === "win32") {
    standardPaths.push(
      `C:\\texlive\\2025\\bin\\windows\\${name}.exe`,
      `C:\\texlive\\2024\\bin\\windows\\${name}.exe`
    );
  }

  for (const p of standardPaths) {
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * Query login shell for binary path (macOS only).
 */
function queryLoginShell(name: string): string | null {
  if (process.platform !== "darwin") return null;

  try {
    const result = execSync(`/bin/zsh -l -c "which ${name}"`, {
      encoding: "utf-8",
      timeout: 5000,
    });
    const path = result.trim();
    if (path && existsSync(path)) return path;
  } catch {
    // Ignore
  }
  return null;
}

/**
 * Find a TeX binary in PATH, standard locations, or login shell.
 */
async function findBinary(name: string): Promise<string | null> {
  // 1. Try PATH
  try {
    const result = execSync(`which ${name}`, { encoding: "utf-8", timeout: 5000 });
    const path = result.trim();
    if (path && existsSync(path)) return path;
  } catch {
    // Ignore
  }

  // 2. Check standard locations
  const standard = checkStandardPaths(name);
  if (standard) return standard;

  // 3. Query login shell (macOS)
  return queryLoginShell(name);
}

/**
 * Get TeXLive version string.
 */
async function getVersion(xelatexPath: string): Promise<string | null> {
  try {
    const result = execSync(`"${xelatexPath}" --version`, {
      encoding: "utf-8",
      timeout: 10000,
    });
    // Extract version from first line
    const firstLine = result.split("\n")[0];
    const match = firstLine.match(/(\d+\.\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Detect TeXLive installation and available engines.
 */
export async function detectTexlive(): Promise<TexliveStatus> {
  const engines: string[] = [];

  // Check for each engine
  const pdflatex = await findBinary("pdflatex");
  const xelatex = await findBinary("xelatex");
  const lualatex = await findBinary("lualatex");

  if (pdflatex) engines.push("pdflatex");
  if (xelatex) engines.push("xelatex");
  if (lualatex) engines.push("lualatex");

  const available = engines.length > 0;

  // Get version
  let version: string | null = null;
  if (xelatex) {
    version = await getVersion(xelatex);
  } else if (pdflatex) {
    version = await getVersion(pdflatex);
  }

  return {
    available,
    engines,
    version,
  };
}

/**
 * Check if tectonic is available (bundled binary first, then system PATH).
 */
export async function detectTectonic(): Promise<boolean> {
  try {
    const info = await resolveTectonicBinary();
    return info.available;
  } catch {
    return false;
  }
}
