/**
 * Plan draft ready — trailing chat summary fallback.
 *
 * Manual Plan and suggest-plan → Enter Plan share one path: the model should end
 * with brief prose after the activity fold. If the turn ends without trailing
 * text (e.g. hard-deny stopped tool retries), surface frontmatter description.
 */
import type { ContentBlock } from "@/stores/chat-store";
import { segmentAssistantBlocks } from "@/lib/chat/segment-assistant-blocks";

export function hasTrailingProseInBlocks(blocks: ContentBlock[]): boolean {
  const segments = segmentAssistantBlocks(blocks, { phase: "settled" });
  return segments.some(
    (seg) => seg.kind === "text" && !!seg.block.text?.trim(),
  );
}

export function buildPlanReplyFallbackMarkdown(
  blocks: ContentBlock[],
  summary: string | null | undefined,
): string {
  const text = summary?.trim() ?? "";
  if (!text) return "";
  if (hasTrailingProseInBlocks(blocks)) return "";
  return text;
}
