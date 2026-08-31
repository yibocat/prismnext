import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { homeSkillsDir } from "../workbench/home";
import type { RemoteSyncBroker } from "./sync-client";
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
    out.push(relative(root, abs).replace(/\\/g, "/"));
  }
  return out;
}

export async function pushLaptopSkillsToHost(
  broker: RemoteSyncBroker,
  profileId: string,
  onProgress?: (progress: RemoteSyncProgress) => void,
): Promise<{ ok: true; files: number } | { ok: false; error: string }> {
  if (!broker.isBound(profileId)) return { ok: false, error: "not_connected" };
  const root = homeSkillsDir();
  const rels = walkFiles(root);
  let current = 0;
  for (const rel of rels) {
    onProgress?.({ current, total: rels.length, title: rel, kind: "skills" });
    const bytes = readFileSync(join(root, rel));
    await broker.invoke(profileId, "skills:writeFile", {
      relPath: rel,
      bytes: bytes.toString("base64"),
      offset: 0,
      eof: true,
    });
    current += 1;
  }
  onProgress?.({ current: rels.length, total: rels.length, title: "skills", kind: "skills" });
  return { ok: true, files: rels.length };
}
