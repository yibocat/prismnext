import { useEffect, useRef, useState, memo, useCallback, useMemo } from "react";
import { useChatStore, type ChatStreamMessage, type ContentBlock } from "@/stores/chat-store";
import { MarkdownRenderer } from "./markdown-renderer";
import { ToolWidget, ThinkingWidget } from "./tool-widgets";
import {
  AlertCircleIcon,
  CopyIcon,
  CheckIcon,
  ArrowDownIcon,
  MessageSquareIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Copy Button ───

const CopyButton = memo(({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex size-6 items-center justify-center rounded-md text-muted-foreground/60 opacity-0 transition-all hover:bg-muted hover:text-foreground group-hover:opacity-100"
      title="Copy"
    >
      {copied ? <CheckIcon className="size-3 text-green-500" /> : <CopyIcon className="size-3" />}
    </button>
  );
});
CopyButton.displayName = "CopyButton";

// ─── Streaming Indicator ───

const StreamingIndicator = memo(({ startTime }: { startTime: number }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = startTime;
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [startTime]);

  return (
    <div className="flex items-center gap-2 px-4 py-2">
      <div className="flex items-center gap-1">
        <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:0ms]" />
        <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:150ms]" />
        <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:300ms]" />
      </div>
      <span className="text-muted-foreground text-[length:var(--font-chat-meta)]">Thinking...</span>
      {elapsed > 3 && (
        <span className="text-muted-foreground/60 text-[length:var(--font-chat-meta)]">{elapsed}s</span>
      )}
    </div>
  );
});
StreamingIndicator.displayName = "StreamingIndicator";

// ─── User Message ───

const UserMessage = memo(function UserMessage({ msg }: { msg: ChatStreamMessage }) {
  const textBlock = msg.message?.content?.find((b) => b.type === "text");
  const text = textBlock?.text || "";

  return (
    <div className="group flex flex-col items-end py-2 px-4 animate-in fade-in slide-in-from-bottom-1 duration-200">
      <div className="flex items-end gap-1.5 max-w-[85%]">
        <div className="opacity-0 transition-opacity group-hover:opacity-100">
          <CopyButton text={text} />
        </div>
        <div className="rounded-2xl bg-muted px-4 py-2 text-foreground text-[length:var(--font-chat-message)] leading-relaxed">
          {text}
        </div>
      </div>
    </div>
  );
});

// ─── Assistant Message ───

const AssistantMessage = memo(function AssistantMessage({
  msg,
  toolResultMap,
  metaText,
}: {
  msg: ChatStreamMessage;
  toolResultMap: Map<string, ContentBlock>;
  metaText?: string;
}) {
  const blocks = msg.message?.content || [];
  const textBlock = blocks.find((b) => b.type === "text");
  const fullText = textBlock?.text || "";

  return (
    <div className="group w-full py-2 px-4 animate-in fade-in slide-in-from-bottom-1 duration-200">
      <div className="min-w-0 flex-1">
          {blocks.map((block, i) => {
            if (block.type === "thinking" && block.thinking) {
              return <ThinkingWidget key={i} thinking={block.thinking} duration={(block as any).duration} />;
            }
            if (block.type === "text" && block.text) {
              return (
                <div key={i} className="prose prose-sm dark:prose-invert max-w-none text-[length:var(--font-chat-message)] leading-relaxed">
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

      {/* Action bar: copy button left, meta text (time · tokens) right */}
      {fullText && (
        <div className="flex items-center gap-2 mt-1 opacity-0 transition-opacity group-hover:opacity-100">
          <CopyButton text={fullText} />
          {metaText && (
            <span className="ml-auto text-[length:var(--font-chat-meta)] text-muted-foreground/50 tabular-nums">
              {metaText}
            </span>
          )}
        </div>
      )}
    </div>
  );
});

// ─── Result Message ───

function ResultMessage({ msg }: { msg: ChatStreamMessage }) {
  if (msg.is_error) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-[length:var(--font-chat-message)] text-destructive mx-4 my-1 animate-in fade-in slide-in-from-bottom-1 duration-200">
        <AlertCircleIcon className="size-4 shrink-0" />
        <span>{msg.result || "An error occurred"}</span>
      </div>
    );
  }

  if (msg.result) {
    return (
      <div className="px-4 py-1.5 text-[length:var(--font-chat-meta)] text-muted-foreground">
        <MarkdownRenderer content={msg.result} />
      </div>
    );
  }

  return null;
}

// ─── Chat Messages ───

export function ChatMessages() {
  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const activeTabId = useChatStore((s) => s.activeTabId);

  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const agentStartedRef = useRef(false);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Track when streaming started (for accurate elapsed time display)
  const streamingStartRef = useRef(Date.now());

  // Track previous isStreaming to detect stream-start in render phase
  // (useEffect runs too late — first assistant message may arrive before it fires)
  const prevStreamingRef = useRef(isStreaming);
  if (isStreaming && !prevStreamingRef.current) {
    agentStartedRef.current = false;
    streamingStartRef.current = Date.now();
  }
  prevStreamingRef.current = isStreaming;

  // Build tool result map (memoized)
  const toolResultMap = useMemo(() => {
    const map = new Map<string, ContentBlock>();
    for (const msg of messages) {
      if (msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === "tool_result" && block.tool_use_id) {
            map.set(block.tool_use_id, block);
          }
        }
      }
    }
    return map;
  }, [messages]);

  // Deduplicate and filter messages (memoized), with index map for O(1) key lookup
  const { displayMessages, msgIndexMap } = useMemo(() => {
    // Track result messages by usage data to dedup (not by text content)
    const seenResultKeys = new Set<string>();
    const idxMap = new Map<ChatStreamMessage, number>();
    const filtered = messages.filter((msg, i) => {
      if (msg.type === "system") return false;
      if (msg.type === "user" && msg.message?.content?.every((b) => b.type === "tool_result")) {
        return false;
      }
      // Dedup result messages by usage info (not by text which can collide)
      if (msg.type === "result") {
        if (msg.usage) {
          const key = `${msg.usage.input_tokens}-${msg.usage.output_tokens}`;
          if (seenResultKeys.has(key)) return false;
          seenResultKeys.add(key);
        }
        if (msg.result && seenResultKeys.has(msg.result)) return false;
        if (msg.result) seenResultKeys.add(msg.result);
      }
      idxMap.set(msg, i);
      return true;
    });
    return { displayMessages: filtered, msgIndexMap: idxMap };
  }, [messages]);

  // Build meta map: display index → "Completed in Xs · ↑in ↓out"
  // Computed from consecutive assistant→result pairs. Works regardless of
  // tab switches or store persistence — recomputes whenever messages change.
  const metaMap = useMemo(() => {
    const map = new Map<number, string>();
    for (let i = 0; i < displayMessages.length - 1; i++) {
      const msg = displayMessages[i];
      const next = displayMessages[i + 1];
      if (msg.type === "assistant" && next.type === "result" && !next.is_error) {
        const parts: string[] = [];
        if (next.duration_ms != null) {
          parts.push(`Completed in ${(next.duration_ms / 1000).toFixed(1)}s`);
        }
        const u = next.usage;
        if (u?.input_tokens || u?.output_tokens) {
          const input = u.input_tokens >= 1000 ? `${(u.input_tokens / 1000).toFixed(1)}k` : `${u.input_tokens}`;
          const output = u.output_tokens >= 1000 ? `${(u.output_tokens / 1000).toFixed(1)}k` : `${u.output_tokens}`;
          parts.push(`↑${input} ↓${output}`);
        }
        if (parts.length > 0) map.set(i, parts.join(" · "));
      }
    }
    return map;
  }, [displayMessages]);

  // Set of result display indices that have been inlined into preceding assistant
  const inlinedResults = useMemo(() => {
    const set = new Set<number>();
    for (let i = 0; i < displayMessages.length - 1; i++) {
      const msg = displayMessages[i];
      const next = displayMessages[i + 1];
      if (msg.type === "assistant" && next.type === "result" && !next.is_error && next.result) {
        set.add(i + 1);
      }
    }
    return set;
  }, [displayMessages]);

  // Hide StreamingIndicator once there's meaningful thinking content.
  // Require ≥10 chars to avoid flicker from the first 1-2 character delta.
  const hasThinkingContent = displayMessages.some(
    (m) => m.type === "assistant" && m.message?.content?.some(
      (b) => b.type === "thinking" && b.thinking && b.thinking.length > 0,
    ),
  );
  if (hasThinkingContent) {
    agentStartedRef.current = true;
  }

  // Reset auto-scroll when streaming starts
  useEffect(() => {
    if (isStreaming) {
      shouldAutoScrollRef.current = true;
      setShowScrollButton(false);
    }
  }, [isStreaming]);

  // Track scroll position
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      shouldAutoScrollRef.current = atBottom;
      setShowScrollButton(!atBottom && el.scrollHeight > el.clientHeight + 100);
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (shouldAutoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isStreaming]);

  // When switching to a tab that is already streaming, force auto-scroll
  useEffect(() => {
    if (isStreaming) {
      shouldAutoScrollRef.current = true;
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }
  }, [activeTabId]);

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
      setShowScrollButton(false);
    }
  };

  // Empty state
  if (displayMessages.length === 0 && !isStreaming) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 pb-[calc(2rem+var(--height-status-bar))]">
        <div className="flex flex-col items-center gap-4 text-center max-w-sm">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-muted">
            <MessageSquareIcon className="size-7 text-muted-foreground" />
          </div>
          <div>
            <h3 className="text-[length:var(--font-chat-message)] font-medium text-foreground">Start a conversation</h3>
            <p className="mt-1 text-[length:var(--font-chat-meta)] text-muted-foreground leading-relaxed">
              Ask your AI assistant to help with your LaTeX document.
              Try things like "Add a theorem environment" or "Fix the citations in section 3".
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex-1 min-h-0">
      <div ref={scrollRef} className="absolute inset-0 overflow-y-auto scroll-smooth">
        <div className="min-h-full pb-4 max-w-3xl mx-auto">
          {displayMessages.map((msg, displayIdx) => {
            const idx = msgIndexMap.get(msg)!;
            if (msg.type === "user") {
              return <UserMessage key={`user-${idx}`} msg={msg} />;
            }
            if (msg.type === "assistant") {
              return (
                <AssistantMessage
                  key={`asst-${idx}`}
                  msg={msg}
                  toolResultMap={toolResultMap}
                  metaText={metaMap.get(displayIdx)}
                />
              );
            }
            if (msg.type === "result") {
              if (inlinedResults.has(displayIdx)) return null;
              return <ResultMessage key={`result-${idx}`} msg={msg} />;
            }
            return null;
          })}
          {isStreaming && !agentStartedRef.current && (
            <StreamingIndicator startTime={streamingStartRef.current} />
          )}
        </div>
      </div>

      {/* Scroll to bottom FAB */}
      {showScrollButton && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-4 right-4 flex size-8 items-center justify-center rounded-full border border-border bg-background shadow-md text-muted-foreground hover:text-foreground transition-all hover:shadow-lg z-10"
        >
          <ArrowDownIcon className="size-4" />
        </button>
      )}
    </div>
  );
}
