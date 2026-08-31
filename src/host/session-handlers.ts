import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { HOME_SESSIONS_DIRNAME, HOME_SKILLS_DIRNAME } from "../shared/workbench/paths";
import { resolveWorkbenchHome } from "../main/workbench/home";
import type { HostHandlerContext } from "./context";

function sessionsDir(): string {
  return join(resolveWorkbenchHome(), HOME_SESSIONS_DIRNAME);
}

function skillsDir(): string {
  return join(resolveWorkbenchHome(), HOME_SKILLS_DIRNAME);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function sessionIdOf(rec: Record<string, unknown>, fallback: string): string {
  return String(rec.conversationId ?? rec.runtimeSessionId ?? fallback);
}

export const sessionHandlers: Record<
  string,
  (params: Record<string, unknown>, _ctx: HostHandlerContext) => Promise<unknown>
> = {
  async "session:list"(params) {
    const projectId = String(params.projectId ?? "").trim();
    const dir = sessionsDir();
    if (!existsSync(dir)) return [];
    const out: Array<Record<string, unknown>> = [];
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".json")) continue;
      try {
        const rec = asRecord(JSON.parse(readFileSync(join(dir, name), "utf8")));
        if (!rec) continue;
        if (projectId && String(rec.projectId ?? "") !== projectId) continue;
        out.push({
          conversationId: sessionIdOf(rec, name.replace(/\.json$/, "")),
          title: rec.title,
          updatedAt: rec.updatedAt,
          projectId: rec.projectId,
          runtimeSessionId: rec.runtimeSessionId,
        });
      } catch {
        // skip
      }
    }
    return out;
  },

  async "session:read"(params) {
    const conversationId = String(params.conversationId ?? "").trim();
    if (!conversationId) return null;
    const dir = sessionsDir();
    if (!existsSync(dir)) return null;
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".json")) continue;
      try {
        const rec = asRecord(JSON.parse(readFileSync(join(dir, name), "utf8")));
        if (!rec) continue;
        if (sessionIdOf(rec, name.replace(/\.json$/, "")) === conversationId) return rec;
      } catch {
        // skip
      }
    }
    return null;
  },

  async "session:readBlob"(params) {
    const rec = await sessionHandlers["session:read"]!(params, {} as HostHandlerContext);
    if (!rec) return { bytes: "", eof: true, size: 0 };
    const buf = Buffer.from(JSON.stringify(rec), "utf8");
    const offset = Number(params.offset ?? 0);
    const length = Math.min(Number(params.length ?? buf.byteLength), buf.byteLength);
    const slice = buf.subarray(offset, offset + length);
    return {
      bytes: slice.toString("base64"),
      eof: offset + slice.byteLength >= buf.byteLength,
      size: buf.byteLength,
    };
  },

  async "skills:writeFile"(params) {
    const rel = String(params.relPath ?? "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (!rel || rel.split("/").includes("..")) {
      throw new Error("unsafe_skill_path");
    }
    const abs = join(skillsDir(), rel);
    mkdirSync(dirname(abs), { recursive: true });
    const offset = Number(params.offset ?? 0);
    const bytes = Buffer.from(String(params.bytes ?? ""), "base64");
    if (offset === 0) writeFileSync(abs, bytes);
    else {
      const { open } = await import("node:fs/promises");
      const handle = await open(abs, "r+");
      try {
        await handle.write(bytes, 0, bytes.length, offset);
      } finally {
        await handle.close();
      }
    }
    return { ok: true };
  },
};
