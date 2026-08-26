import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import { attachmentPathNeedsRemoteUpload, parseRemoteAbs } from "../../shared/remote";
import type { AgentSendAttachment } from "../../shared/agent/api-send";

export const REMOTE_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function safeFileName(name: string): string {
  const base = basename(name).replace(/[^A-Za-z0-9._-]/g, "_");
  return base || "attachment";
}

export async function stageLaptopAttachmentsForRemote(
  input: unknown,
  writeBlob: (absPath: string, bytes: Buffer) => Promise<void>,
): Promise<{ ok: true; input: Record<string, unknown> } | { ok: false; error: string }> {
  const rec = asRecord(input);
  if (!rec) return { ok: true, input: {} };
  const attachments = Array.isArray(rec.attachments) ? rec.attachments : [];
  const remote = typeof rec.projectRoot === "string" ? parseRemoteAbs(rec.projectRoot) : null;
  if (!remote) return { ok: true, input: { ...rec } };

  const next: AgentSendAttachment[] = [];
  const turnId = typeof rec.turnId === "string" && rec.turnId.trim() ? rec.turnId.trim() : "turn";
  for (const entry of attachments) {
    const item = asRecord(entry);
    if (!item) continue;
    const path = typeof item.path === "string" ? item.path : "";
    const name = typeof item.name === "string" ? item.name : basename(path);
    const kind = item.kind === "image" ? "image" : "file";
    if (!path || !attachmentPathNeedsRemoteUpload(path, remote.abs)) {
      next.push({
        name,
        kind,
        path: path || String(item.path ?? ""),
      });
      continue;
    }
    let size = 0;
    try {
      size = (await stat(path)).size;
    } catch {
      return { ok: false, error: "remote_attachment_not_uploaded" };
    }
    if (size > REMOTE_UPLOAD_MAX_BYTES) {
      return { ok: false, error: "remote_attachment_too_large" };
    }
    const bytes = await readFile(path);
    const dest = `${remote.abs}/.workbench/uploads/${turnId}/${safeFileName(name)}`;
    await writeBlob(dest, bytes);
    next.push({ name, kind, path: dest });
  }
  return { ok: true, input: { ...rec, attachments: next } };
}
