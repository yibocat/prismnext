import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getLiteratureBridgeRoot } from "./prism-bridge-paths";

export const CITE_AUDIT_APPENDIX_MARKER = "## Session citation audit (this chat)";

export interface SessionCiteAuditSnapshot {
  updatedAt: string;
  libraryCheck?: {
    citeKeysInTex?: string[];
    missingKeys?: string[];
    unusedKeys?: string[];
    bibPath?: string | null;
    bibFallbackCount?: number;
  };
  bibCheck?: {
    bibPath?: string | null;
    missingKeys?: string[];
    unusedKeys?: string[];
    duplicateKeys?: string[];
    libraryMissingKeys?: string[];
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
    libraryCheck: patch.libraryCheck
      ? { ...prev.libraryCheck, ...patch.libraryCheck }
      : prev.libraryCheck,
    bibCheck: patch.bibCheck ? { ...prev.bibCheck, ...patch.bibCheck } : prev.bibCheck,
    updatedAt: new Date().toISOString(),
  };
}

/** Persist literature-cite-check JSON for per-turn agent context. */
export function recordCiteAuditLibraryCheck(
  sessionId: string | undefined,
  result: Record<string, unknown>,
): void {
  const id = sessionId?.trim();
  if (!id || result.error) return;

  const bibFallback = result.bibFallback;
  const bibFallbackCount = Array.isArray(bibFallback) ? bibFallback.length : undefined;

  const libraryCheck = {
    citeKeysInTex: readStringArray(result.citeKeysInTex),
    missingKeys: readStringArray(result.missingKeys),
    unusedKeys: readStringArray(result.unusedKeys),
    bibPath: typeof result.bibPath === "string" ? result.bibPath : null,
    bibFallbackCount,
  };

  writeSnapshot(id, mergeSnapshot(id, { libraryCheck }));
}

/** Persist latex-bib-check JSON for per-turn agent context. */
export function recordCiteAuditBibCheck(
  sessionId: string | undefined,
  result: Record<string, unknown>,
): void {
  const id = sessionId?.trim();
  if (!id || result.error) return;

  const libraryCheck =
    result.libraryCheck && typeof result.libraryCheck === "object" && !Array.isArray(result.libraryCheck)
      ? (result.libraryCheck as Record<string, unknown>)
      : null;

  const bibCheck = {
    bibPath: typeof result.bibPath === "string" ? result.bibPath : null,
    missingKeys: readStringArray(result.missingKeys),
    unusedKeys: readStringArray(result.unusedKeys),
    duplicateKeys: readStringArray(result.duplicateKeys),
    libraryMissingKeys: libraryCheck ? readStringArray(libraryCheck.missingKeys) : undefined,
  };

  writeSnapshot(id, mergeSnapshot(id, { bibCheck }));
}

function formatKeyList(keys: string[] | undefined, max = 12): string {
  if (!keys?.length) return "—";
  if (keys.length <= max) return keys.join(", ");
  return `${keys.slice(0, max).join(", ")} (+${keys.length - max} more)`;
}

export function formatSessionCiteAuditMarkdown(snapshot: SessionCiteAuditSnapshot | null): string {
  if (!snapshot?.libraryCheck && !snapshot?.bibCheck) return "";

  const lines = [
    CITE_AUDIT_APPENDIX_MARKER,
    "",
    "Structured audit results from this chat session. **Reuse for follow-up** — do not re-run audit tools unless",
    "`.tex`/`.bib` changed or the user asks for a fresh check.",
    "",
  ];

  if (snapshot.bibCheck) {
    lines.push("### latex-bib-check");
    if (snapshot.bibCheck.bibPath) lines.push(`- bib: \`${snapshot.bibCheck.bibPath}\``);
    lines.push(`- missing in .bib: ${formatKeyList(snapshot.bibCheck.missingKeys)}`);
    lines.push(`- unused in .tex: ${formatKeyList(snapshot.bibCheck.unusedKeys)}`);
    lines.push(`- duplicate keys: ${formatKeyList(snapshot.bibCheck.duplicateKeys)}`);
    if (snapshot.bibCheck.libraryMissingKeys?.length) {
      lines.push(
        `- missing in library.db: ${formatKeyList(snapshot.bibCheck.libraryMissingKeys)}`,
      );
    }
    lines.push("");
  }

  if (snapshot.libraryCheck) {
    lines.push("### literature-cite-check");
    if (snapshot.libraryCheck.bibPath) {
      lines.push(`- manuscript .bib: \`${snapshot.libraryCheck.bibPath}\``);
    }
    lines.push(`- cite keys in .tex: ${formatKeyList(snapshot.libraryCheck.citeKeysInTex)}`);
    lines.push(`- missing in library: ${formatKeyList(snapshot.libraryCheck.missingKeys)}`);
    lines.push(`- unused library keys: ${formatKeyList(snapshot.libraryCheck.unusedKeys)}`);
    if (snapshot.libraryCheck.bibFallbackCount != null) {
      lines.push(`- bibFallback entries (importable from .bib): ${snapshot.libraryCheck.bibFallbackCount}`);
    }
  }

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
