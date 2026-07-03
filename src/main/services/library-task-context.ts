import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { AcpService } from "../acp/service";
import { getLiteratureBridgeRoot } from "./prism-bridge-paths";

export interface LibraryTaskHitRecord {
  bibkey: string;
  title?: string;
  year?: number | null;
  summary?: string | null;
}

export const LIBRARY_TASK_APPENDIX_MARKER = "## Library papers (this Task)";

function hitsPath(parentSessionId: string): string {
  return join(getLiteratureBridgeRoot(), parentSessionId, "library-task-hits.json");
}

function oneLineSummary(text: string | null | undefined, max = 160): string {
  const line = (text || "").replace(/\s+/g, " ").trim();
  if (!line) return "—";
  return line.length > max ? `${line.slice(0, max)}…` : line;
}

export function readLibraryTaskHitRecords(sessionId: string): LibraryTaskHitRecord[] {
  const id = sessionId?.trim();
  if (!id) return [];
  const parentId = AcpService.getInstance().resolveCitationStagingSessionId(id);
  try {
    const p = hitsPath(parentId);
    if (!existsSync(p)) return [];
    const raw = JSON.parse(readFileSync(p, "utf-8")) as LibraryTaskHitRecord[];
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((r) => typeof r.bibkey === "string" && r.bibkey.trim())
      .sort((a, b) => a.bibkey.localeCompare(b.bibkey));
  } catch {
    return [];
  }
}

export function mergeLibraryTaskHits(
  parentSessionId: string,
  hits: LibraryTaskHitRecord[],
): void {
  const parent = parentSessionId?.trim();
  if (!parent || hits.length === 0) return;

  const byKey = new Map<string, LibraryTaskHitRecord>();
  for (const existing of readLibraryTaskHitRecords(parent)) {
    byKey.set(existing.bibkey, existing);
  }
  for (const hit of hits) {
    const bibkey = hit.bibkey.trim();
    if (!bibkey) continue;
    const prev = byKey.get(bibkey);
    byKey.set(bibkey, {
      bibkey,
      title: hit.title ?? prev?.title,
      year: hit.year ?? prev?.year ?? null,
      summary: hit.summary ?? prev?.summary ?? null,
    });
  }

  const dir = join(getLiteratureBridgeRoot(), parent);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    hitsPath(parent),
    JSON.stringify([...byKey.values()].sort((a, b) => a.bibkey.localeCompare(b.bibkey))),
    "utf-8",
  );
}

/** Record library hits when literature tools run inside a Task subagent session. */
export function recordLibraryTaskHitsFromToolSession(
  toolSessionId: string,
  hits: LibraryTaskHitRecord[],
): void {
  if (!toolSessionId?.trim() || hits.length === 0) return;
  if (!AcpService.getInstance().isSubAgentSession(toolSessionId)) return;
  const parentId = AcpService.getInstance().resolveCitationStagingSessionId(toolSessionId);
  mergeLibraryTaskHits(parentId, hits);
}

export function hitsFromLiteratureSearchResult(
  result: Record<string, unknown>,
): LibraryTaskHitRecord[] {
  const rows = result.results;
  if (!Array.isArray(rows)) return [];
  const hits: LibraryTaskHitRecord[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const bibkey = typeof r.bibkey === "string" ? r.bibkey.trim() : "";
    if (!bibkey) continue;
    hits.push({
      bibkey,
      title: typeof r.title === "string" ? r.title : undefined,
      year: typeof r.year === "number" ? r.year : null,
      summary:
        (typeof r.ai_summary === "string" ? r.ai_summary : null)
        ?? (typeof r.abstract === "string" ? r.abstract : null),
    });
  }
  return hits;
}

export function hitsFromLiteratureReadResult(
  result: Record<string, unknown>,
): LibraryTaskHitRecord[] {
  const paper = result.paper;
  if (!paper || typeof paper !== "object") return [];
  const p = paper as Record<string, unknown>;
  const bibkey = typeof p.bibkey === "string" ? p.bibkey.trim() : "";
  if (!bibkey) return [];
  return [
    {
      bibkey,
      title: typeof p.title === "string" ? p.title : undefined,
      year: typeof p.year === "number" ? p.year : null,
      summary:
        (typeof p.ai_summary === "string" ? p.ai_summary : null)
        ?? (typeof p.abstract === "string" ? p.abstract : null),
    },
  ];
}

export function formatLibraryTaskHitsMarkdown(records: LibraryTaskHitRecord[]): string {
  if (records.length === 0) return "";
  const lines = [
    LIBRARY_TASK_APPENDIX_MARKER,
    "",
    "Papers touched via `literature-search` / `literature-read` in this Task. **Cite as `[@bibkey]`** in your reply.",
    "",
    "| bibkey | Title | Year | One-line summary |",
    "|--------|-------|-----:|------------------|",
  ];
  for (const r of records) {
    const title = (r.title || r.bibkey).replace(/\|/g, "\\|");
    const year = r.year != null ? String(r.year) : "—";
    const summary = oneLineSummary(r.summary).replace(/\|/g, "\\|");
    lines.push(`| ${r.bibkey} | ${title} | ${year} | ${summary} |`);
  }
  return lines.join("\n");
}

export function buildLibraryTaskHitsAppendix(sessionId: string): string {
  return formatLibraryTaskHitsMarkdown(readLibraryTaskHitRecords(sessionId));
}
