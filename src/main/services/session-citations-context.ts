import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { AcpService } from "../acp/service";
import { getLiteratureBridgeRoot } from "./prism-bridge-paths";
import { normalizeLibraryCiteMarkers } from "../../shared/normalize-library-cite-markers";
import {
  buildLibraryTaskHitsAppendix,
  LIBRARY_TASK_APPENDIX_MARKER,
} from "./library-task-context";

export interface SessionCitationRecord {
  refId: number;
  doi: string | null;
  arxivId: string | null;
  title?: string;
  year?: number | null;
  summary?: string | null;
}

const APPENDIX_MARKER = "## Session citations (this chat)";

function stagingPath(stagingSessionId: string): string {
  return join(getLiteratureBridgeRoot(), stagingSessionId, "staging.json");
}

/** Read staged citation records for a chat session (parent session for Task sub-sessions). */
export function readSessionCitationRecords(sessionId: string): SessionCitationRecord[] {
  const id = sessionId?.trim();
  if (!id) return [];
  const stagingSessionId = AcpService.getInstance().resolveCitationStagingSessionId(id);
  try {
    const p = stagingPath(stagingSessionId);
    if (!existsSync(p)) return [];
    const raw = JSON.parse(readFileSync(p, "utf-8")) as SessionCitationRecord[];
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((r) => typeof r.refId === "number" && r.refId > 0)
      .sort((a, b) => a.refId - b.refId);
  } catch {
    return [];
  }
}

function oneLineSummary(text: string | null | undefined, max = 160): string {
  const line = (text || "").replace(/\s+/g, " ").trim();
  if (!line) return "—";
  return line.length > max ? `${line.slice(0, max)}…` : line;
}

/** Markdown table of staged refs for agent context (orchestrator / Task result). */
export function formatSessionCitationsMarkdown(records: SessionCitationRecord[]): string {
  if (records.length === 0) return "";
  const lines = [
    APPENDIX_MARKER,
    "",
    "These papers were verified via `literature-stage` in this chat. **Cite as `[n]`** in your reply.",
    "Do **not** call `literature-stage` again for the same paper or re-delegate literature search unless the user asks.",
    "",
    "| refId | Title | Year | Summary |",
    "|------:|-------|-----:|---------|",
  ];
  for (const r of records) {
    const title = (r.title || r.doi || r.arxivId || "Unknown").replace(/\|/g, "\\|");
    const year = r.year != null ? String(r.year) : "—";
    const summary = oneLineSummary(r.summary).replace(/\|/g, "\\|");
    lines.push(`| ${r.refId} | ${title} | ${year} | ${summary} |`);
  }
  return lines.join("\n");
}

export function buildSessionCitationsTurnAppendix(sessionId: string): string {
  return formatSessionCitationsMarkdown(readSessionCitationRecords(sessionId));
}

export function enrichTaskToolResultContent(sessionId: string, content: unknown): string {
  const baseRaw =
    typeof content === "string"
      ? content
      : content == null
        ? ""
        : JSON.stringify(content, null, 2);
  if (!baseRaw.trim()) return baseRaw;

  let enriched = normalizeLibraryCiteMarkers(baseRaw.trimEnd());

  if (!enriched.includes(LIBRARY_TASK_APPENDIX_MARKER)) {
    const libraryAppendix = buildLibraryTaskHitsAppendix(sessionId);
    if (libraryAppendix) enriched = `${enriched}\n\n${libraryAppendix}`;
  }

  if (!enriched.includes(APPENDIX_MARKER)) {
    const appendix = buildSessionCitationsTurnAppendix(sessionId);
    if (appendix) enriched = `${enriched}\n\n${appendix}`;
  }

  return enriched;
}

/** Context block for a new Task delegation when citations already exist. */
export function buildTaskDelegationStagingPreface(sessionId: string): string {
  const records = readSessionCitationRecords(sessionId);
  if (records.length === 0) return "";
  const refs = records.map((r) => `[${r.refId}]`).join(", ");
  return [
    "---",
    "**Already staged in this chat session** (parent session — do NOT re-stage):",
    refs,
    "Summarize or extend these if relevant; stage only **new** papers not in the table below.",
    formatSessionCitationsMarkdown(records),
    "---",
    "",
  ].join("\n");
}

function normalizeToolResultBase(content: unknown): string {
  if (typeof content === "string") return content;
  if (content == null) return "";
  return JSON.stringify(content, null, 2);
}

/** Read OpenCode tool part `state.output` as plain text for comparison. */
export function readToolPartOutputText(output: unknown): string {
  if (output == null) return "";
  if (typeof output === "string") return output;
  if (typeof output === "object" && !Array.isArray(output)) {
    const obj = output as Record<string, unknown>;
    if (typeof obj.content === "string") return obj.content;
    if (typeof obj.output === "string") return obj.output;
    if (typeof obj.text === "string") return obj.text;
    if (typeof obj.result === "string") return obj.result;
  }
  if (Array.isArray(output)) {
    const texts: string[] = [];
    for (const item of output) {
      if (item && typeof item === "object") {
        const row = item as Record<string, unknown>;
        if (row.type === "content" && row.content && typeof row.content === "object") {
          const inner = row.content as Record<string, unknown>;
          if (typeof inner.text === "string") texts.push(inner.text);
        } else if (typeof row.text === "string") {
          texts.push(row.text);
        }
      } else if (typeof item === "string") {
        texts.push(item);
      }
    }
    if (texts.length > 0) return texts.join("\n");
  }
  return JSON.stringify(output);
}

/** Patch OpenCode tool part JSON in-place; returns true when output was updated. */
export function writeToolOutputIntoPartData(
  partData: Record<string, unknown>,
  output: string,
): boolean {
  const state = partData.state;
  if (!state || typeof state !== "object" || Array.isArray(state)) return false;
  const stateObj = state as Record<string, unknown>;
  const prev = stateObj.output;
  if (readToolPartOutputText(prev) === output) return false;

  if (prev == null || typeof prev === "string") {
    stateObj.output = output;
    return true;
  }
  if (typeof prev === "object" && !Array.isArray(prev)) {
    const obj = { ...(prev as Record<string, unknown>) };
    if (typeof obj.content === "string" || obj.content == null) {
      obj.content = output;
      stateObj.output = obj;
      return true;
    }
    if (typeof obj.text === "string" || obj.text == null) {
      obj.text = output;
      stateObj.output = obj;
      return true;
    }
  }
  stateObj.output = output;
  return true;
}

/**
 * Persist enriched Task tool_result into OpenCode SQLite so the orchestrator
 * reads Session citations on the same turn (not only in Prism UI transcript).
 */
export async function syncEnrichedTaskToolResultToOpenCode(
  sessionId: string,
  toolCallId: string,
  rawContent: unknown,
): Promise<boolean> {
  const id = sessionId?.trim();
  const callId = toolCallId?.trim();
  if (!id || !callId) return false;

  const enriched = enrichTaskToolResultContent(id, rawContent);
  const base = normalizeToolResultBase(rawContent);
  if (!enriched.trim() || enriched === base) return false;

  return AcpService.getInstance().patchSessionToolOutput(id, callId, enriched);
}
