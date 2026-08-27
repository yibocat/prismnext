import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import {
  hostPayloadGitBinDir,
  hostPayloadGitExecDir,
  listHostRuntimeBinCandidates,
} from "../shared/remote/host-runtime-env";

/**
 * Prepend the Host payload bins so Agent, terminal, compile, and git
 * use the copies the server downloaded into current/ — not whatever
 * happens to be on the server PATH.
 * Finds `current/bin` even when this process was started with system Node
 * (`execPath` is /usr/bin/node; the Host script still sits in current/bin).
 */
export function resolveHostRuntimeBinDir(): string | null {
  const candidates = listHostRuntimeBinCandidates({
    envBinDir: process.env.PRISM_HOST_BIN_DIR,
    execPath: process.execPath,
    argv1: process.argv[1],
    home: process.env.HOME || homedir(),
  });
  for (const dir of candidates) {
    if (existsSync(join(dir, "prismnext-host"))) return dir;
  }
  return null;
}

export function applyHostRuntimePath(): void {
  const binDir = resolveHostRuntimeBinDir();
  if (!binDir) return;
  const currentDir = dirname(binDir);
  const gitBin = hostPayloadGitBinDir(currentDir);
  const gitExec = hostPayloadGitExecDir(currentDir);
  const extras = [binDir];
  if (existsSync(join(gitBin, "git"))) extras.push(gitBin);
  if (existsSync(gitExec) && !process.env.GIT_EXEC_PATH) {
    process.env.GIT_EXEC_PATH = gitExec;
  }
  process.env.PRISM_HOST_BIN_DIR = binDir;
  const rest = (process.env.PATH ?? "")
    .split(":")
    .filter((part) => part && !extras.includes(part));
  process.env.PATH = [...extras, ...rest].join(":");
}
