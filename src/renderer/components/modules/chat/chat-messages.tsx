import { useEffect, useLayoutEffect, useRef, useState, memo, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useChatStore, type ChatStreamMessage, type ContentBlock } from "@/stores/chat-store";
import { MarkdownRenderer } from "./markdown-renderer";
import { AssistantBlockList } from "./assistant-block-list";
export { AssistantBlockList } from "./assistant-block-list";
import "./tools/task-widget-register";
import { TurnFooter, extractTurnCopyText } from "./turn-footer";
import { InlineRichText, InlineTokenChip } from "./inline-tokens";
import { partsToPlainText, type ComposerPart } from "@/lib/chat/composer-parts";
import {
  captureSentinelScrollAnchor,
  followActiveTurnTail,
  getTurnScrollTop,
  isFollowingStreamTurn,
  pinActiveTurnTop,
  restoreSentinelScrollAnchor,
  scrollToTurnEnd,
  type SentinelsScrollAnchor,
} from "@/lib/chat/active-turn-scroll";
import {
  maybeSnapWindowStart,
  pageUpWindowStart,
  resolveWindowStart,
  setTurnWindowStart,
  TURN_WINDOW_COAST_END_MS,
  TURN_WINDOW_LOAD_PULL_PX,
  TURN_WINDOW_SENTINEL_SUPPRESS_MS,
} from "@/lib/chat/turn-window";
import { isToolResultUserMessage } from "./chat-turns";
import { buildToolResultMap, contentBlocks } from "./tools/tool-result-map";
import { useDocumentStore } from "@/stores/document-store";
import { useLiteratureStore } from "@/stores/literature-store";
import {
  AlertCircleIcon,
  CopyIcon,
  CheckIcon,
  ArrowDownIcon,
  ZapIcon,
  Loader2Icon,
  CircleCheckIcon,
  ChevronRightIcon,
  SquareIcon,
} from "lucide-react";
import { ChatImagePreviewDialog } from "@/lib/markdown/chat-image-preview";
import { Hint } from "@/components/ui/hint";

// ─── Copy Button ───

const CopyButton = memo(({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <Hint label="Copy">
      <button
        type="button"
        onClick={handleCopy}
        className="flex size-6 items-center justify-center rounded-md text-muted-foreground/60 opacity-0 transition-all hover:bg-accent hover:text-accent-foreground group-hover:opacity-100"
      >
        {copied ? <CheckIcon className="size-3 text-success" /> : <CopyIcon className="size-3" />}
      </button>
    </Hint>
  );
});
CopyButton.displayName = "CopyButton";

// ─── Streaming Indicator ───

// Parent turn column already applies px-6 — keep this flush with ThinkingWidget.
const StreamingIndicator = memo(({ label }: { label: string }) => (
  <div className="mb-2 flex items-center gap-2">
    <div className="flex items-center gap-1">
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:0ms]" />
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:150ms]" />
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:300ms]" />
    </div>
    <span className="text-muted-foreground text-[length:var(--font-chat-meta)]">{label}</span>
  </div>
));
StreamingIndicator.displayName = "StreamingIndicator";

// ─── User Header ───

const UserHeader = memo(function UserHeader({
  msg,
  isActiveTurn = false,
}: {
  msg: ChatStreamMessage;
  isActiveTurn?: boolean;
}) {
  const allBlocks = contentBlocks(msg.message?.content);
  const commandBlocks = allBlocks.filter((b) => b.type === "command");
  const profileBlocks = allBlocks.filter((b) => b.type === "profile");

  const inlineParts: ComposerPart[] = [];
  const attachments: NonNullable<ContentBlock["attachments"]> = [];
  for (const b of allBlocks) {
    if (b.type === "text" && b.inlineParts?.length) {
      inlineParts.push(...b.inlineParts);
    }
    if (b.type === "text" && b.attachments?.length) {
      attachments.push(...b.attachments);
    }
  }
  const hasInline = inlineParts.length > 0;

  const text = hasInline
    ? partsToPlainText(inlineParts)
    : allBlocks
        .filter((b) => {
          if (b.type !== "text" || !b.text) return false;
          const t = b.text;
          if (
            t.startsWith("## Role") &&
            (t.includes("integrated into prismnext") ||
              t.includes("integrated into Prism") ||
              t.includes("LaTeX academic paper writing workspace") ||
              t.includes("## Core Rules"))
          ) {
            return false;
          }
          return true;
        })
        .map((b) => b.text)
        .join("\n");
  const [expanded, setExpanded] = useState(false);
  const [imagePreview, setImagePreview] = useState<{ url: string; name: string } | null>(null);

  const long = text.length > 140;
  const hasBody = Boolean(text) || hasInline || attachments.length > 0;

  // Inset with margin (matches composer `px-3`), not padded sticky plate —
  // gutters stay transparent so glass / panel surfaces show through cleanly.
  return (
    <div
      className={cn(
        "sticky top-0 z-20 mx-3 mb-2",
        isActiveTurn && "z-30",
      )}
    >
      <div
        className={cn(
          // Opaque bg — /50 hover looked “transparent” over glass chat surfaces.
          "rounded-lg border border-input bg-muted px-4 py-2 shadow-[0_0_6px_rgba(0,0,0,0.06)]",
          long && !expanded && "cursor-pointer transition-colors hover:bg-accent",
        )}
        onClick={long && !expanded ? () => setExpanded(true) : undefined}
      >
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            {/* Legacy profile + command chips (pre-inline messages) */}
            {!hasInline && (profileBlocks.length > 0 || commandBlocks.length > 0) && (
              <div className="flex flex-wrap items-center gap-1 mb-1.5">
                {profileBlocks.map((block, i) => (
                  <InlineTokenChip
                    key={`profile-${i}`}
                    variant="profile"
                    prefix="@"
                    label={block.name ?? "profile"}
                  />
                ))}
                {commandBlocks.map((block, i) => (
                  <InlineTokenChip
                    key={i}
                    variant={(block as ContentBlock & { action?: string }).action ? "command-action" : "command"}
                    prefix="/"
                    label={block.name ?? "command"}
                  />
                ))}
              </div>
            )}
            {attachments.length > 0 && (
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                {attachments.map((att, i) => (
                  <span
                    key={`${att.path}-${i}`}
                    className="inline-flex max-w-[9rem] items-center gap-1.5 rounded-md border border-border/80 bg-background/50 px-1.5 py-0.5"
                  >
                    {att.kind === "image" && att.previewUrl ? (
                      <button
                        type="button"
                        aria-label={`Preview ${att.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setImagePreview({ url: att.previewUrl!, name: att.name });
                        }}
                        className="shrink-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <img
                          src={att.previewUrl}
                          alt={att.name}
                          className="size-7 rounded object-cover transition-opacity hover:opacity-90"
                        />
                      </button>
                    ) : null}
                    <span className="truncate font-mono text-[length:var(--font-chat-meta)] text-muted-foreground">
                      {att.name}
                    </span>
                    {att.note ? (
                      <span className="truncate text-[length:var(--font-size-10)] text-primary/80">
                        {att.note}
                      </span>
                    ) : null}
                  </span>
                ))}
              </div>
            )}
            {(hasInline || text) && (
              <span
                className={cn(
                  "text-[length:var(--font-chat-message)] text-foreground",
                  long && !expanded ? "line-clamp-2" : "whitespace-pre-wrap break-words",
                )}
              >
                {hasInline ? (
                  <InlineRichText parts={inlineParts} />
                ) : text ? (
                  <InlineRichText text={text} />
                ) : null}
              </span>
            )}
            {!hasBody && (
              <span className="text-[length:var(--font-chat-meta)] text-muted-foreground">
                (attachment)
              </span>
            )}
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
      <ChatImagePreviewDialog
        open={imagePreview != null}
        onOpenChange={(open) => !open && setImagePreview(null)}
        url={imagePreview?.url ?? null}
        name={imagePreview?.name ?? "Image preview"}
      />
    </div>
  );
});

// ─── Assistant Message ───

const AssistantMessage = memo(function AssistantMessage({
  msg,
  toolResultMap,
  msgIndex,
  isStreamingMsg,
  sessionId,
}: {
  msg: ChatStreamMessage;
  toolResultMap: Map<string, ContentBlock>;
  msgIndex: number;
  isStreamingMsg?: boolean;
  sessionId: string;
}) {
  const blocks = contentBlocks(msg.message?.content);

  return (
    <div className="group w-full min-w-0 max-w-full overflow-hidden animate-in fade-in slide-in-from-bottom-1 duration-200">
      <div className="min-w-0 flex-1">
        <AssistantBlockList
          blocks={blocks}
          toolResultMap={toolResultMap}
          msgIndex={msgIndex}
          isStreamingMsg={isStreamingMsg}
          sessionId={sessionId}
        />
      </div>
      {msg.stopped && (
        <div className="mt-1 flex items-center gap-1.5 text-[length:var(--font-chat-meta)] text-muted-foreground">
          <SquareIcon className="size-3 shrink-0 fill-current" />
          <span>已停止</span>
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

// ─── Action Status Message ───

function ActionStatusCard({ msg }: { msg: ChatStreamMessage }) {
  const { actionName, status, result, duration_ms } = msg;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-1 duration-200">
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

/** Inline Approve / Reject notice — flat card; approved+path is openable. */
function PlanDecisionCard({ msg }: { msg: ChatStreamMessage }) {
  const { t } = useTranslation();
  const openPlanFileInEditor = useChatStore((s) => s.openPlanFileInEditor);
  const approved = msg.planDecision === "approved";
  const title = msg.planTitle?.trim();
  const path = msg.planPath?.trim();
  const openable = approved && !!path;

  const body = (
    <>
      {approved ? (
        <CircleCheckIcon className="size-3.5 shrink-0 text-success" />
      ) : (
        <AlertCircleIcon className="size-3.5 shrink-0 text-muted-foreground" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[length:var(--font-chat-meta)] font-medium text-foreground">
          {approved
            ? t("chat.planWorkflow.decisionApproved")
            : t("chat.planWorkflow.decisionRejected")}
        </p>
        {(title || path || msg.result) && (
          <p className="truncate text-[length:var(--font-chat-meta)] text-muted-foreground">
            {title || path || msg.result}
          </p>
        )}
      </div>
      {openable ? (
        <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
      ) : null}
    </>
  );

  return (
    <div className="mb-2">
      {openable ? (
        <button
          type="button"
          className={cn(
            "flex w-full items-center gap-2 rounded-md border border-success/30 bg-success/5 px-3 py-2 text-left",
            "transition-colors hover:bg-success/10",
          )}
          onClick={() => void openPlanFileInEditor(path)}
        >
          {body}
        </button>
      ) : (
        <div className="flex w-full items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
          {body}
        </div>
      )}
    </div>
  );
}

// ─── Chat Messages ───

const chatLiteratureWarmupRoots = new Set<string>();

export const ChatMessages = memo(function ChatMessages() {
  const { t } = useTranslation();
  const messages = useChatStore((s) => s.messages);
  const streamingMessage = useChatStore((s) => s.streamingMessage);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const preparePhase = useChatStore((s) => s.preparePhase);
  const isLoadingSession = useChatStore((s) => s.isLoadingSession);
  const activeTabId = useChatStore((s) => s.activeTabId);
  const chatSessionId = useChatStore((s) => s.sessionId);
  const turnMeta = useChatStore((s) => s.turnMeta);
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const streamingLabel = preparePhase
    ? t(`chat.prepare.${preparePhase}`, { defaultValue: t("chat.prepare.thinking") })
    : t("chat.prepare.thinking");

  useEffect(() => {
    if (!projectRoot) return;
    const { papers, refresh } = useLiteratureStore.getState();
    if (papers.length > 0 || chatLiteratureWarmupRoots.has(projectRoot)) return;
    chatLiteratureWarmupRoots.add(projectRoot);
    void refresh(projectRoot);
  }, [projectRoot]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const lastTurnRef = useRef<HTMLElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const wasStreamingRef = useRef(false);
  const isStreamingRef = useRef(isStreaming);
  isStreamingRef.current = isStreaming;
  const streamScrollRafRef = useRef<number | null>(null);
  const suppressSentinelUntilRef = useRef(0);
  const loadingOlderRef = useRef(false);
  const loadMoreArmedRef = useRef(false);
  /**
   * false = still in the 1st gesture (coasting to a stop on "load more");
   * true = 1st gesture ended — a new upward pull may accumulate toward load.
   */
  const loadMoreSecondGestureRef = useRef(false);
  /** Last upward wheel while coasting (1st gesture). 0 = none since arm. */
  const loadMoreCoastWheelAtRef = useRef(0);
  const loadMoreCoastRafRef = useRef<number | null>(null);
  /** Accumulated upward px of the 2nd gesture — must reach TURN_WINDOW_LOAD_PULL_PX. */
  const loadMorePullAccumRef = useRef(0);
  const windowStartRef = useRef(0);
  /** Applied in useLayoutEffect after React commits prepended turns. */
  const pendingPrependAnchorRef = useRef<SentinelsScrollAnchor | null>(null);
  const [loadMorePhase, setLoadMorePhase] = useState<"idle" | "armed" | "loading">("idle");
  const [loadMorePullProgress, setLoadMorePullProgress] = useState(0);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [isActiveTurnMode, setIsActiveTurnMode] = useState(true);

  const pinToActiveTurn = useCallback((smooth = false) => {
    const container = scrollRef.current;
    const turn = lastTurnRef.current;
    if (!container || !turn) return;
    pinActiveTurnTop(container, turn, smooth);
    setShowScrollButton(false);
  }, []);

  const followStreamTail = useCallback((smooth = false) => {
    const container = scrollRef.current;
    const turn = lastTurnRef.current;
    if (!container || !turn) return;
    followActiveTurnTail(container, turn, smooth);
    setShowScrollButton(false);
  }, []);

  const scrollToLatest = useCallback((smooth = false) => {
    const container = scrollRef.current;
    const turn = lastTurnRef.current;
    if (!container || !turn) return;
    scrollToTurnEnd(container, turn, smooth);
    setShowScrollButton(false);
  }, []);

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

  // Placeholder "Thinking…" until the assistant emits real content (text,
  // thinking widget, or a tool call). Hide for the rest of the turn once seen.
  const [contentSeenThisTurn, setContentSeenThisTurn] = useState(false);
  useEffect(() => {
    if (!isStreaming) setContentSeenThisTurn(false);
  }, [isStreaming]);
  useEffect(() => {
    if (!isStreaming || contentSeenThisTurn) return;
    const hasContent = displayMessages.some(
      (m) =>
        m.type === "assistant" &&
        m.message?.content?.some((b) => {
          if (b.type === "text" && b.text?.trim()) return true;
          if (
            b.type === "thinking" &&
            b.thinking?.trim() &&
            !(b as { _progress?: boolean })._progress
          ) {
            return true;
          }
          if (b.type === "tool_use") return true;
          return false;
        }),
    );
    if (hasContent) setContentSeenThisTurn(true);
  }, [displayMessages, isStreaming, contentSeenThisTurn]);
  const showStreamingIndicator = isStreaming && !contentSeenThisTurn;

  const lastTurnUserKey = turns[turns.length - 1]?.userMessage
    ? committed.idxMap.get(turns[turns.length - 1].userMessage!) ?? turns.length
    : turns.length;

  // Track the last user message OBJECT so we can distinguish between:
  //  - a genuinely new message appended at the tail (should reset auto-scroll)
  //  - idxMap indices shifting due to history prepend (should NOT reset auto-scroll)
  const lastTurnUserMsg = turns[turns.length - 1]?.userMessage ?? null;
  const prevLastUserMsgRef = useRef<ChatStreamMessage | null>(null);

  const [windowStart, setWindowStartState] = useState(0);

  useLayoutEffect(() => {
    if (!activeTabId || isLoadingSession) return;
    const start = resolveWindowStart(activeTabId, turns.length);
    windowStartRef.current = start;
    setWindowStartState(start);
    if (start <= 0) {
      loadMoreArmedRef.current = false;
      loadMoreSecondGestureRef.current = false;
      loadMoreCoastWheelAtRef.current = 0;
      loadMorePullAccumRef.current = 0;
      setLoadMorePullProgress(0);
      setLoadMorePhase("idle");
    }
  }, [activeTabId, turns.length, isLoadingSession]);

  const attachTurnSectionRef = useCallback(
    (_turnIndex: number, isLastTurn: boolean) => (el: HTMLElement | null) => {
      if (isLastTurn) {
        lastTurnRef.current = el;
      }
    },
    [],
  );

  const visibleTurns = turns.slice(windowStart);

  const stopLoadMoreCoastWatch = useCallback(() => {
    if (loadMoreCoastRafRef.current != null) {
      cancelAnimationFrame(loadMoreCoastRafRef.current);
      loadMoreCoastRafRef.current = null;
    }
  }, []);

  const disarmLoadMore = useCallback(() => {
    stopLoadMoreCoastWatch();
    loadMoreArmedRef.current = false;
    loadMoreSecondGestureRef.current = false;
    loadMoreCoastWheelAtRef.current = 0;
    loadMorePullAccumRef.current = 0;
    setLoadMorePullProgress(0);
    setLoadMorePhase((p) => (p === "loading" ? p : "idle"));
  }, [stopLoadMoreCoastWatch]);

  /** 1st gesture finished (inertia stopped) → allow a new upward pull to count. */
  const beginSecondGestureWindow = useCallback(() => {
    if (!loadMoreArmedRef.current || loadingOlderRef.current) return;
    if (loadMoreSecondGestureRef.current) return;
    loadMoreSecondGestureRef.current = true;
    loadMorePullAccumRef.current = 0;
    setLoadMorePullProgress(0);
    stopLoadMoreCoastWatch();
  }, [stopLoadMoreCoastWatch]);

  const loadOlderTurns = useCallback(() => {
    const root = scrollRef.current;
    const content = contentRef.current;
    if (!root || !content || !activeTabId) return;
    if (loadingOlderRef.current) return;
    if (Date.now() < suppressSentinelUntilRef.current) return;
    if (isStreamingRef.current && shouldAutoScrollRef.current) return;

    const currentStart = windowStartRef.current;
    if (currentStart <= 0) return;

    stopLoadMoreCoastWatch();
    loadingOlderRef.current = true;
    setLoadMorePhase("loading");
    loadMoreSecondGestureRef.current = false;
    loadMoreCoastWheelAtRef.current = 0;
    loadMorePullAccumRef.current = 0;
    setLoadMorePullProgress(0);
    // Pin to the first mounted turn (bottom of the page we're about to prepend onto).
    // Restore runs in useLayoutEffect AFTER React commits the new sections above it.
    pendingPrependAnchorRef.current = captureSentinelScrollAnchor(root, content);
    const next = pageUpWindowStart(currentStart);
    setTurnWindowStart(activeTabId, next);
    windowStartRef.current = next;
    setWindowStartState(next);
    loadMoreArmedRef.current = false;
  }, [activeTabId, stopLoadMoreCoastWatch]);

  // Keep the previously-visible turn fixed in the viewport after older turns mount above it.
  useLayoutEffect(() => {
    const anchor = pendingPrependAnchorRef.current;
    if (!anchor) return;
    const root = scrollRef.current;
    const content = contentRef.current;
    if (!root || !content) {
      pendingPrependAnchorRef.current = null;
      loadingOlderRef.current = false;
      setLoadMorePhase("idle");
      return;
    }
    restoreSentinelScrollAnchor(root, anchor, content);
    pendingPrependAnchorRef.current = null;
    loadingOlderRef.current = false;
    setLoadMorePhase("idle");
    suppressSentinelUntilRef.current = Date.now() + TURN_WINDOW_SENTINEL_SUPPRESS_MS;
  }, [windowStart]);

  const applySnapIfNeeded = useCallback(() => {
    if (!activeTabId) return;
    const next = maybeSnapWindowStart({
      totalTurns: turns.length,
      windowStart,
      followingBottom: shouldAutoScrollRef.current,
      isStreaming,
    });
    if (next !== windowStart) {
      setTurnWindowStart(activeTabId, next);
      windowStartRef.current = next;
      setWindowStartState(next);
      suppressSentinelUntilRef.current = Date.now() + TURN_WINDOW_SENTINEL_SUPPRESS_MS;
      stopLoadMoreCoastWatch();
      loadMoreArmedRef.current = false;
      loadMoreSecondGestureRef.current = false;
      loadMoreCoastWheelAtRef.current = 0;
      loadMorePullAccumRef.current = 0;
      setLoadMorePullProgress(0);
      setLoadMorePhase("idle");
    }
  }, [activeTabId, turns.length, windowStart, isStreaming, stopLoadMoreCoastWatch]);

  // 1) Scroll into "load more" and coast to a stop.
  // 2) Start a *new* upward gesture; accumulate TURN_WINDOW_LOAD_PULL_PX → load (or click).
  useEffect(() => {
    const root = scrollRef.current;
    const target = topSentinelRef.current;
    if (!root || !target || windowStart <= 0) return;

    const watchCoastEnd = () => {
      stopLoadMoreCoastWatch();
      const tick = () => {
        loadMoreCoastRafRef.current = null;
        if (!loadMoreArmedRef.current || loadMoreSecondGestureRef.current || loadingOlderRef.current) {
          return;
        }
        const last = loadMoreCoastWheelAtRef.current;
        if (last > 0 && performance.now() - last >= TURN_WINDOW_COAST_END_MS) {
          beginSecondGestureWindow();
          return;
        }
        loadMoreCoastRafRef.current = requestAnimationFrame(tick);
      };
      loadMoreCoastRafRef.current = requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((e) => e.isIntersecting);
        if (!hit) {
          if (!loadingOlderRef.current) disarmLoadMore();
          return;
        }
        if (loadingOlderRef.current) return;
        if (Date.now() < suppressSentinelUntilRef.current) return;
        if (isStreamingRef.current && shouldAutoScrollRef.current) return;
        if (loadMoreArmedRef.current) return;

        // Park on the control — still the 1st gesture until inertia ends.
        loadMoreArmedRef.current = true;
        loadMoreSecondGestureRef.current = false;
        // Seed coast clock so an already-stopped arrival unlocks after COAST_END_MS;
        // ongoing inertia keeps refreshing this timestamp via wheel.
        loadMoreCoastWheelAtRef.current = performance.now();
        loadMorePullAccumRef.current = 0;
        setLoadMorePullProgress(0);
        setLoadMorePhase("armed");
        watchCoastEnd();
      },
      { root, rootMargin: "24px 0px 0px 0px", threshold: 0 },
    );
    io.observe(target);

    const onScrollEnd = () => {
      // Platform signal that the scroll (incl. momentum) finished.
      if (loadMoreArmedRef.current && !loadMoreSecondGestureRef.current) {
        beginSecondGestureWindow();
      }
    };
    root.addEventListener("scrollend", onScrollEnd);

    const onWheel = (e: WheelEvent) => {
      if (loadingOlderRef.current) return;
      if (Date.now() < suppressSentinelUntilRef.current) return;
      if (isStreamingRef.current && shouldAutoScrollRef.current) return;

      if (e.deltaY > 0) {
        // Downward nudge also ends the 1st gesture / clears 2nd-gesture progress.
        if (loadMoreArmedRef.current && !loadMoreSecondGestureRef.current) {
          beginSecondGestureWindow();
        }
        if (loadMorePullAccumRef.current > 0) {
          loadMorePullAccumRef.current = 0;
          setLoadMorePullProgress(0);
        }
        return;
      }

      if (e.deltaY >= 0) return;
      if (root.scrollTop > 2) return;
      if (!loadMoreArmedRef.current) return;

      // Stay parked on "load more".
      e.preventDefault();

      if (!loadMoreSecondGestureRef.current) {
        // Still coasting from the 1st fling — do not count toward load.
        loadMoreCoastWheelAtRef.current = performance.now();
        watchCoastEnd();
        return;
      }

      // New upward gesture after the 1st one stopped.
      loadMorePullAccumRef.current += -e.deltaY;
      const progress = Math.min(1, loadMorePullAccumRef.current / TURN_WINDOW_LOAD_PULL_PX);
      setLoadMorePullProgress(progress);
      if (loadMorePullAccumRef.current < TURN_WINDOW_LOAD_PULL_PX) return;

      loadOlderTurns();
    };
    root.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      io.disconnect();
      root.removeEventListener("scrollend", onScrollEnd);
      root.removeEventListener("wheel", onWheel);
      stopLoadMoreCoastWatch();
    };
  }, [
    windowStart,
    activeTabId,
    turns.length,
    disarmLoadMore,
    loadOlderTurns,
    beginSecondGestureWindow,
    stopLoadMoreCoastWatch,
  ]);

  const returnToActiveTurn = useCallback(
    (smooth = false) => {
      shouldAutoScrollRef.current = true;
      setIsActiveTurnMode(true);
      if (isStreamingRef.current) {
        followStreamTail(smooth);
      } else {
        scrollToLatest(smooth);
      }
      requestAnimationFrame(() => {
        shouldAutoScrollRef.current = true;
        applySnapIfNeeded();
      });
    },
    [followStreamTail, scrollToLatest, applySnapIfNeeded],
  );

  /** Sync runway CSS var only — no scroll (avoids fighting stream tail follow). */
  const syncRunwayMinHeight = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return 0;
    const next = el.clientHeight;
    if (next > 0) {
      el.style.setProperty("--chat-runway-h", `${next}px`);
    }
    setViewportHeight((prev) => (prev === next ? prev : next));
    return next;
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    syncRunwayMinHeight();
    const ro = new ResizeObserver(() => {
      syncRunwayMinHeight();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [syncRunwayMinHeight]);

  // ── Scroll: pin user message on new turn; follow tail while streaming ──

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      const turn = lastTurnRef.current;
      let following = true;

      if (turn) {
        if (isStreaming) {
          following = isFollowingStreamTurn(el, turn);
        } else {
          const turnTop = getTurnScrollTop(el, turn);
          const turnHeight = turn.offsetHeight;
          const viewH = el.clientHeight;
          const tailScrollTop = turnTop + turnHeight - viewH;
          const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
          if (turnHeight <= viewH) {
            following = el.scrollTop >= turnTop - 20 || maxScroll < turnTop - 20;
          } else {
            following = el.scrollTop >= tailScrollTop - 80;
          }
        }
      }

      shouldAutoScrollRef.current = following;
      setIsActiveTurnMode(following);
      setShowScrollButton(!following && el.scrollHeight > el.clientHeight + 100);
    };
    handleScroll();
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [isStreaming]);

  useLayoutEffect(() => {
    const msg = lastTurnUserMsg;
    const isNewUserMsg = msg !== null && msg !== prevLastUserMsgRef.current;
    prevLastUserMsgRef.current = msg;

    if (isNewUserMsg) {
      shouldAutoScrollRef.current = true;
      setIsActiveTurnMode(true);
      syncRunwayMinHeight();
      requestAnimationFrame(() => {
        pinToActiveTurn(false);
        applySnapIfNeeded();
      });
    }
  }, [lastTurnUserMsg, lastTurnUserKey, pinToActiveTurn, syncRunwayMinHeight, applySnapIfNeeded]);

  useLayoutEffect(() => {
    if (isLoadingSession || turns.length === 0) return;
    syncRunwayMinHeight();
    requestAnimationFrame(() => {
      if (shouldAutoScrollRef.current) {
        if (isStreaming) followStreamTail(false);
        else scrollToLatest(false);
      }
    });
  }, [isLoadingSession, turns.length, activeTabId, isStreaming, followStreamTail, scrollToLatest, syncRunwayMinHeight]);

  useLayoutEffect(() => {
    const wasStreaming = wasStreamingRef.current;
    wasStreamingRef.current = isStreaming;
    if (wasStreaming && !isStreaming && shouldAutoScrollRef.current) {
      syncRunwayMinHeight();
      requestAnimationFrame(() => {
        scrollToLatest(false);
        applySnapIfNeeded();
      });
    }
  }, [isStreaming, scrollToLatest, syncRunwayMinHeight, applySnapIfNeeded]);

  useLayoutEffect(() => {
    if (!isStreaming || !shouldAutoScrollRef.current) return;
    followStreamTail(false);
  }, [viewportHeight, isStreaming, followStreamTail]);

  useEffect(() => {
    if (!isStreaming || !shouldAutoScrollRef.current) return;
    if (streamScrollRafRef.current != null) return;
    streamScrollRafRef.current = requestAnimationFrame(() => {
      streamScrollRafRef.current = null;
      if (shouldAutoScrollRef.current) followStreamTail(false);
    });
    return () => {
      if (streamScrollRafRef.current != null) {
        cancelAnimationFrame(streamScrollRafRef.current);
        streamScrollRafRef.current = null;
      }
    };
  }, [displayMessages, isStreaming, followStreamTail]);

  // ── Loading / empty state ──

  if (isLoadingSession) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 p-4">
        <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
        <p className="text-[length:var(--font-chat-meta)] text-muted-foreground">
          {t("chat.messages.loading")}
        </p>
      </div>
    );
  }

  if (displayMessages.length === 0 && !isStreaming) {
    return <div className="flex flex-1 min-h-0" aria-hidden />;
  }

  // ── Render ──

  return (
    <div className="relative flex-1 min-h-0 min-w-0 overflow-hidden">
      <div
        ref={scrollRef}
        data-chat-scroll
        className="absolute inset-0 overflow-y-auto overflow-x-hidden"
      >
        <div ref={contentRef} data-chat-width className="w-full min-w-0">
          {windowStart > 0 && (
            <div
              ref={topSentinelRef}
              data-chat-turn-window-load-more
              className="flex justify-center px-6 py-3"
            >
              <button
                type="button"
                onClick={() => loadOlderTurns()}
                disabled={loadMorePhase === "loading"}
                className={cn(
                  "relative overflow-hidden inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-muted/40 px-3 py-1.5",
                  "text-[length:var(--font-chat-meta)] text-muted-foreground transition-colors",
                  "hover:bg-muted/70 hover:text-foreground disabled:opacity-60",
                  loadMorePhase === "armed" && "border-border text-foreground/80",
                )}
              >
                {loadMorePullProgress > 0 && loadMorePhase === "armed" && (
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 bg-foreground/10 transition-[width] duration-75"
                    style={{ width: `${Math.round(loadMorePullProgress * 100)}%` }}
                  />
                )}
                <span className="relative inline-flex items-center gap-1.5">
                  {loadMorePhase === "loading" ? (
                    <>
                      <Loader2Icon className="size-3.5 animate-spin" />
                      {t("chat.messages.loadingOlder")}
                    </>
                  ) : loadMorePhase === "armed" ? (
                    loadMorePullProgress > 0.05
                      ? t("chat.messages.loadMorePulling")
                      : t("chat.messages.loadMoreArmed")
                  ) : (
                    t("chat.messages.loadMore")
                  )}
                </span>
              </button>
            </div>
          )}
          {visibleTurns.map((turn, localIdx) => {
            const turnIdx = windowStart + localIdx;
            const isLastTurn = localIdx === visibleTurns.length - 1;
            const isTurnComplete = !isLastTurn || !isStreaming;
            const lastAsst = [...turn.responses].reverse().find((r) => r.msg.type === "assistant");
            const turnMetaText = lastAsst ? metaMap.get(lastAsst.displayIdx) : undefined;
            const turnStamp = turnMeta[turnIdx];

            return (
            <section
              key={turn.userMessage ? `turn-${committed.idxMap.get(turn.userMessage) ?? turnIdx}` : `turn-orphan-${turnIdx}`}
              data-chat-turn-index={turnIdx}
              ref={attachTurnSectionRef(turnIdx, isLastTurn)}
              style={
                isLastTurn
                  ? { minHeight: "var(--chat-runway-h, 100%)" }
                  : undefined
              }
            >
              {turn.userMessage && (
                <UserHeader msg={turn.userMessage} isActiveTurn={isLastTurn} />
              )}
              <div className="px-6 min-w-0 max-w-full overflow-hidden">
                {isLastTurn && showStreamingIndicator && (
                  <StreamingIndicator label={streamingLabel} />
                )}
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
                        sessionId={chatSessionId ?? ""}
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
                  if (msg.type === "plan-decision") {
                    return (
                      <PlanDecisionCard
                        key={`plan-decision-${displayIdx}`}
                        msg={msg}
                      />
                    );
                  }
                  // Created Plan renders inline after write/edit tools (AssistantBlockList).
                  if (msg.type === "plan-artifact") {
                    return null;
                  }
                  if (msg.type === "result") {
                    if (!msg.is_error) return null;
                    return <ResultMessage key={`result-${idx}`} msg={msg} />;
                  }
                  return null;
                })}
                <TurnFooter
                  turnIndex={turnIdx}
                  copyText={extractTurnCopyText(turn.responses)}
                  isComplete={isTurnComplete}
                  completedAt={turnStamp?.completedAt}
                  modelLabel={turnStamp?.modelLabel}
                  detailHint={turnStamp?.summary ?? turnMetaText}
                />
              </div>
            </section>
            );
          })}
        </div>
      </div>

      {/* Scroll to bottom FAB */}
      <div className="absolute inset-x-0 bottom-4 pointer-events-none z-10">
        <div data-chat-width className="flex justify-end px-4">
          {showScrollButton && (
            <button
              type="button"
              onClick={() => returnToActiveTurn(true)}
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
