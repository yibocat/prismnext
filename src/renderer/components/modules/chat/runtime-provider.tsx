import { useMemo, useCallback, type ReactNode } from "react";
import {
  useExternalStoreRuntime,
  AssistantRuntimeProvider,
  type ThreadMessageLike,
  type AppendMessage,
} from "@assistant-ui/react";
import { useClaudeChatStore, type ClaudeStreamMessage, type ContentBlock } from "@/stores/claude-chat-store";
import { useDocumentStore } from "@/stores/document-store";
import { cleanTextForDisplay } from "@/lib/system-prompt-cleaner";

// ─── Message ID generation (stable: derived from tabId + raw index) ───
function genMsgId(tabId: string, rawIdx: number): string {
  return `${tabId}-msg-${rawIdx}`;
}

// ─── Conversion: ClaudeStreamMessage[] → ThreadMessageLike[] ───

function convertMessages(
  tabId: string,
  messages: ClaudeStreamMessage[],
  isStreaming: boolean,
): ThreadMessageLike[] {
  // First pass: build tool_result map (tool_use_id → result block)
  const toolResultMap = new Map<string, ContentBlock>();
  for (const msg of messages) {
    if (msg.message?.content) {
      for (const block of msg.message.content) {
        if (block.type === "tool_result" && block.tool_use_id) {
          toolResultMap.set(block.tool_use_id, block);
        }
      }
    }
  }

  const result: ThreadMessageLike[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const isLast = i === messages.length - 1;

    // Skip system messages entirely
    if (msg.type === "system") continue;

    // Skip result messages (usage info, etc.)
    if (msg.type === "result") continue;

    // Skip user messages that only contain tool_results (already merged into tool-calls)
    if (msg.type === "user" && msg.message?.content?.every((b) => b.type === "tool_result")) {
      continue;
    }

    // Skip user messages that are entirely system or local-command content
    if (msg.type === "user" && msg.message?.content) {
      const textBlocks = msg.message.content.filter((b) => b.type === "text" && b.text);
      const hasLocalCommand = textBlocks.some((b) =>
        /<\/?(?:local-command-caveat|command-name|command-message|command-args|local-command-stdout)>/i.test(b.text || "")
      );
      if (hasLocalCommand) continue;
      if (textBlocks.length > 0 && textBlocks.every((b) => !cleanTextForDisplay(b.text || ""))) {
        continue;
      }
    }

    const content = msg.message?.content || [];
    if (content.length === 0 && msg.type !== "user") continue;

    // Strip system-prompt content from text/thinking blocks
    const strippedContent = content
      .map((block) => {
        if (block.type === "text" && block.text) {
          const cleaned = cleanTextForDisplay(block.text);
          if (!cleaned) return null;
          return { ...block, text: cleaned };
        }
        if (block.type === "thinking" && block.thinking) {
          const cleaned = cleanTextForDisplay(block.thinking);
          if (!cleaned) return null;
          return { ...block, thinking: cleaned };
        }
        return block;
      })
      .filter(Boolean) as ContentBlock[];

    if (strippedContent.length === 0 && msg.type === "assistant") continue;

    // Convert content blocks → assistant-ui MessagePart[]
    const parts = strippedContent.map((block) => convertBlock(block, toolResultMap));

    // Determine message status
    let status: ThreadMessageLike["status"];
    if (msg.type === "assistant" && isLast && isStreaming) {
      status = { type: "running" };
    } else if (msg.type === "assistant") {
      status = { type: "complete", reason: "stop" as const };
    }

    result.push({
      id: genMsgId(tabId, i),
      role: msg.type === "assistant" ? ("assistant" as const) : ("user" as const),
      content: parts,
      status,
    });
  }

  return result;
}

function convertBlock(
  block: ContentBlock,
  toolResultMap: Map<string, ContentBlock>,
): any {
  switch (block.type) {
    case "text":
      return { type: "text" as const, text: block.text || "" };

    case "thinking":
      return {
        type: "data" as const,
        name: "thinking",
        data: { thinking: block.thinking || "", duration: (block as any).duration },
      };

    case "tool_use": {
      const result = toolResultMap.get(block.id || "");
      const toolCall: any = {
        type: "tool-call" as const,
        toolCallId: block.id || "",
        toolName: block.name || "unknown",
        args: block.input || {},
      };
      if (result) {
        toolCall.result = {
          content: typeof result.content === "string" ? result.content : JSON.stringify(result.content),
          isError: result.is_error,
        };
      }
      return toolCall;
    }

    case "tool_result":
      // tool_results are merged into tool_use blocks above; skip standalone
      return null;

    default:
      return null;
  }
}

// ─── Runtime Provider ───

export function ClaudeRuntimeProvider({ children }: { children: ReactNode }) {
  const activeTabId = useClaudeChatStore((s) => s.activeTabId);
  const tabs = useClaudeChatStore((s) => s.tabs);
  const isStreaming = useClaudeChatStore((s) => s.isStreaming);
  const sendPrompt = useClaudeChatStore((s) => s.sendPrompt);
  const cancelExecution = useClaudeChatStore((s) => s.cancelExecution);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const rawMessages = activeTab?.messages || [];

  const messages = useMemo(
    () => convertMessages(activeTabId, rawMessages, isStreaming),
    [activeTabId, rawMessages, isStreaming],
  );

  const onNew = useCallback(
    async (message: AppendMessage) => {
      const textParts = message.content.filter((c): c is { type: "text"; text: string } =>
        c.type === "text",
      );
      const prompt = textParts.map((p) => p.text).join("\n");
      if (!prompt.trim()) return;

      // Check project is open
      const projectPath = useDocumentStore.getState().projectRoot;
      if (!projectPath) return;

      await sendPrompt(prompt);
    },
    [sendPrompt],
  );

  const onCancel = useCallback(async () => {
    await cancelExecution();
  }, [cancelExecution]);

  const runtime = useExternalStoreRuntime({
    isRunning: isStreaming,
    messages,
    convertMessage: (m) => m,
    onNew,
    onCancel,
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}
