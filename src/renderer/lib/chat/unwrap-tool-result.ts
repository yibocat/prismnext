/**
 * Normalize OpenCode / ACP tool_result content to a JSON object payload.
 */
export function parseToolResultJson(content: unknown): Record<string, unknown> | null {
  if (content == null) return null;
  if (typeof content === "object" && !Array.isArray(content)) {
    return content as Record<string, unknown>;
  }
  if (typeof content !== "string") return null;
  try {
    const parsed = JSON.parse(content) as unknown;
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    if (typeof parsed === "string") {
      try {
        const inner = JSON.parse(parsed) as unknown;
        if (typeof inner === "object" && inner !== null && !Array.isArray(inner)) {
          return inner as Record<string, unknown>;
        }
      } catch {
        return null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function unwrapToolResultPayload(content: unknown): Record<string, unknown> | null {
  const outer = parseToolResultJson(content);
  if (!outer) return null;
  if (typeof outer.output === "string") {
    return parseToolResultJson(outer.output) ?? outer;
  }
  return outer;
}

function partText(part: unknown): string {
  if (typeof part === "string") return part;
  if (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string") {
    return (part as { text: string }).text;
  }
  return "";
}

/**
 * Plain text from a tool_result payload.
 * Pi primitives return `{ content: [{ type: "text", text }] }`, not a string.
 */
export function toolResultPlainText(content: unknown): string {
  if (content == null) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map(partText).filter(Boolean).join("\n");
  }
  if (typeof content === "object") {
    const rec = content as Record<string, unknown>;
    if ("content" in rec) {
      const inner = toolResultPlainText(rec.content);
      if (inner) return inner;
    }
    if (typeof rec.text === "string" && rec.text) return rec.text;
    if (typeof rec.output === "string" && rec.output) return rec.output;
  }
  return "";
}
