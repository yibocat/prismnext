import {
  applyUserDisplaySnapshots,
  isToolResultUserMessage,
} from "@/components/modules/chat/chat-turns";
import { mapOpenCodePartToBlocks } from "@/lib/chat/message-parts";
import { mergePlanUiEvents, stripPlanControlTurns } from "@/lib/chat/plan-ui-events";
import { sanitizeUserContentBlocksForDisplay } from "@/lib/chat/user-message-display";
import type { ChatStreamMessage, ContentBlock } from "@/stores/chat-store";

const PRISM_MARKERS = [
  "integrated into prismnext",
  "integrated into Prism", // legacy sessions before product rename
  "LaTeX academic paper writing workspace",
  "## Core Rules",
];

/** Strip injected system prompt from the first user message (in-place). */
export function stripSystemPromptFromDisplay(
  messages: ChatStreamMessage[],
  hasSystemPromptBlock?: boolean,
): void {
  for (const msg of messages) {
    if (msg.type !== "user") continue;
    const blocks = msg.message?.content;
    if (!blocks || blocks.length === 0) continue;
    const first = blocks[0];

    let isSystemPrompt = hasSystemPromptBlock === true;

    if (!isSystemPrompt && first.type === "text" && first.text) {
      const text = first.text;
      if (text.startsWith("## Role")) {
        isSystemPrompt = PRISM_MARKERS.some((m) => text.includes(m));
      }
    }

    if (!isSystemPrompt && first.type === "text" && first.text && blocks.length >= 2) {
      const second = blocks[1];
      if (
        first.text.length > 1000 &&
        second.type === "text" &&
        second.text &&
        second.text.length < 500
      ) {
        isSystemPrompt = true;
      }
    }

    if (isSystemPrompt) {
      blocks.shift();
    }
    break;
  }
}

export function isPrismSystemPromptText(text: string): boolean {
  if (!text?.startsWith("## Role")) return false;
  return PRISM_MARKERS.some((m) => text.includes(m));
}

/** Map OpenCode sessionLoad payload → sanitized chat messages for UI. */
export async function hydrateSessionMessages(
  raw: any[],
  projectPath: string,
  sessionId: string,
): Promise<ChatStreamMessage[]> {
  const messages: ChatStreamMessage[] = [];

  if (raw.length > 0 && raw[0].info && raw[0].parts) {
    for (const item of raw) {
      const blocks: ContentBlock[] = (item.parts || []).flatMap((p: any) =>
        mapOpenCodePartToBlocks(p as Record<string, unknown>),
      );
      const role = (item.info?.role || "user") === "user" ? "user" : "assistant";
      const content =
        role === "user" ? sanitizeUserContentBlocksForDisplay(blocks) : blocks;
      if (content.length === 0) continue;
      messages.push({ type: role as "user" | "assistant", message: { content } });
    }
  } else {
    const msgGroups = new Map<string, { role: string; blocks: ContentBlock[] }>();
    for (const chunk of raw) {
      const msgId = chunk.messageId || chunk.id || "";
      if (!msgId) continue;
      let group = msgGroups.get(msgId);
      if (!group) {
        const isUser = (chunk.sessionUpdate || "").startsWith("user_");
        group = { role: isUser ? "user" : "assistant", blocks: [] };
        msgGroups.set(msgId, group);
      }
      const content = chunk.content;
      if (!content) continue;
      const isThinking = (chunk.sessionUpdate || "") === "agent_thought_chunk";
      if (content.type === "text" && content.text) {
        const blockType = isThinking ? "thinking" : "text";
        const last = group.blocks[group.blocks.length - 1];
        if (last && last.type === blockType) {
          const key = blockType === "thinking" ? "thinking" : "text";
          (last as any)[key] = ((last as any)[key] || "") + content.text;
        } else {
          group.blocks.push(isThinking
            ? { type: "thinking" as const, thinking: content.text }
            : { type: "text" as const, text: content.text });
        }
      } else if (content.type === "tool" || content.type === "tool_use") {
        group.blocks.push({
          type: "tool_use",
          id: chunk.id || content.id || "",
          name: chunk.name || content.tool?.name || content.name || "",
          input: chunk.input || content.tool?.input || content.input || {},
        });
      } else if (content.type === "tool_result" || content.type === "tool-result") {
        group.blocks.push({
          type: "tool_result",
          tool_use_id: content.tool_use_id || content.toolUseId || "",
          content: content.content || content.result || "",
          is_error: content.isError || content.is_error || false,
        });
      }
    }
    for (const [, group] of Array.from(msgGroups.entries()).sort(([a], [b]) => a.localeCompare(b))) {
      messages.push({ type: group.role as "user" | "assistant", message: { content: group.blocks } });
    }
  }

  let filtered = messages.filter((m) => m.message?.content && m.message.content.length > 0);

  let hasSystemPromptBlock = false;
  try {
    const ctxData = await window.electronAPI.sessionGetContext(projectPath, sessionId);
    hasSystemPromptBlock = ctxData?.hasSystemPromptBlock === true;
  } catch { /* best-effort */ }

  stripSystemPromptFromDisplay(filtered, hasSystemPromptBlock);

  try {
    const displays = await window.electronAPI.sessionGetUserDisplays(projectPath, sessionId);
    if (displays?.length) {
      filtered = applyUserDisplaySnapshots(filtered, displays);
    }
  } catch { /* best-effort */ }

  // Remove silent Approve/Deny user kicks only (keep Build execution assistants).
  filtered = stripPlanControlTurns(filtered);

  try {
    const planEvents = await window.electronAPI.sessionGetPlanEvents(projectPath, sessionId);
    // Decisions only — Created Plan renders inline after write/edit tools.
    const decisions = planEvents?.filter((e) => e.kind === "plan-decision") ?? [];
    if (decisions.length) {
      filtered = mergePlanUiEvents(filtered, decisions);
    }
  } catch { /* best-effort */ }

  return filtered.map((m) => {
    if (m.type !== "user" || isToolResultUserMessage(m)) return m;
    const content = m.message?.content;
    if (!content || typeof content === "string") return m;
    if (content.some((b) => b.inlineParts?.length)) return m;
    return {
      ...m,
      message: { content: sanitizeUserContentBlocksForDisplay(content) },
    };
  });
}
