/**
 * Map OpenCode SQLite session parts → chat ContentBlock-shaped activity
 * for Task / subagent run panels (main process + tests).
 */

export type ActivityBlock = Record<string, unknown>;

const INTERNAL_PART_TYPES = new Set([
  "step-start",
  "step-finish",
  "patch",
]);

function toolResultFromState(
  toolId: string,
  status: string,
  output: unknown,
): ActivityBlock | null {
  const s = status.toLowerCase();
  if (s !== "completed" && s !== "error" && s !== "failed") return null;
  const content =
    typeof output === "string"
      ? output
      : output == null
        ? ""
        : JSON.stringify(output);
  return {
    type: "tool_result",
    tool_use_id: toolId,
    content,
    is_error: s === "error" || s === "failed",
  };
}

/** Map one OpenCode part JSON object to zero or more activity blocks. */
export function mapOpenCodePartToActivityBlocks(
  part: Record<string, unknown>,
): ActivityBlock[] {
  const type = String(part.type || "");
  if (INTERNAL_PART_TYPES.has(type)) return [];

  switch (type) {
    case "text": {
      const text = String(part.text || "");
      if (!text.trim()) return [];
      return [{ type: "text", text }];
    }
    case "reasoning":
    case "thinking": {
      const text = String(part.text || part.thinking || "");
      if (!text.trim()) return [];
      return [{ type: "thinking", thinking: text, text }];
    }
    case "tool":
    case "tool_use": {
      const toolName =
        (typeof part.tool === "string" ? part.tool : "")
        || (part.tool as { name?: string } | undefined)?.name
        || String(part.name || "");
      const toolId = String(part.callID || part.id || "");
      if (!toolId) return [];
      const state = part.state as {
        input?: unknown;
        status?: string;
        output?: unknown;
      } | undefined;
      const toolInput =
        state?.input
        || part.input
        || (part.tool as { input?: unknown } | undefined)?.input
        || {};
      const blocks: ActivityBlock[] = [{
        type: "tool_use",
        id: toolId,
        name: toolName,
        input: toolInput,
        status: state?.status || "pending",
      }];
      const result = toolResultFromState(
        toolId,
        String(state?.status || ""),
        state?.output,
      );
      if (result) blocks.push(result);
      return blocks;
    }
    case "tool_result":
    case "tool-result":
      return [{
        type: "tool_result",
        tool_use_id: String(part.tool_use_id || part.toolUseId || ""),
        content: part.content || part.result || "",
        is_error: Boolean(part.isError || part.is_error),
      }];
    default:
      return [];
  }
}

/**
 * Build ordered activity blocks from assistant-role OpenCode parts.
 * Skips user / system messages (delegation prompt is shown separately).
 */
export function buildSubAgentActivityBlocks(
  parts: Array<{ role?: string; data: Record<string, unknown> }>,
): ActivityBlock[] {
  const blocks: ActivityBlock[] = [];
  for (const row of parts) {
    const role = (row.role || "assistant").toLowerCase();
    if (role === "user" || role === "system") continue;
    blocks.push(...mapOpenCodePartToActivityBlocks(row.data));
  }
  return blocks;
}
