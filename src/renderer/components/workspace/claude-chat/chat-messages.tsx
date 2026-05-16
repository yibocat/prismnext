import { useEffect, useRef, useState, memo } from "react";
import { useClaudeChatStore, type ClaudeStreamMessage, type ContentBlock } from "@/stores/claude-chat-store";
import { MarkdownRenderer } from "./markdown-renderer";
import { ToolWidget, ThinkingWidget } from "./tool-widgets";
import { AlertCircleIcon } from "lucide-react";

// ─── Streaming Indicator ───

const StreamingIndicator = memo(() => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex items-center gap-2 px-4 py-2">
      <div className="flex items-center gap-1">
        <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:0ms]" />
        <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:150ms]" />
        <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:300ms]" />
      </div>
      <span className="text-muted-foreground text-xs">Thinking...</span>
      {elapsed > 3 && (
        <span className="text-muted-foreground/60 text-xs">{elapsed}s</span>
      )}
    </div>
  );
});
StreamingIndicator.displayName = "StreamingIndicator";

// ─── User Message ───

function UserMessage({ msg }: { msg: ClaudeStreamMessage }) {
  const textBlock = msg.message?.content?.find((b) => b.type === "text");
  const text = textBlock?.text || "";

  return (
    <div className="flex flex-col items-end py-1.5 px-4">
      <div className="max-w-[85%] rounded-xl bg-muted px-3 py-1.5 text-foreground text-sm">
        {text}
      </div>
    </div>
  );
}

// ─── Assistant Message ───

function AssistantMessage({
  msg,
  toolResultMap,
}: {
  msg: ClaudeStreamMessage;
  toolResultMap: Map<string, ContentBlock>;
}) {
  const blocks = msg.message?.content || [];

  return (
    <div className="w-full py-1.5 px-4">
      {blocks.map((block, i) => {
        if (block.type === "thinking" && block.thinking) {
          return <ThinkingWidget key={i} thinking={block.thinking} />;
        }
        if (block.type === "text" && block.text) {
          return (
            <div key={i} className="text-sm">
              <MarkdownRenderer content={block.text} />
            </div>
          );
        }
        if (block.type === "tool_use") {
          const result = toolResultMap.get(block.id || "");
          return <ToolWidget key={i} toolUse={block} toolResult={result} />;
        }
        return null;
      })}
    </div>
  );
}

// ─── Result Message ───

function ResultMessage({ msg }: { msg: ClaudeStreamMessage }) {
  if (msg.is_error) {
    return (
      <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive mx-4 my-1">
        <AlertCircleIcon className="size-4 shrink-0" />
        <span>{msg.result || "An error occurred"}</span>
      </div>
    );
  }

  if (msg.result) {
    return (
      <div className="px-4 py-1.5 text-sm text-muted-foreground">
        <MarkdownRenderer content={msg.result} />
      </div>
    );
  }

  return null;
}

// ─── Chat Messages ───

export function ChatMessages() {
  const messages = useClaudeChatStore((s) => s.messages);
  const isStreaming = useClaudeChatStore((s) => s.isStreaming);
  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const prevMessageCountRef = useRef(0);

  // Build tool result map from all messages
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

  // Collect all text from assistant messages for result deduplication
  const assistantTextSet = new Set<string>();
  for (const msg of messages) {
    if (msg.type === "assistant" && msg.message?.content) {
      for (const block of msg.message.content) {
        if (block.type === "text" && block.text) {
          assistantTextSet.add(block.text.trim());
        }
      }
    }
  }

  // Filter messages for display
  const displayMessages = messages.filter((msg) => {
    if (msg.type === "system") return false;
    if (msg.type === "user" && msg.message?.content?.every((b) => b.type === "tool_result")) {
      return false;
    }
    // Deduplicate result messages that repeat assistant text
    if (msg.type === "result" && msg.result && assistantTextSet.has(msg.result.trim())) {
      return false;
    }
    return true;
  });

  // Reset auto-scroll when streaming starts (new messages arriving)
  useEffect(() => {
    if (isStreaming) {
      shouldAutoScrollRef.current = true;
    }
  }, [isStreaming]);

  // Auto-scroll handling
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
      shouldAutoScrollRef.current = atBottom;
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (shouldAutoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isStreaming]);

  // Empty state
  if (displayMessages.length === 0 && !isStreaming) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <p className="text-muted-foreground text-sm">
          Ask Claude about your LaTeX document...
        </p>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="absolute inset-0 overflow-y-auto scroll-smooth py-2">
      {displayMessages.map((msg, i) => {
        if (msg.type === "user") {
          return <UserMessage key={i} msg={msg} />;
        }
        if (msg.type === "assistant") {
          return <AssistantMessage key={i} msg={msg} toolResultMap={toolResultMap} />;
        }
        if (msg.type === "result") {
          return <ResultMessage key={i} msg={msg} />;
        }
        return null;
      })}
      {isStreaming && <StreamingIndicator />}
    </div>
  );
}
