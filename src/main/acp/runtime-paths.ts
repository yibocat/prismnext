import { createHash } from "node:crypto";
import { join, resolve } from "node:path";

/** Stable, non-reversible on-disk namespace for one normalized project root. */
export function projectRuntimeKey(projectRoot: string): string {
  return createHash("sha256").update(resolve(projectRoot)).digest("hex").slice(0, 24);
}

/** Data/config root owned exclusively by one project OpenCode runtime. */
export function projectRuntimeDir(userDataDir: string, projectRoot: string): string {
  return join(userDataDir, "opencode-runtimes", projectRuntimeKey(projectRoot));
}

export function projectRuntimeAgentsDir(userDataDir: string, projectRoot: string): string {
  return join(projectRuntimeDir(userDataDir, projectRoot), "config", "opencode", "agents");
}
