import { memo } from "react";
import { MessagePrimitive } from "@assistant-ui/react";
import { MarkdownRenderer } from "./markdown-renderer";
import { ThinkingWidget } from "./tool-widgets";
import { ToolWidget } from "./tool-widgets";
import type { ContentBlock } from "@/stores/claude-chat-store";

// ─── Convert assistant-ui part → our ContentBlock for existing ToolWidget ───

function partToContentBlock(part: any): ContentBlock | null {
  if (part.type === "text") {
    return { type: "text", text: part.text || "" };
  }
  if (part.type === "data" && part.name === "thinking") {
    return { type: "thinking", thinking: part.data?.thinking || "" };
  }
  if (part.type === "tool-call") {
    return {
      type: "tool_use",
      id: part.toolCallId,
      name: part.toolName,
      input: part.args,
    };
  }
  return null;
}

function toolResultToContentBlock(part: any): ContentBlock | undefined {
  if (!part.result) return undefined;
  return {
    type: "tool_result",
    tool_use_id: part.toolCallId,
    content: part.result.content,
    is_error: part.result.isError,
  };
}

// ─── Text Part ───

const TextPart = memo(function TextPart({ text }: { text: string }) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none text-[length:var(--font-chat-message)] leading-relaxed">
      <MarkdownRenderer content={text} />
    </div>
  );
});

// ─── Parts Renderer ───

function AssistantMessageParts() {
  return (
    <MessagePrimitive.Parts>
      {({ part }) => {
        if (part.type === "text") {
          return <TextPart text={part.text} />;
        }

        if (part.type === "data" && (part as any).name === "thinking") {
          return <ThinkingWidget thinking={(part as any).data?.thinking || ""} duration={(part as any).data?.duration} />;
        }

        if (part.type === "tool-call") {
          const toolUse = partToContentBlock(part);
          const toolResult = toolResultToContentBlock(part);
          if (toolUse) {
            return <ToolWidget toolUse={toolUse} toolResult={toolResult} />;
          }
          return null;
        }

        return null;
      }}
    </MessagePrimitive.Parts>
  );
}

// ─── Assistant Message ───

export function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="group w-full py-2 px-4 animate-in fade-in slide-in-from-bottom-1 duration-200">
      <div className="min-w-0 flex-1">
        <AssistantMessageParts />
      </div>
    </MessagePrimitive.Root>
  );
}
