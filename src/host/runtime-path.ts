import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { hostPayloadGitBinDir, hostPayloadGitExecDir } from "../shared/remote/host-runtime-env";

/**
 * Prepend the Host payload bins so Agent, terminal, compile, and git
 * use the copies the server downloaded into current/ — not whatever
 * happens to be on the server PATH.
 * No-op unless this process is the dedicated Host Node.
 */
export function applyHostRuntimePath(): void {
  const binDir = dirname(process.execPath);
  if (!existsSync(join(binDir, "prismnext-host"))) return;
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
