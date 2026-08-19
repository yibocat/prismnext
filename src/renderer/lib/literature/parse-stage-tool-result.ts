import type { StageResult } from "../../../shared/citation-staging";
import { toolResultPlainText } from "../chat/unwrap-tool-result";

function asStageResult(value: unknown): StageResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  if (typeof obj.verified !== "boolean") return null;
  return obj as StageResult;
}

function parseJsonObject(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Parse literature-stage tool output (Pi object, ACP `output`, or JSON text). */
export function parseStageToolResult(content: unknown): StageResult | null {
  if (content == null) return null;
  const direct = asStageResult(content);
  if (direct) return direct;
  if (typeof content === "object" && !Array.isArray(content)) {
    const obj = content as Record<string, unknown>;
    if (typeof obj.output === "string") {
      return asStageResult(parseJsonObject(obj.output));
    }
  }
  const raw = typeof content === "string" ? content : toolResultPlainText(content);
  if (!raw) return null;
  const parsed = parseJsonObject(raw);
  if (!parsed || typeof parsed !== "object") return null;
  const fromOutput = parsed as Record<string, unknown>;
  if (typeof fromOutput.output === "string") {
    return asStageResult(parseJsonObject(fromOutput.output));
  }
  return asStageResult(parsed);
}
