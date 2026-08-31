import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  HOST_PRO_SYNC_STAMP_FILENAME,
} from "../shared/workbench/paths";
import { RemoteOperationError } from "../shared/remote";
import { discoverAndRegisterProTeams, installDiscoveredProTeams } from "../main/teams/pro-teams-discovery";
import { enableHostLicenseSessionMode } from "../main/teams/teams-license";
import { resolveHostProPackageDir } from "../main/workbench/home";
import type { HostHandlerContext } from "./context";

function packageDir(): string {
  return resolveHostProPackageDir();
}

function stampPath(): string {
  return join(packageDir(), HOST_PRO_SYNC_STAMP_FILENAME);
}

function readStamp(): string | null {
  try {
    const raw = JSON.parse(readFileSync(stampPath(), "utf8")) as { sha256?: unknown };
    return typeof raw.sha256 === "string" && raw.sha256 ? raw.sha256 : null;
  } catch {
    return null;
  }
}

function safeRel(relPath: unknown): string {
  const rel = String(relPath ?? "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!rel || rel.split("/").includes("..") || rel === HOST_PRO_SYNC_STAMP_FILENAME) {
    throw new RemoteOperationError("protocol", "unsafe_pro_pack_path");
  }
  return rel;
}

export const proHandlers: Record<
  string,
  (params: Record<string, unknown>, ctx: HostHandlerContext) => Promise<unknown>
> = {
  async "pro:beginSync"(params) {
    enableHostLicenseSessionMode();
    const sha256 = String(params.sha256 ?? "").trim();
    if (!sha256) throw new RemoteOperationError("protocol", "pro:beginSync requires sha256");
    if (readStamp() === sha256 && existsSync(join(packageDir(), "package.json"))) {
      return { action: "skipped" as const, sha256 };
    }
    const dest = packageDir();
    rmSync(dest, { recursive: true, force: true });
    mkdirSync(dest, { recursive: true });
    return { action: "ready" as const, sha256 };
  },

  async "pro:writeFile"(params) {
    const rel = safeRel(params.relPath);
    const dest = join(packageDir(), rel);
    mkdirSync(dirname(dest), { recursive: true });
    const bytes = Buffer.from(String(params.bytes ?? ""), "base64");
    if (bytes.byteLength > 7 * 1024 * 1024) {
      throw new RemoteOperationError("protocol", "pro pack file exceeds 7 MiB");
    }
    writeFileSync(dest, bytes);
    return { ok: true };
  },

  async "pro:commitSync"(params) {
    enableHostLicenseSessionMode();
    const sha256 = String(params.sha256 ?? "").trim();
    if (!sha256) throw new RemoteOperationError("protocol", "pro:commitSync requires sha256");
    const dest = packageDir();
    mkdirSync(dest, { recursive: true });
    writeFileSync(stampPath(), `${JSON.stringify({ sha256 }, null, 2)}\n`, "utf8");
    process.env.PRISM_HOST_PRO_PACKAGE_DIR = dest;
    const discovery = discoverAndRegisterProTeams();
    installDiscoveredProTeams(discovery.registered);
    return { action: "committed" as const, sha256, registered: discovery.registered };
  },
};
