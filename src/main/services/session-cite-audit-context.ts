import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getLiteratureBridgeRoot } from "./prism-bridge-paths";

export const CITE_AUDIT_APPENDIX_MARKER = "## Session citation audit (this chat)";

export interface SessionCiteAuditSnapshot {
  updatedAt: string;
  health?: {
    bibPath?: string | null;
    citeKeysInTex?: string[];
    missingInBib?: string[];
    unusedInBib?: string[];
    duplicateKeys?: string[];
    missingInLibrary?: string[];
    unusedInLibrary?: string[];
    bibFallbackCount?: number;
    bibKeysNotInLibrary?: string[];
  };
}

function auditPath(sessionId: string): string {
  return join(getLiteratureBridgeRoot(), sessionId.trim(), "cite-audit.json");
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
  return items.length > 0 ? items : [];
}

function readSnapshot(sessionId: string): SessionCiteAuditSnapshot | null {
  const id = sessionId?.trim();
  if (!id) return null;
  try {
    const p = auditPath(id);
    if (!existsSync(p)) return null;
    const raw = JSON.parse(readFileSync(p, "utf-8")) as SessionCiteAuditSnapshot;
    if (!raw || typeof raw !== "object") return null;
    return raw;
  } catch {
    return null;
  }
}

function writeSnapshot(sessionId: string, snapshot: SessionCiteAuditSnapshot): void {
  const id = sessionId?.trim();
  if (!id) return;
  const dir = join(getLiteratureBridgeRoot(), id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(auditPath(id), JSON.stringify(snapshot, null, 2), "utf-8");
}

function mergeSnapshot(
  sessionId: string,
  patch: Partial<SessionCiteAuditSnapshot>,
): SessionCiteAuditSnapshot {
  const prev = readSnapshot(sessionId) ?? { updatedAt: new Date().toISOString() };
  return {
    ...prev,
    ...patch,
    health: patch.health ? { ...prev.health, ...patch.health } : prev.health,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Persist a `citation-health` tool result (full CitationHealthReport) for per-turn agent context.
 * `result` shape: { bibCheck, libraryCheck, bibFallback, bibKeysNotInLibrary } | { error }
 */
export function recordCiteAuditHealth(
  sessionId: string | undefined,
  result: Record<string, unknown>,
): void {
  const id = sessionId?.trim();
  if (!id || result.error) return;

  const bibCheck =
    result.bibCheck && typeof result.bibCheck === "object" && !Array.isArray(result.bibCheck)
      ? (result.bibCheck as Record<string, unknown>)
      : null;
  const libraryCheck =
    result.libraryCheck && typeof result.libraryCheck === "object" && !Array.isArray(result.libraryCheck)
      ? (result.libraryCheck as Record<string, unknown>)
      : null;
  const bibFallback = Array.isArray(result.bibFallback) ? result.bibFallback : [];
  const bibKeysNotInLibrary = readStringArray(result.bibKeysNotInLibrary);

  const health: NonNullable<SessionCiteAuditSnapshot["health"]> = {
    bibPath: typeof bibCheck?.bibPath === "string" ? bibCheck.bibPath : null,
    citeKeysInTex: readStringArray(bibCheck?.citeKeysInTex ?? libraryCheck?.citeKeysInTex),
    missingInBib: readStringArray(bibCheck?.missingKeys),
    unusedInBib: readStringArray(bibCheck?.unusedKeys),
    duplicateKeys: readStringArray(bibCheck?.duplicateKeys),
    missingInLibrary: readStringArray(libraryCheck?.missingKeys),
    unusedInLibrary: readStringArray(libraryCheck?.unusedKeys),
    bibFallbackCount: bibFallback.length,
    bibKeysNotInLibrary,
  };

  writeSnapshot(id, mergeSnapshot(id, { health }));
}

function formatKeyList(keys: string[] | undefined, max = 12): string {
  if (!keys?.length) return "—";
  if (keys.length <= max) return keys.join(", ");
  return `${keys.slice(0, max).join(", ")} (+${keys.length - max} more)`;
}

export function formatSessionCiteAuditMarkdown(snapshot: SessionCiteAuditSnapshot | null): string {
  if (!snapshot?.health) return "";

  const h = snapshot.health;
  const lines = [
    CITE_AUDIT_APPENDIX_MARKER,
    "",
    "Structured audit results from this chat session. **Reuse for follow-up** — do not re-run audit tools unless",
    "`.tex`/`.bib` changed or the user asks for a fresh check.",
    "",
    "### citation-health",
  ];

  if (h.bibPath) lines.push(`- manuscript .bib: \`${h.bibPath}\``);
  lines.push(`- cite keys in .tex: ${formatKeyList(h.citeKeysInTex)}`);
  lines.push(`- missing in .bib: ${formatKeyList(h.missingInBib)}`);
  lines.push(`- unused in .tex: ${formatKeyList(h.unusedInBib)}`);
  lines.push(`- duplicate keys: ${formatKeyList(h.duplicateKeys)}`);
  lines.push(`- missing in library: ${formatKeyList(h.missingInLibrary)}`);
  if (h.bibFallbackCount != null && h.bibFallbackCount > 0) {
    lines.push(`- bibFallback entries (importable from .bib): ${h.bibFallbackCount}`);
  }
  if (h.bibKeysNotInLibrary?.length) {
    lines.push(`- .bib keys not in library (policy): ${formatKeyList(h.bibKeysNotInLibrary)}`);
  }
  lines.push("");

  return lines.join("\n").trimEnd();
}

export function buildSessionCiteAuditTurnAppendix(sessionId: string): string {
  return formatSessionCiteAuditMarkdown(readSnapshot(sessionId));
}

/** Context block for Task delegation when a citation audit already ran in the parent session. */
export function buildTaskDelegationCiteAuditPreface(sessionId: string): string {
  const snapshot = readSnapshot(sessionId);
  const body = formatSessionCiteAuditMarkdown(snapshot);
  if (!body) return "";
  return [
    "---",
    "**Session citation audit (parent session)** — synthesize from this; do NOT re-scan with read/glob:",
    body,
    "---",
    "",
  ].join("\n");
}

/** @internal test helper */
export function readSessionCiteAuditSnapshotForTests(sessionId: string): SessionCiteAuditSnapshot | null {
  return readSnapshot(sessionId);
}
