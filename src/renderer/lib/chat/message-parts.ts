import type { ContentBlock } from "@/stores/chat-store";
import { createToolResultFromState } from "@/components/modules/chat/tools/tool-result-map";
import { isPatchMetadataText } from "./user-message-display";

/** OpenCode SQLite part types that should not appear in chat UI. */
export const INTERNAL_PART_TYPES = new Set([
  "step-start",
  "step-finish",
  "patch",
]);

export function isInternalPartType(type: string | undefined): boolean {
  return INTERNAL_PART_TYPES.has(type || "");
}

/** Map one OpenCode message part to renderer content blocks. */
export function mapOpenCodePartToBlocks(part: Record<string, unknown>): ContentBlock[] {
  const type = String(part.type || "");

  if (isInternalPartType(type)) return [];

  switch (type) {
    case "text": {
      const text = String(part.text || "");
      if (isPatchMetadataText(text)) return [];
      return [{ type: "text", text }];
    }

    case "reasoning":
    case "thinking":
      return [{ type: "thinking", thinking: String(part.text || part.thinking || "") }];

    case "tool":
    case "tool_use": {
      const results: ContentBlock[] = [];
      const toolName =
        (typeof part.tool === "string" ? part.tool : "") ||
        (part.tool as { name?: string } | undefined)?.name ||
        String(part.name || "");
      const toolId = String(part.callID || part.id || "");
      const state = part.state as { input?: unknown; status?: string; output?: unknown } | undefined;
      const toolInput = state?.input || part.input || (part.tool as { input?: unknown } | undefined)?.input || {};

      results.push({
        type: "tool_use",
        id: toolId,
        name: toolName,
        input: toolInput,
      });

      const toolResult = createToolResultFromState(
        toolId,
        String(state?.status || ""),
        state?.output,
      );
      if (toolResult) results.push(toolResult);
      return results;
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
