import { accessSync, constants, existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import type { HostDoctorReport, HostRuntimeBinStatus, HostRuntimeInventory } from "../shared/remote";
import { hostPayloadGitBinDir, listHostRuntimeBinCandidates } from "../shared/remote/host-runtime-env";
import { WORKBENCH_HOME_DIRNAME } from "../shared/workbench/paths";

export type { HostDoctorReport };

const execFileAsync = promisify(execFile);

async function hasGit(): Promise<boolean> {
  try {
    await execFileAsync("git", ["--version"], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

async function which(bin: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("which", [bin], { timeout: 3000 });
    const found = stdout.trim();
    return found || null;
  } catch {
    return null;
  }
}

async function probeBin(path: string | null, args: string[]): Promise<HostRuntimeBinStatus> {
  if (!path) return { available: false, version: null, path: null };
  try {
    const { stdout } = await execFileAsync(path, args, { timeout: 3000 });
    const version = stdout.trim().split(/\r?\n/, 1)[0]?.trim() || null;
    return { available: true, version, path };
  } catch {
    return { available: existsSync(path), version: null, path: existsSync(path) ? path : null };
  }
}

function firstExisting(paths: Array<string | null | undefined>): string | null {
  for (const path of paths) {
    if (path && existsSync(path)) return path;
  }
  return null;
}

async function collectPayloadRuntime(): Promise<HostRuntimeInventory> {
  const candidates = listHostRuntimeBinCandidates({
    envBinDir: process.env.PRISM_HOST_BIN_DIR,
    execPath: process.execPath,
    argv1: process.argv[1],
    home: process.env.HOME || homedir(),
  });
  const binDir = candidates.find((dir) => existsSync(join(dir, "prismnext-host"))) ?? candidates[0] ?? null;
  const currentDir = binDir ? dirname(binDir) : null;
  const nodePath = firstExisting([
    binDir ? join(binDir, "node") : null,
    process.execPath,
  ]);
  const tectonicPath = firstExisting([binDir ? join(binDir, "tectonic") : null]);
  const tinymistPath = firstExisting([binDir ? join(binDir, "tinymist") : null]);
  const gitPath = firstExisting([
    currentDir ? join(hostPayloadGitBinDir(currentDir), "git") : null,
    await which("git"),
  ]);
  const [node, git, tectonic, tinymist] = await Promise.all([
    probeBin(nodePath, ["--version"]),
    probeBin(gitPath, ["--version"]),
    probeBin(tectonicPath, ["--version"]),
    probeBin(tinymistPath, ["--version"]),
  ]);
  if (nodePath === process.execPath && !node.version) {
    node.version = process.version;
    node.available = true;
    node.path = process.execPath;
  }
  return { node, git, tectonic, tinymist };
}

export async function runDoctor(): Promise<HostDoctorReport> {
  const home = homedir();
  let homeWritable = false;
  try {
    accessSync(home, constants.W_OK);
    homeWritable = true;
  } catch {
    homeWritable = false;
  }
  const git = await hasGit();
  return {
    ok: homeWritable,
    node: process.version,
    home: `${home.replace(/\\/g, "/")}/${WORKBENCH_HOME_DIRNAME}`,
    homeWritable,
    git,
    runtime: await collectPayloadRuntime(),
  };
}
