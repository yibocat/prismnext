import { useMemo, useCallback, type ReactNode } from "react";
import {
  useExternalStoreRuntime,
  AssistantRuntimeProvider,
  type ThreadMessageLike,
  type AppendMessage,
} from "@assistant-ui/react";
import { useClaudeChatStore, type ClaudeStreamMessage, type ContentBlock } from "@/stores/claude-chat-store";
import { useDocumentStore } from "@/stores/document-store";

// ─── Message ID generation (stable: derived from tabId + index) ───
function genMsgId(tabId: string, idx: number): string {
  return `${tabId}-msg-${idx}`;
}

// ─── System prompt filter patterns ───
// Strip content that looks like Claude CLI system prompts / context injections
// System prompt cleaning (same approach as use-claude-events.ts):
// 1. Remove known system XML blocks with their content
// 2. Strip remaining preamble lines that look like system directives
// 3. Remove leftover XML tags

function stripSystemBlocks(text: string): string {
  let result = text;
  // System prompt blocks
  result = result.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "");
  result = result.replace(/<EXTREMELY_IMPORTANT>[\s\S]*?<\/EXTREMELY_IMPORTANT>/g, "");
  result = result.replace(/<instructions>[\s\S]*?<\/instructions>/g, "");
  result = result.replace(/<function>[\s\S]*?<\/function>/g, "");
  result = result.replace(/<role>[\s\S]*?<\/role>/g, "");
  // Claude CLI local command blocks (saved in JSONL, should never be shown)
  result = result.replace(/<local-command-caveat>[\s\S]*?<\/local-command-caveat>/g, "");
  result = result.replace(/<command-name>[\s\S]*?<\/command-name>/g, "");
  result = result.replace(/<command-message>[\s\S]*?<\/command-message>/g, "");
  result = result.replace(/<command-args>[\s\S]*?<\/command-args>/g, "");
  result = result.replace(/<local-command-stdout>[\s\S]*?<\/local-command-stdout>/g, "");
  return result;
}

function stripSystemPreamble(text: string): string {
  const lines = text.split("\n");
  let start = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) { start = i + 1; continue; }
    if (/^(Hey|Hi|Hello|Sure|OK|Let me|I'll|I will|Here|The|This|That|Alright|Great|Thanks|Based on|Looking at|First|Let's|I can|I see|I found|I notice|I've)/i.test(line)) {
      start = i; break;
    }
    if (/^(You are|IMPORTANT|System|Rules|Instructions|Tools|Environment|Working|Current|Available|When|Always|Never|Your|The user|\[|#|```)/i.test(line)) {
      start = i + 1; continue;
    }
    start = i; break;
  }
  return lines.slice(start).join("\n").trim();
}

function cleanTextForDisplay(text: string): string {
  let result = stripSystemBlocks(text);
  result = stripSystemPreamble(result);
  result = result.replace(/<[^>]+>/g, "").trim();
  return result;
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
      id: genMsgId(tabId, result.length),
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
        data: { thinking: block.thinking || "" },
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
