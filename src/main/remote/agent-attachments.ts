import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import { attachmentPathNeedsRemoteUpload, parseRemoteAbs } from "../../shared/remote";
import type { AgentSendAttachment } from "../../shared/agent/api-send";

export const REMOTE_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
/** Papers are larger than chat attachments; Host `fs:writeBlob` is one shot. */
export const REMOTE_LITERATURE_PDF_MAX_BYTES = 40 * 1024 * 1024;

export const LITERATURE_LOCAL_PDF_METHODS = [
  "literature:ingestPdf",
  "literature:replacePdf",
  "literature:attachLocalPdf",
] as const;

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

/**
 * Copy a laptop PDF into the bound remote paper so Host ingest can read it.
 * Chat attachments stay at 5 MB; literature uses a higher cap.
 */
export async function stageLaptopPdfForRemote(
  projectRoot: string,
  pdfPath: string,
  writeBlob: (absPath: string, bytes: Buffer) => Promise<void>,
): Promise<{ ok: true; pdfPath: string } | { ok: false; error: string }> {
  const remote = parseRemoteAbs(projectRoot);
  if (!remote || !attachmentPathNeedsRemoteUpload(pdfPath, remote.abs)) {
    return { ok: true, pdfPath };
  }
  let size = 0;
  try {
    size = (await stat(pdfPath)).size;
  } catch {
    return { ok: false, error: "remote_literature_pdf_not_uploaded" };
  }
  if (size > REMOTE_LITERATURE_PDF_MAX_BYTES) {
    return { ok: false, error: "remote_literature_pdf_too_large" };
  }
  const bytes = await readFile(pdfPath);
  const dest = `${remote.abs}/.workbench/uploads/literature/${safeFileName(basename(pdfPath))}`;
  await writeBlob(dest, bytes);
  return { ok: true, pdfPath: dest };
}
