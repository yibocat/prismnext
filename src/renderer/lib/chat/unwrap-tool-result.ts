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
