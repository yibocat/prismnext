import type { StageResult } from "../../../shared/citation-staging";

/** Parse OpenCode literature-stage tool output into a StageResult. */
export function parseStageToolResult(content: unknown): StageResult | null {
  if (content == null) return null;
  const raw = typeof content === "string" ? content : JSON.stringify(content);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  if ("output" in obj && typeof obj.output === "string") {
    try {
      return JSON.parse(obj.output) as StageResult;
    } catch {
      return null;
    }
  }
  return parsed as StageResult;
}
