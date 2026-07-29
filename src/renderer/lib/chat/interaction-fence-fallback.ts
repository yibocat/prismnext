/**
 * Interaction fence fallback for assistant chat replies.
 *
 * Prefer the model embedding ```interaction fences after interaction-write.
 * Narrow fallback: append fences for successful writes missing from reply prose.
 */
import type { ContentBlock } from "@/stores/chat-store";
import {
  buildInteractionFallbackMarkdown,
  CHAT_INTERACTION_AUTO_CAP,
  missingInteractionFencesInText,
} from "@/lib/markdown/chat-interaction";
import { unwrapToolResultPayload } from "@/lib/chat/unwrap-tool-result";

export function isInteractionWriteToolUse(toolUse: ContentBlock): boolean {
  return (toolUse.name || "").toLowerCase() === "interaction-write";
}

export type InteractionWriteSuccess = {
  id: string;
  title?: string;
};

/** Successful interaction-write result → id/title for chat embed fallback. */
export function extractInteractionWriteSuccess(
  toolUse: ContentBlock,
  toolResult?: ContentBlock,
): InteractionWriteSuccess | null {
  if (!isInteractionWriteToolUse(toolUse)) return null;
  if (!toolResult || toolResult.is_error) return null;

  const data = unwrapToolResultPayload(toolResult.content ?? toolUse.content);
  if (!data || data.ok === false) return null;

  const spec = data.spec as Record<string, unknown> | undefined;
  const id =
    (typeof spec?.id === "string" && spec.id.trim()) ||
    (typeof data.id === "string" && data.id.trim()) ||
    "";
  if (!id) return null;

  const title =
    typeof spec?.title === "string" && spec.title.trim()
      ? spec.title.trim()
      : typeof data.title === "string" && data.title.trim()
        ? data.title.trim()
        : undefined;

  return { id, title };
}

export function collectInteractionWritesFromBlocks(
  blocks: ContentBlock[],
  toolResultMap: Map<string, ContentBlock>,
): InteractionWriteSuccess[] {
  const out: InteractionWriteSuccess[] = [];
  const seen = new Set<string>();
  for (const block of blocks) {
    if (block.type !== "tool_use") continue;
    const result = toolResultMap.get(block.id || "");
    const item = extractInteractionWriteSuccess(block, result);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

function assistantTextCorpus(blocks: ContentBlock[]): string {
  return blocks
    .filter((b): b is ContentBlock & { type: "text"; text: string } =>
      b.type === "text" && typeof b.text === "string",
    )
    .map((b) => b.text)
    .join("\n");
}

export function resolveMissingInteractionFencesForReply(
  blocks: ContentBlock[],
  toolResultMap: Map<string, ContentBlock>,
): InteractionWriteSuccess[] {
  const all = collectInteractionWritesFromBlocks(blocks, toolResultMap);
  if (!all.length) return [];
  return missingInteractionFencesInText(assistantTextCorpus(blocks), all);
}

export function buildInteractionReplyFallbackMarkdown(
  blocks: ContentBlock[],
  toolResultMap: Map<string, ContentBlock>,
): string {
  const missing = resolveMissingInteractionFencesForReply(blocks, toolResultMap);
  const capped = missing.slice(0, CHAT_INTERACTION_AUTO_CAP);
  return buildInteractionFallbackMarkdown(capped);
}
