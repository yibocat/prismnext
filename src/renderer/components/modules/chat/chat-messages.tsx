import { useEffect, useLayoutEffect, useRef, useState, memo, useCallback, useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useChatStore, type ChatStreamMessage, type ContentBlock } from "@/stores/chat-store";
import { MarkdownRenderer } from "./markdown-renderer";
import { AssistantBlockList } from "./assistant-block-list";
export { AssistantBlockList } from "./assistant-block-list";
import { TurnAssistantContent } from "./turn-assistant-content";
import "./tools/task-widget-register";
import { TurnFooter, extractTurnCopyText } from "./turn-footer";
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
import { isToolResultUserMessage, extractTurnUserPreview, isHiddenToolResultCarrier, isHiddenBackgroundTaskInjectMessage } from "./chat-turns";
import { TurnRail } from "./turn-rail";
import { buildToolResultMap, contentBlocks } from "./tools/tool-result-map";
import { MessageTodoDrawer } from "./todo-plan-bar";
import { UserMessageHeader } from "./user-message-header";
import { selectMessageTodoAnchorUserIndex } from "@/lib/chat/composer-pending-tools";
import { useDocumentStore } from "@/stores/document-store";
import { useLiteratureStore } from "@/stores/literature-store";
import {
  AlertCircleIcon,
  ArrowDownIcon,
  RotateCcwIcon,
  ZapIcon,
  Loader2Icon,
  CircleCheckIcon,
  ChevronRightIcon,
  SquareIcon,
} from "lucide-react";
import { Hint } from "@/components/ui/hint";

// ─── Streaming Indicator ───

// Parent turn column already applies px-6 — keep this flush with ThinkingWidget.
const StreamingIndicator = memo(({ label }: { label: string }) => {
  return (
    <div className="mb-2 flex items-center gap-2">
      <div className="flex items-center gap-1">
        <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:0ms]" />
        <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:150ms]" />
        <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:300ms]" />
      </div>
      <span className="text-muted-foreground text-[length:var(--font-chat-meta)]">
        {label}
      </span>
    </div>
  );
});
StreamingIndicator.displayName = "StreamingIndicator";

// ─── Turn error retry ───
// Error body lives in the assistant bubble (`turnError`); this is Retry only.

const TurnErrorRetry = memo(({ onRetry }: { onRetry: () => void }) => {
  const { t } = useTranslation();
  return (
    <div className="mx-6 mb-3 flex justify-end">
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-muted px-2 py-1 text-[length:var(--font-chat-meta)] font-medium text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
      >
        <RotateCcwIcon className="size-3" />
        {t("chat.errors.retry")}
      </button>
    </div>
  );
});
TurnErrorRetry.displayName = "TurnErrorRetry";

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
  const isLoadingSession = useChatStore((s) => s.isLoadingSession);
  const activeTabId = useChatStore((s) => s.activeTabId);
  const chatSessionId = useChatStore((s) => s.sessionId);
  const sessionAgent = useChatStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    return tab?.sessionAgent ?? "build";
  });
  const planDraftFileReady = useChatStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    return !!tab?.planDraftFileReady;
  });
  const planDraftSummary = useChatStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    return tab?.planDraftSummary ?? null;
  });
  const planConfirmSuppressed = useChatStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    return !!tab?.planConfirmSuppressed;
  });
  const turnMeta = useChatStore((s) => s.turnMeta);
  const todoAnchorUserIndex = useChatStore(selectMessageTodoAnchorUserIndex);
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  // Generic wait copy while streaming has no assistant content yet.
  // Only `describing_images` is surfaced — other prepare phases stay collapsed
  // into this label so setup noise (sync / MCP / start model) does not flash.
  const preparePhase = useChatStore((s) => s.preparePhase);
  const streamingLabel =
    preparePhase === "describing_images"
      ? t("chat.prepare.describing_images")
      : preparePhase === "waiting_model"
        ? t("chat.prepare.waiting_model")
        : t("chat.prepare.planningNext");

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
  const pendingJumpTurnRef = useRef<number | null>(null);

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
      if (isHiddenBackgroundTaskInjectMessage(msg)) {
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

  // Per-turn previews for the right-edge TurnRail (user message text + meta).
  const turnPreviews = useMemo(
    () =>
      turns.map((turn, idx) => {
        const p = extractTurnUserPreview(turn.userMessage);
        return { text: p.text, hasAttachments: p.hasAttachments, meta: turnMeta[idx] };
      }),
    [turns, turnMeta],
  );

  // Whether the *current* turn (after the last user message) has assistant
  // content yet. Must NOT scan the full message list — turn 1 replies would
  // otherwise hide the wait indicator on turn 2+ immediately.
  const lastTurnForIndicator = turns[turns.length - 1];
  const hasCurrentTurnAssistantContent = useMemo(() => {
    const scanBlocks = (msg: ChatStreamMessage | null | undefined) => {
      if (!msg || msg.type !== "assistant") return false;
      return (msg.message?.content ?? []).some((b: ContentBlock) => {
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
      });
    };
    if (scanBlocks(streamingMessage)) return true;
    for (const r of lastTurnForIndicator?.responses ?? []) {
      if (scanBlocks(r.msg)) return true;
    }
    return false;
  }, [lastTurnForIndicator, streamingMessage]);

  // Show until THIS turn gets assistant content (then Activity fold takes over).
  const showStreamingIndicator = isStreaming && !hasCurrentTurnAssistantContent;

  const lastTurnUserKey = turns[turns.length - 1]?.userMessage
    ? committed.idxMap.get(turns[turns.length - 1].userMessage!) ?? turns.length
    : turns.length;

  // Text of the last user message — enables the error banner's retry action.
  const lastTurnRetryText = useMemo(() => {
    const msg = turns[turns.length - 1]?.userMessage;
    if (!msg) return "";
    return contentBlocks(msg.message?.content)
      .filter((b) => b.type === "text")
      .map((b) => (b as { text?: string }).text || "")
      .join("\n")
      .trim();
  }, [turns]);

  const lastTurnHasError = useMemo(() => {
    const responses = turns[turns.length - 1]?.responses ?? [];
    return responses.some((r) => r.msg?.turnError);
  }, [turns]);

  const handleRetryTurn = useCallback(() => {
    if (!lastTurnRetryText) return;
    void useChatStore.getState().sendPrompt(lastTurnRetryText);
  }, [lastTurnRetryText]);

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

  const jumpToTurn = useCallback(
    (turnIndex: number) => {
      const container = scrollRef.current;
      if (!container || !activeTabId) return;
      // User navigated away from the active tail - do not auto-scroll.
      shouldAutoScrollRef.current = false;
      setIsActiveTurnMode(false);
      if (turnIndex >= windowStartRef.current) {
        const sec = container.querySelector(`[data-chat-turn-index="${turnIndex}"]`);
        if (sec instanceof HTMLElement) {
          pinActiveTurnTop(container, sec, true);
          return;
        }
      }
      // Turn is outside the virtual window - expand it, then pin in layout effect.
      pendingJumpTurnRef.current = turnIndex;
      setTurnWindowStart(activeTabId, turnIndex);
      windowStartRef.current = turnIndex;
      setWindowStartState(turnIndex);
    },
    [activeTabId],
  );

  // After expanding the turn window for a jump, pin to the target turn section.
  useLayoutEffect(() => {
    const target = pendingJumpTurnRef.current;
    if (target == null) return;
    const container = scrollRef.current;
    if (!container) return;
    const sec = container.querySelector(`[data-chat-turn-index="${target}"]`);
    if (sec instanceof HTMLElement) {
      pinActiveTurnTop(container, sec, true);
      pendingJumpTurnRef.current = null;
    }
  }, [windowStart, turns.length]);

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
            const planReplyFallbackSummary =
              isLastTurn
              && isTurnComplete
              && sessionAgent === "plan"
              && planDraftFileReady
              && !planConfirmSuppressed
                ? planDraftSummary
                : null;
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
                <UserMessageHeader
                  msg={turn.userMessage}
                  turnIndex={turnIdx}
                  attachedBelow={
                    todoAnchorUserIndex != null
                    && committed.idxMap.get(turn.userMessage) === todoAnchorUserIndex
                      ? <MessageTodoDrawer />
                      : undefined
                  }
                />
              )}
              <div className="px-6 min-w-0 max-w-full overflow-hidden">
                {isLastTurn && showStreamingIndicator && (
                  <StreamingIndicator label={streamingLabel} />
                )}
                {(() => {
                  const nodes: ReactNode[] = [];
                  let assistantBatch: typeof turn.responses = [];

                  const flushAssistant = () => {
                    if (assistantBatch.length === 0) return;
                    nodes.push(
                      <TurnAssistantContent
                        key={`turn-asst-${turnIdx}`}
                        responses={assistantBatch}
                        toolResultMap={toolResultMap}
                        sessionId={chatSessionId ?? ""}
                        turnIndex={turnIdx}
                        streamingMessage={streamingMessage}
                        turnLive={isLastTurn && isStreaming}
                        planReplyFallbackSummary={planReplyFallbackSummary}
                      />,
                    );
                    assistantBatch = [];
                  };

                  for (const item of turn.responses) {
                    if (item.msg.type === "assistant") {
                      assistantBatch.push(item);
                      continue;
                    }
                    // Never split the assistant batch on result carriers — that
                    // would remount ActivityFold and leave thought/tools unable
                    // to share one collapsible row.
                    if (isHiddenToolResultCarrier(item.msg)) {
                      continue;
                    }
                    if (item.msg.type === "result" && !item.msg.is_error) {
                      continue;
                    }
                    flushAssistant();
                    const { msg, displayIdx } = item;
                    const idx = committed.idxMap.get(msg) ?? messages.length;
                    if (msg.type === "action-status") {
                      nodes.push(
                        <ActionStatusCard key={`action-${displayIdx}`} msg={msg} />,
                      );
                    } else if (msg.type === "plan-decision") {
                      nodes.push(
                        <PlanDecisionCard key={`plan-decision-${displayIdx}`} msg={msg} />,
                      );
                    } else if (msg.type === "result" && msg.is_error) {
                      nodes.push(<ResultMessage key={`result-${idx}`} msg={msg} />);
                    }
                  }
                  flushAssistant();
                  return nodes;
                })()}
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
          {lastTurnHasError && !isStreaming && lastTurnRetryText ? (
            <TurnErrorRetry onRetry={handleRetryTurn} />
          ) : null}
        </div>
      </div>

      <TurnRail
        previews={turnPreviews}
        windowStart={windowStart}
        scrollContainerRef={scrollRef}
        onJump={jumpToTurn}
      />

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
