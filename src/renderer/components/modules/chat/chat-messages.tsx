import { useEffect, useRef, useState, memo, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import { useChatStore, type ChatStreamMessage, type ContentBlock } from "@/stores/chat-store";
import { MarkdownRenderer } from "./markdown-renderer";
import { ToolWidget, ThinkingWidget } from "./tools";
import { TurnFooter, extractTurnCopyText } from "./turn-footer";
import { isToolResultUserMessage } from "./chat-turns";
import { buildToolResultMap, contentBlocks } from "./tools/tool-result-map";
import {
  AlertCircleIcon,
  CopyIcon,
  CheckIcon,
  ArrowDownIcon,
  ZapIcon,
  Loader2Icon,
  CircleCheckIcon,
} from "lucide-react";

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

// Styled to match ThinkingWidget inside AssistantMessage (px-6) so the
// transition from dots to thinking is horizontally seamless.
const StreamingIndicator = memo(() => (
  <div className="flex items-center gap-2 px-6 py-1 my-1.5">
    <div className="flex items-center gap-1">
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:0ms]" />
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:150ms]" />
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:300ms]" />
    </div>
    <span className="text-muted-foreground text-[length:var(--font-chat-meta)]">Thinking…</span>
  </div>
));
StreamingIndicator.displayName = "StreamingIndicator";

// ─── User Header ───

const UserHeader = memo(function UserHeader({ msg }: { msg: ChatStreamMessage }) {
  // Join ALL text blocks to show the complete user message, filtering out
  // system prompt blocks as a safety net. Using all blocks (not just the
  // first) ensures that even if stripSystemPromptFromDisplay fails, the
  // user's actual message text is still visible.
  const allBlocks = contentBlocks(msg.message?.content);
  const commandBlocks = allBlocks.filter((b) => b.type === "command");
  const text = allBlocks
    .filter((b) => {
      if (b.type !== "text" || !b.text) return false;
      // Safety: skip blocks that look like the Prism system prompt
      const t = b.text;
      if (t.startsWith("## Role") && (
        t.includes("integrated into Prism") ||
        t.includes("LaTeX academic paper writing workspace") ||
        t.includes("## Core Rules")
      )) {
        return false;
      }
      return true;
    })
    .map((b) => b.text)
    .join("\n");
  const [expanded, setExpanded] = useState(false);

  const long = text.length > 140;

  return (
    <div className="sticky top-0 z-20 bg-transparent px-3 pb-2">
      <div className={cn(
        "max-w-3xl mx-auto rounded-lg border border-input bg-muted px-4 py-2 shadow-[0_0_6px_rgba(0,0,0,0.06)]",
        long && !expanded && "cursor-pointer hover:bg-muted/50",
      )} onClick={long && !expanded ? () => setExpanded(true) : undefined}>
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            {/* Command chips */}
            {commandBlocks.length > 0 && (
              <div className="flex flex-wrap items-center gap-1 mb-1.5">
                {commandBlocks.map((block, i) => (
                  <span
                    key={i}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono font-medium text-[length:var(--font-chat-meta)]",
                      (block as any).action
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                        : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
                    )}
                  >
                    /{block.name}
                  </span>
                ))}
              </div>
            )}
            <span className={cn(
              "text-[length:var(--font-chat-message)] text-foreground",
              long && !expanded ? "line-clamp-2" : "whitespace-pre-wrap break-words",
            )}>
              {text}
            </span>
          </div>
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
  msgIndex,
  isStreamingMsg,
}: {
  msg: ChatStreamMessage;
  toolResultMap: Map<string, ContentBlock>;
  msgIndex: number;
  isStreamingMsg?: boolean;
}) {
  const blocks = contentBlocks(msg.message?.content);

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

// ─── Action Status Message ───

function ActionStatusCard({ msg }: { msg: ChatStreamMessage }) {
  const { actionName, status, result, duration_ms } = msg;

  return (
    <div className="px-6 py-2 animate-in fade-in slide-in-from-bottom-1 duration-200">
      <div className="flex items-start gap-2.5 rounded-lg border border-border bg-card px-3.5 py-2.5 shadow-sm">
        <ZapIcon className="size-4 shrink-0 mt-0.5 text-primary" />
        <div className="flex-1 min-w-0">
          <span className="font-mono font-medium text-[length:var(--font-chat-meta)]">
            /{actionName || "unknown"}
          </span>
          <div className="flex items-center gap-1.5 mt-1">
            {status === "running" && (
              <>
                <Loader2Icon className="size-3 animate-spin text-muted-foreground" />
                <span className="text-muted-foreground text-[length:var(--font-chat-meta)]">
                  Executing...
                </span>
              </>
            )}
            {status === "success" && (
              <>
                <CircleCheckIcon className="size-3 text-success shrink-0" />
                <span className="text-[length:var(--font-chat-meta)] text-foreground/80">
                  {result || "Completed"}
                </span>
                {duration_ms != null && (
                  <span className="text-muted-foreground/50 text-[length:var(--font-chat-meta)] tabular-nums">
                    ({(duration_ms / 1000).toFixed(1)}s)
                  </span>
                )}
              </>
            )}
            {status === "error" && (
              <>
                <AlertCircleIcon className="size-3 text-destructive shrink-0" />
                <span className="text-destructive text-[length:var(--font-chat-meta)]">
                  {result || "Failed"}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
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

  const toolResultMap = useMemo(
    () => buildToolResultMap(messages, { isStreaming }),
    [messages, isStreaming],
  );

  const committed = useMemo(() => {
    const seenResultKeys = new Set<string>();
    const idxMap = new Map<ChatStreamMessage, number>();
    const filtered = messages.filter((msg, i) => {
      if (msg.type === "system") return false;
      if (msg.type === "user" && isToolResultUserMessage(msg)) {
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

  // Once thinking content is observed, hide the dots indicator permanently
  // until streaming stops. Using useEffect avoids setState-in-render.
  const [thinkingSeenThisTurn, setThinkingSeenThisTurn] = useState(false);
  useEffect(() => { if (!isStreaming) setThinkingSeenThisTurn(false); }, [isStreaming]);
  useEffect(() => {
    if (!isStreaming) return;
    const hasThinking = displayMessages.some(
      (m) => m.type === "assistant" && m.message?.content?.some(
        (b) => b.type === "thinking" && b.thinking && b.thinking.length >= 10 && !(b as any)._progress,
      ),
    );
    if (hasThinking && !thinkingSeenThisTurn) setThinkingSeenThisTurn(true);
  }, [displayMessages, isStreaming, thinkingSeenThisTurn]);
  const showStreamingIndicator = isStreaming && !thinkingSeenThisTurn;

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
          {turns.map((turn, turnIdx) => {
            const isTurnComplete = turnIdx < turns.length - 1 || !isStreaming;
            const lastAsst = [...turn.responses].reverse().find((r) => r.msg.type === "assistant");
            const turnMeta = lastAsst ? metaMap.get(lastAsst.displayIdx) : undefined;

            return (
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
                        msgIndex={idx}
                        isStreamingMsg={isStreamingMsg}
                      />
                    );
                  }
                  if (msg.type === "action-status") {
                    return (
                      <ActionStatusCard
                        key={`action-${displayIdx}`}
                        msg={msg}
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
                <TurnFooter
                  turnIndex={turnIdx}
                  copyText={extractTurnCopyText(turn.responses)}
                  metaText={turnMeta}
                  isComplete={isTurnComplete}
                />
              </div>
            </section>
            );
          })}
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
