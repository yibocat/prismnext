import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { HOST_PRO_SYNC_STAMP_FILENAME } from "../../shared/workbench/paths";
import { resolveProPackageDir } from "../teams/pro-teams-discovery";
import type { RemoteSyncProgress } from "../../shared/remote";

function walkFiles(root: string, dir = root): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) {
      out.push(...walkFiles(root, abs));
      continue;
    }
    const rel = abs.slice(root.length).replace(/\\/g, "/").replace(/^\/+/, "");
    if (!rel || rel === HOST_PRO_SYNC_STAMP_FILENAME) continue;
    out.push(rel);
  }
  return out.sort();
}

export function hashProPackageTree(packageDir: string): string {
  const hash = createHash("sha256");
  for (const rel of walkFiles(packageDir)) {
    hash.update(rel);
    hash.update("\0");
    hash.update(readFileSync(join(packageDir, rel)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export interface ProPushBroker {
  invoke(profileId: string, method: string, params: unknown): Promise<unknown>;
}

/**
 * Push the laptop Pro pack tree onto the Host (`~/.prismnext-host/pro-package`).
 * No-op when this build has no pro-package. Never called unless the laptop grant is active.
 */
export async function pushLaptopProPackageToHost(
  broker: ProPushBroker,
  profileId: string,
  onProgress?: (progress: RemoteSyncProgress) => void,
): Promise<{ ok: true; action: "absent" | "skipped" | "pushed"; files: number } | { ok: false; error: string }> {
  const packageDir = resolveProPackageDir();
  if (!packageDir) return { ok: true, action: "absent", files: 0 };
  const rels = walkFiles(packageDir);
  const sha256 = hashProPackageTree(packageDir);
  const begin = await broker.invoke(profileId, "pro:beginSync", { sha256 }) as {
    action?: string;
  };
  if (begin.action === "skipped") {
    onProgress?.({ current: rels.length, total: rels.length, title: "pro-package", kind: "pro" });
    return { ok: true, action: "skipped", files: rels.length };
  }
  let current = 0;
  for (const rel of rels) {
    onProgress?.({ current, total: rels.length, title: rel, kind: "pro" });
    await broker.invoke(profileId, "pro:writeFile", {
      relPath: rel,
      bytes: readFileSync(join(packageDir, rel)).toString("base64"),
    });
    current += 1;
  }
  await broker.invoke(profileId, "pro:commitSync", { sha256 });
  onProgress?.({ current: rels.length, total: rels.length, title: "pro-package", kind: "pro" });
  return { ok: true, action: "pushed", files: rels.length };
}
