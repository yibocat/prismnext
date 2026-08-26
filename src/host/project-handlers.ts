import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { posix } from "node:path";
import { randomBytes } from "node:crypto";
import { normalizePosixAbs, RemoteOperationError } from "../shared/remote";
import { registerProjectRoot } from "../main/project/active-project-roots";
import type { HostHandlerContext } from "./context";

function mintProjectId(): string {
  return `p_${randomBytes(10).toString("hex")}`;
}

export const projectHandlers: Record<
  string,
  (params: Record<string, unknown>, ctx: HostHandlerContext) => Promise<unknown>
> = {
  async "project.open"(params, ctx) {
    const requested = normalizePosixAbs(String(params.remoteRoot ?? ""));
    if (!requested) {
      throw new RemoteOperationError("protocol", "remoteRoot must be an absolute POSIX path.");
    }
    mkdirSync(requested, { recursive: true });
    const metaDir = posix.join(requested, ".workbench");
    const jsonPath = posix.join(metaDir, "workbench.json");
    mkdirSync(metaDir, { recursive: true });
    let projectId = mintProjectId();
    try {
      const parsed = JSON.parse(readFileSync(jsonPath, "utf8")) as { id?: string };
      if (typeof parsed.id === "string" && parsed.id.trim()) projectId = parsed.id.trim();
    } catch {
      // mint
    }
    writeFileSync(jsonPath, `${JSON.stringify({ id: projectId }, null, 2)}\n`, "utf8");
    ctx.remoteRoot = requested;
    ctx.projectId = projectId;
    registerProjectRoot(requested);
    return { projectId, remoteRoot: requested };
  },
};
