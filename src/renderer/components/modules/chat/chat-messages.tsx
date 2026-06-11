import { useEffect, useRef, useState, memo, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import { useChatStore, type ChatStreamMessage, type ContentBlock } from "@/stores/chat-store";
import { MarkdownRenderer } from "./markdown-renderer";
import { ToolWidget, ThinkingWidget } from "./tools";
import {
  AlertCircleIcon,
  CopyIcon,
  CheckIcon,
  ArrowDownIcon,
} from "lucide-react";

/** Check whether a user message's content consists entirely of tool_result
 *  blocks (i.e. a tool outcome forwarded by the agent). Handles both the
 *  array-of-blocks format (streaming) and the plain-string format (JSONL). */
function isAllToolResults(
  content: string | ContentBlock[] | undefined,
): boolean {
  if (!content) return false;
  if (typeof content === "string") return false; // plain text → not tool results
  return content.every((b) => b.type === "tool_result");
}

/** Safely iterate content blocks, handling both array and string formats. */
function contentBlocks(
  content: string | ContentBlock[] | undefined,
): ContentBlock[] {
  if (!content) return [];
  if (typeof content === "string") return [{ type: "text", text: content }];
  return content;
}

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
      className="flex size-6 items-center justify-center rounded-md text-muted-foreground/60 opacity-0 transition-all hover:bg-accent hover:text-accent-foreground group-hover:opacity-100"
      title="Copy"
    >
      {copied ? <CheckIcon className="size-3 text-success" /> : <CopyIcon className="size-3" />}
    </button>
  );
});
CopyButton.displayName = "CopyButton";

// ─── Streaming Indicator ───

// Static loading indicator — dots + "Thinking..." only, no timer.
// Represents CLI startup / waiting-for-first-token, not actual AI thinking time.
const StreamingIndicator = memo(() => (
  <div className="flex items-center gap-2 px-4 py-2">
    <div className="flex items-center gap-1">
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:0ms]" />
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:150ms]" />
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:300ms]" />
    </div>
    <span className="text-muted-foreground text-[length:var(--font-chat-meta)]">Thinking...</span>
  </div>
));
StreamingIndicator.displayName = "StreamingIndicator";

// ─── User Header ───

const UserHeader = memo(function UserHeader({ msg }: { msg: ChatStreamMessage }) {
  const textBlock = contentBlocks(msg.message?.content).find((b) => b.type === "text");
  const text = textBlock?.text || "";
  const [expanded, setExpanded] = useState(false);

  const long = text.length > 140;

  return (
    <div className="sticky top-0 z-20 bg-transparent px-3 pb-2">
      <div className={cn(
        "max-w-3xl mx-auto rounded-lg border border-input bg-muted px-4 py-2 shadow-[0_0_6px_rgba(0,0,0,0.06)]",
        long && !expanded && "cursor-pointer hover:bg-muted/50",
      )} onClick={long && !expanded ? () => setExpanded(true) : undefined}>
        <div className="flex items-start gap-2">
          <span className={cn(
            "flex-1 text-[length:var(--font-chat-message)] text-foreground",
            long && !expanded ? "line-clamp-2" : "whitespace-pre-wrap break-words",
          )}>
            {text}
          </span>
          <CopyButton text={text} />
        </div>
        {long && !expanded && (
          <div className="text-[length:var(--font-chat-meta)] text-muted-foreground mt-0.5">Click to expand</div>
        )}
        {long && expanded && (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(false); }}
            className="text-[length:var(--font-chat-meta)] text-muted-foreground hover:text-foreground mt-0.5"
          >
            Collapse
          </button>
        )}
      </div>
    </div>
  );
});

// ─── Assistant Message ───

const AssistantMessage = memo(function AssistantMessage({
  msg,
  toolResultMap,
  metaText,
  msgIndex,
  isStreamingMsg,
}: {
  msg: ChatStreamMessage;
  toolResultMap: Map<string, ContentBlock>;
  metaText?: string;
  msgIndex: number;
  isStreamingMsg?: boolean;
}) {
  const blocks = contentBlocks(msg.message?.content);
  const textBlock = blocks.find((b) => b.type === "text");
  const fullText = textBlock?.text || "";
  const sessionId = msg.session_id || "";

  // Thinking is complete once the assistant emits text or tool_use blocks.
  // The thinking timer should stop — it measures thinking time, not the
  // total response time (which is shown separately as "Completed in Xs").
  const thinkingComplete = blocks.some(
    (b) => b.type === "text" || b.type === "tool_use",
  );

  return (
    <div className="group w-full py-2 px-6 animate-in fade-in slide-in-from-bottom-1 duration-200">
      <div className="min-w-0 flex-1">
          {blocks.map((block, i) => {
            if (block.type === "thinking" && block.thinking) {
              return (
                <ThinkingWidget
                  key={i}
                  thinking={block.thinking}
                  duration={(block as any).duration}
                  persistKey={sessionId ? `${sessionId}:${msgIndex}:${i}` : undefined}
                  isStreamingMsg={isStreamingMsg && !thinkingComplete}
                  isProgress={(block as any)._progress === true}
                />
              );
            }
            if (block.type === "text" && block.text) {
              return (
                <div key={i} className="text-[length:var(--font-chat-message)]">
                  <MarkdownRenderer content={block.text} isAnimating={isStreamingMsg} />
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

export const ChatMessages = memo(function ChatMessages() {
  const messages = useChatStore((s) => s.messages);
  const streamingMessage = useChatStore((s) => s.streamingMessage);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const activeTabId = useChatStore((s) => s.activeTabId);

  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // ── Stable computations (committed messages only) ──
  // These O(n) scans only re-run when committed messages change,
  // NOT on every stream delta.

  const toolResultMap = useMemo(() => {
    const map = new Map<string, ContentBlock>();
    for (const msg of messages) {
      for (const block of contentBlocks(msg.message?.content)) {
        if (block.type === "tool_result" && block.tool_use_id) {
          map.set(block.tool_use_id, block);
        }
      }
    }
    return map;
  }, [messages]);

  const committed = useMemo(() => {
    const seenResultKeys = new Set<string>();
    const idxMap = new Map<ChatStreamMessage, number>();
    const filtered = messages.filter((msg, i) => {
      if (msg.type === "system") return false;
      if (msg.type === "user" && isAllToolResults(msg.message?.content)) {
        return false;
      }
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
    return { display: filtered, idxMap };
  }, [messages]);

  const metaMap = useMemo(() => {
    const map = new Map<number, string>();
    const disp = committed.display;
    for (let i = 0; i < disp.length - 1; i++) {
      const msg = disp[i];
      const next = disp[i + 1];
      if (msg.type === "assistant" && next.type === "result" && !next.is_error) {
        const parts: string[] = [];
        if (next.duration_ms != null) {
          parts.push(`Completed in ${(next.duration_ms / 1000).toFixed(1)}s`);
        }
        // usage may be at top level (live) or inside message (JSONL)
        const u = next.usage || next.message?.usage;
        if (u?.input_tokens || u?.output_tokens) {
          const input = u.input_tokens >= 1000 ? `${(u.input_tokens / 1000).toFixed(1)}k` : `${u.input_tokens}`;
          const output = u.output_tokens >= 1000 ? `${(u.output_tokens / 1000).toFixed(1)}k` : `${u.output_tokens}`;
          parts.push(`↑${input} ↓${output}`);
        }
        if (parts.length > 0) map.set(i, parts.join(" · "));
      }
    }
    return map;
  }, [committed.display]);

  const inlinedResults = useMemo(() => {
    const set = new Set<number>();
    const disp = committed.display;
    for (let i = 0; i < disp.length - 1; i++) {
      const msg = disp[i];
      const next = disp[i + 1];
      if (msg.type === "assistant" && next.type === "result" && !next.is_error) {
        set.add(i + 1);
      }
    }
    return set;
  }, [committed.display]);

  // ── Streaming-dependent: append streaming message to display ──
  const displayMessages = useMemo(() => {
    if (!streamingMessage) return committed.display;
    return [...committed.display, streamingMessage];
  }, [committed.display, streamingMessage]);

  // ── Group messages into turns ──
  // Each turn: a user message followed by its assistant/result responses.
  // The user header becomes a sticky top-0 bar; responses render below.

  interface Turn {
    userMessage: ChatStreamMessage | null;
    responses: { msg: ChatStreamMessage; displayIdx: number }[];
  }

  const turns = useMemo(() => {
    const result: Turn[] = [];
    let current: Turn = { userMessage: null, responses: [] };

    for (let i = 0; i < displayMessages.length; i++) {
      const msg = displayMessages[i];
      if (msg.type === "user") {
        if (current.userMessage || current.responses.length > 0) {
          result.push(current);
        }
        current = { userMessage: msg, responses: [] };
      } else {
        current.responses.push({ msg, displayIdx: i });
      }
    }
    if (current.userMessage || current.responses.length > 0) {
      result.push(current);
    }
    return result;
  }, [displayMessages]);

  // Show the streaming "Thinking..." indicator until the AI emits
  // ≥10 chars of thinking content. This avoids flicker when the first
  // 1-2 character delta arrives and the ThinkingWidget isn't ready yet.
  const showStreamingIndicator = isStreaming && !displayMessages.some(
    (m) => m.type === "assistant" && m.message?.content?.some(
      (b) => b.type === "thinking" && b.thinking && b.thinking.length >= 10 && !(b as any)._progress,
    ),
  );

  // ── Auto-scroll ──

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "instant" });
    setShowScrollButton(false);
  }, []);

  // Track whether user is at bottom
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

  // Auto-scroll when streaming content changes and user is at bottom
  useEffect(() => {
    if (shouldAutoScrollRef.current) {
      scrollToBottom(false);
    }
  }, [displayMessages, showStreamingIndicator]);

  // Reset auto-scroll when streaming starts or tab switches
  useEffect(() => {
    if (isStreaming) {
      shouldAutoScrollRef.current = true;
      scrollToBottom(false);
    }
  }, [isStreaming, activeTabId]);

  // ── Empty state ──

  if (displayMessages.length === 0 && !isStreaming) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <p className="text-[length:var(--font-chat-meta)] text-muted-foreground">
          No messages yet — start a conversation below
        </p>
      </div>
    );
  }

  // ── Render ──

  return (
    <div className="relative flex-1 min-h-0">
      <div ref={scrollRef} className="absolute inset-0 overflow-y-auto scroll-smooth">
        <div className="min-h-full pb-4 max-w-3xl mx-auto">
          {turns.map((turn, turnIdx) => (
            <section key={turn.userMessage ? `turn-${committed.idxMap.get(turn.userMessage) ?? turnIdx}` : `turn-orphan-${turnIdx}`}>
              {turn.userMessage && (
                <UserHeader msg={turn.userMessage} />
              )}
              <div>
                {turn.responses.map(({ msg, displayIdx }) => {
                  const idx = committed.idxMap.get(msg) ?? messages.length;
                  const isStreamingMsg = msg === streamingMessage;
                  if (msg.type === "assistant") {
                    return (
                      <AssistantMessage
                        key={`asst-${idx}`}
                        msg={msg}
                        toolResultMap={toolResultMap}
                        metaText={metaMap.get(displayIdx)}
                        msgIndex={idx}
                        isStreamingMsg={isStreamingMsg}
                      />
                    );
                  }
                  if (msg.type === "result") {
                    // Only show standalone result if it's an error; normal
                    // completion results render as hover meta on the assistant.
                    if (!msg.is_error) return null;
                    return <ResultMessage key={`result-${idx}`} msg={msg} />;
                  }
                  return null;
                })}
              </div>
            </section>
          ))}
          {showStreamingIndicator && (
            <StreamingIndicator />
          )}
        </div>
      </div>

      {/* Scroll to bottom FAB */}
      <div className="absolute inset-x-0 bottom-4 pointer-events-none z-10">
        <div className="max-w-3xl mx-auto flex justify-end px-4">
          {showScrollButton && (
            <button
              type="button"
              onClick={() => scrollToBottom(true)}
              className="pointer-events-auto flex size-8 items-center justify-center rounded-full border border-border bg-background shadow-md text-muted-foreground hover:text-foreground transition-all hover:shadow-lg"
            >
              <ArrowDownIcon className="size-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
});
