import { parseRemoteAbs } from "./path";

const SECRET_KEYS = new Set(["apiKey", "authorization", "Authorization"]);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function isLaptopAbsolutePath(path: string): boolean {
  const raw = path.trim();
  if (!raw || raw.startsWith("remote://")) return false;
  if (/^[A-Za-z]:[\\/]/.test(raw)) return true;
  return raw.startsWith("/Users/") || raw.startsWith("/Volumes/");
}

function stripRecord(value: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (SECRET_KEYS.has(key)) continue;
    next[key] = stripAgentSecrets(item);
  }
  if (Array.isArray(value.attachments)) {
    next.attachments = value.attachments.filter((entry) => {
      const rec = asRecord(entry);
      const path = typeof rec?.path === "string" ? rec.path : "";
      return !isLaptopAbsolutePath(path);
    });
  }
  return next;
}

/** Drop API keys and laptop-only attachment paths before a frame leaves this computer. */
export function stripAgentSecrets<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripAgentSecrets(item)) as T;
  }
  const rec = asRecord(value);
  if (!rec) return value;
  return stripRecord(rec) as T;
}

export function attachmentPathNeedsRemoteUpload(path: string, remoteAbs?: string | null): boolean {
  const raw = path.trim();
  if (!raw || raw.startsWith("remote://")) return false;
  if (remoteAbs && (raw === remoteAbs || raw.startsWith(`${remoteAbs}/`))) return false;
  if (isLaptopAbsolutePath(raw)) return true;
  return raw.startsWith("/") || /^[A-Za-z]:[\\/]/.test(raw);
}

export function agentInputHasLaptopAttachments(value: unknown): boolean {
  const rec = asRecord(value);
  if (!rec || !Array.isArray(rec.attachments)) return false;
  const remoteAbs = typeof rec.projectRoot === "string" ? parseRemoteAbs(rec.projectRoot)?.abs : null;
  return rec.attachments.some((entry) => {
    const item = asRecord(entry);
    return typeof item?.path === "string" && attachmentPathNeedsRemoteUpload(item.path, remoteAbs);
  });
}
