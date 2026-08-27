import { useEffect, useLayoutEffect, useRef, useState, memo, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/chat-store";
import { emptyConversation } from "@shared/agent/conversation";
import {
  collectConversationAssistantBlocks,
  conversationCompactedCount,
  conversationHasContent,
  conversationVisibleTurns,
} from "@/lib/chat/conversation-view";
export { AssistantBlockList } from "./assistant-block-list";
import { TurnAssistantContent } from "./turn-assistant-content";
import "./tools/task-widget-register";
import { TurnFooter, extractTurnCopyTextFromBlocks } from "./turn-footer";
import {
  captureSentinelScrollAnchor,
  isFollowingStreamTurn,
  pinActiveTurnTop,
  pinOrFollowActiveTurn,
  restoreSentinelScrollAnchor,
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
import { extractTurnUserPreviewFromBlocks } from "@/lib/chat/chat-turns";
import { TurnRail } from "./turn-rail";
import { buildToolResultMapFromBlocks } from "./tools/tool-result-map";
import { MessageTodoDrawer } from "./todo-plan-bar";
import { UserMessageHeader } from "./user-message-header";
import { isTodoPlanDismissed } from "@/lib/chat/composer-pending-tools";
import { useDocumentStore } from "@/stores/document-store";
import { useLiteratureStore } from "@/stores/literature-store";
import { useRemoteStore } from "@/stores/remote-store";
import { parseRemoteAbs } from "@shared/remote";
import { connectPrepareGate } from "@/lib/remote/display";
import {
  AlertCircleIcon,
  ArrowDownIcon,
  RotateCcwIcon,
  Loader2Icon,
} from "lucide-react";
import { Hint } from "@/components/ui/hint";

// ─── Streaming Indicator ───

// Parent turn column already applies px-6 — keep this flush with ThinkingWidget.
const StreamingIndicator = memo(({
  label,
  onOpenConnect,
}: {
  label: string;
  onOpenConnect?: () => void;
}) => {
  const body = (
    <>
      <div className="flex items-center gap-1">
        <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:0ms]" />
        <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:150ms]" />
        <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:300ms]" />
      </div>
      <span className="text-muted-foreground text-[length:var(--font-chat-meta)]">
        {label}
      </span>
    </>
  );
  if (onOpenConnect) {
    return (
      <button
        type="button"
        className="mb-2 flex items-center gap-2 rounded-sm text-left hover:text-foreground"
        onClick={onOpenConnect}
      >
        {body}
      </button>
    );
  }
  return <div className="mb-2 flex items-center gap-2">{body}</div>;
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

// ─── Chat Messages ───

const chatLiteratureWarmupRoots = new Set<string>();

export const ChatMessages = memo(function ChatMessages() {
  const { t } = useTranslation();
  const conversation = useChatStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    return tab?.conversation ?? emptyConversation({ conversationId: s.activeTabId });
  });
  const isStreaming = conversation.live !== null;
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
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const remoteByProfileId = useRemoteStore((s) => s.byProfileId);
  const remoteLogs = useRemoteStore((s) => s.logs);
  // Wait copy while streaming has no assistant content yet — surface each
  // prepare phase so first-send cold start (sync / agent / session) is not a hang.
  const preparePhase = useChatStore((s) => s.preparePhase);
  const connectAlias = preparePhase === "connecting_remote"
    ? parseRemoteAbs(projectRoot ?? "")?.profileId
    : undefined;
  const streamingLabel = (() => {
    if (preparePhase === "connecting_remote") {
      const gate = connectPrepareGate(projectRoot, remoteByProfileId, remoteLogs);
      return gate
        ? t("chat.prepare.connecting_remote_step", { step: t(`remote.gate.${gate}`) })
        : t("chat.prepare.connecting_remote");
    }
    switch (preparePhase) {
      case "describing_images":
        return t("chat.prepare.describing_images");
      case "syncing_project":
        return t("chat.prepare.syncing_project");
      case "starting_agent":
        return t("chat.prepare.starting_agent");
      case "creating_session":
        return t("chat.prepare.creating_session");
      case "connecting_mcp":
        return t("chat.prepare.connecting_mcp");
      case "starting_model":
        return t("chat.prepare.starting_model");
      case "waiting_model":
        return t("chat.prepare.waiting_model");
      case "stalled":
        return t("chat.prepare.stalled");
      default:
        return t("chat.prepare.planningNext");
    }
  })();

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
  const lastTurnIndexRef = useRef<number | null>(null);
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
  const [expandCompacted, setExpandCompacted] = useState(false);
  const pendingJumpTurnRef = useRef<number | null>(null);

  useEffect(() => {
    setExpandCompacted(false);
  }, [activeTabId, conversation.compacted?.throughTurnIndex]);

  const followStreamTail = useCallback((smooth = false) => {
    const container = scrollRef.current;
    const turn = lastTurnRef.current;
    if (!container || !turn) return;
    pinOrFollowActiveTurn(container, turn, smooth);
    setShowScrollButton(false);
  }, []);

  const compactedCount = conversationCompactedCount(conversation);
  const turns = useMemo(
    () => conversationVisibleTurns(conversation, { expandCompacted }),
    [conversation, expandCompacted],
  );

  const toolResultMap = useMemo(
    () => buildToolResultMapFromBlocks(
      collectConversationAssistantBlocks(conversation),
      { isStreaming },
    ),
    [conversation, isStreaming],
  );

  const todoAnchorTurnIndex = useMemo(() => {
    for (let i = turns.length - 1; i >= 0; i--) {
      const block = turns[i]!.assistantBlocks.find((b) => (
        b.type === "tool_use" && (b.name || "").toLowerCase() === "todowrite" && b.id
      ));
      if (block?.id && !isTodoPlanDismissed(block.id)) return turns[i]!.turnIndex;
    }
    return null;
  }, [turns]);

  const usageHint = useMemo(() => {
    const u = conversation.usage;
    if (!u?.inputTokens && !u?.outputTokens) return null;
    const input = (u.inputTokens ?? 0) >= 1000
      ? `${((u.inputTokens ?? 0) / 1000).toFixed(1)}k`
      : `${u.inputTokens ?? 0}`;
    const output = (u.outputTokens ?? 0) >= 1000
      ? `${((u.outputTokens ?? 0) / 1000).toFixed(1)}k`
      : `${u.outputTokens ?? 0}`;
    return `↑${input} ↓${output}`;
  }, [conversation.usage]);

  const turnPreviews = useMemo(
    () =>
      turns.map((turn, idx) => {
        const p = extractTurnUserPreviewFromBlocks(turn.userBlocks);
        return { text: p.text, hasAttachments: p.hasAttachments, meta: turn.meta ?? turnMeta[idx] };
      }),
    [turns, turnMeta],
  );

  const lastTurnForIndicator = turns[turns.length - 1];
  const hasCurrentTurnAssistantContent = useMemo(() => {
    return (lastTurnForIndicator?.assistantBlocks ?? []).some((b) => {
      if (b.type === "text" && b.text?.trim()) return true;
      if (b.type === "thinking" && b.thinking?.trim() && !b._progress) return true;
      if (b.type === "tool_use") return true;
      return false;
    });
  }, [lastTurnForIndicator]);

  const showStreamingIndicator = isStreaming && !hasCurrentTurnAssistantContent;

  const lastTurnUserKey = lastTurnForIndicator?.turnId ?? "";

  const lastTurnRetryText = useMemo(() => {
    return (lastTurnForIndicator?.userBlocks ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text || "")
      .join("\n")
      .trim();
  }, [lastTurnForIndicator]);

  const lastTurnHasError = lastTurnForIndicator?.status === "failed"
    || (lastTurnForIndicator?.assistantBlocks ?? []).some((b) => b.is_error);

  const handleRetryTurn = useCallback(() => {
    if (!lastTurnRetryText) return;
    void useChatStore.getState().sendPrompt(lastTurnRetryText);
  }, [lastTurnRetryText]);

  const lastTurnUserMsg = lastTurnForIndicator?.turnId ?? null;
  const prevLastUserMsgRef = useRef<string | null>(null);

  const [windowStart, setWindowStartState] = useState(0);

  useLayoutEffect(() => {
    if (!activeTabId || isLoadingSession) return;
    const start = expandCompacted
      ? 0
      : resolveWindowStart(activeTabId, turns.length);
    if (expandCompacted) setTurnWindowStart(activeTabId, 0);
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
  }, [activeTabId, turns.length, isLoadingSession, expandCompacted]);

  const attachTurnSectionRef = useCallback(
    (turnIndex: number, isLastTurn: boolean) => (el: HTMLElement | null) => {
      if (el && isLastTurn) {
        lastTurnRef.current = el;
        lastTurnIndexRef.current = turnIndex;
        return;
      }
      // A previous last-turn's ref cleanup must not wipe the new last turn.
      if (!el && lastTurnIndexRef.current === turnIndex) {
        lastTurnRef.current = null;
        lastTurnIndexRef.current = null;
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
      if (isStreamingRef.current && e.deltaY < 0 && shouldAutoScrollRef.current) {
        shouldAutoScrollRef.current = false;
        setIsActiveTurnMode(false);
        setShowScrollButton(true);
      }
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
      followStreamTail(smooth);
      requestAnimationFrame(() => {
        shouldAutoScrollRef.current = true;
        applySnapIfNeeded();
      });
    },
    [followStreamTail, applySnapIfNeeded],
  );

  /** Track pane height so the last turn can fill the viewport and pin to the top. */
  const syncViewportHeight = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return 0;
    const next = el.clientHeight;
    setViewportHeight((prev) => (prev === next ? prev : next));
    return next;
  }, []);

  const showTranscript = !isLoadingSession && (conversationHasContent(conversation) || isStreaming);

  useLayoutEffect(() => {
    if (!showTranscript) return;
    const el = scrollRef.current;
    if (!el) return;
    syncViewportHeight();
    const ro = new ResizeObserver(() => {
      syncViewportHeight();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [syncViewportHeight, showTranscript, activeTabId]);

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
        following = isFollowingStreamTurn(el, turn);
      }

      shouldAutoScrollRef.current = following;
      setIsActiveTurnMode(following);
      setShowScrollButton(!following && el.scrollHeight > el.clientHeight + 100);
    };
    handleScroll();
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [isStreaming, showTranscript]);

  useLayoutEffect(() => {
    const msg = lastTurnUserMsg;
    const isNewUserMsg = msg !== null && msg !== prevLastUserMsgRef.current;
    prevLastUserMsgRef.current = msg;

    if (isNewUserMsg) {
      shouldAutoScrollRef.current = true;
      setIsActiveTurnMode(true);
      const container = scrollRef.current;
      const turn = lastTurnRef.current;
      if (container && turn) pinActiveTurnTop(container, turn, false);
      applySnapIfNeeded();
    }
  }, [lastTurnUserMsg, lastTurnUserKey, applySnapIfNeeded]);

  useLayoutEffect(() => {
    if (isLoadingSession || turns.length === 0) return;
    requestAnimationFrame(() => {
      if (shouldAutoScrollRef.current) followStreamTail(false);
    });
  }, [isLoadingSession, turns.length, activeTabId, followStreamTail]);

  useLayoutEffect(() => {
    const wasStreaming = wasStreamingRef.current;
    wasStreamingRef.current = isStreaming;
    if (wasStreaming && !isStreaming && shouldAutoScrollRef.current) {
      requestAnimationFrame(() => {
        followStreamTail(false);
        applySnapIfNeeded();
      });
    }
  }, [isStreaming, followStreamTail, applySnapIfNeeded]);

  useLayoutEffect(() => {
    if (!shouldAutoScrollRef.current) return;
    if (viewportHeight <= 0) return;
    followStreamTail(false);
  }, [viewportHeight, lastTurnUserKey, followStreamTail]);

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
  }, [turns, isStreaming, followStreamTail]);

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

  if (!conversationHasContent(conversation) && !isStreaming) {
    return <div className="flex flex-1 min-h-0" aria-hidden />;
  }

  // ── Render ──

  return (
    <div className="relative flex-1 min-h-0 min-w-0 overflow-hidden">
      <div
        ref={scrollRef}
        data-chat-scroll
        className="absolute inset-0 z-0 overflow-y-auto overflow-x-hidden"
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
          {compactedCount > 0 && (
            <div className="flex justify-center px-6 py-2">
              <button
                type="button"
                onClick={() => setExpandCompacted((open) => !open)}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1.5 text-[length:var(--font-chat-meta)] text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                <span>{t("chat.messages.compactedBanner", { count: compactedCount })}</span>
                <span className="text-foreground">
                  {expandCompacted
                    ? t("chat.messages.compactedHide")
                    : t("chat.messages.compactedShow")}
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
            const turnStamp = turn.meta ?? turnMeta[turnIdx];

            return (
            <section
              key={turn.turnId || `turn-${turnIdx}`}
              data-chat-turn-index={turnIdx}
              ref={attachTurnSectionRef(turnIdx, isLastTurn)}
              style={isLastTurn && viewportHeight > 0 ? { minHeight: viewportHeight } : undefined}
            >
              {turn.userBlocks.length > 0 && (
                <UserMessageHeader
                  blocks={turn.userBlocks}
                  turnIndex={turnIdx}
                  attachedBelow={
                    todoAnchorTurnIndex != null && turn.turnIndex === todoAnchorTurnIndex
                      ? <MessageTodoDrawer />
                      : undefined
                  }
                />
              )}
              <div className="px-6 min-w-0 max-w-full overflow-hidden">
                {isLastTurn && showStreamingIndicator && (
                  <StreamingIndicator
                    label={streamingLabel}
                    onOpenConnect={
                      connectAlias
                        ? () => useRemoteStore.getState().openConnectDialog(connectAlias, {
                          autoCloseOnReady: true,
                        })
                        : undefined
                    }
                  />
                )}
                <TurnAssistantContent
                  blocks={turn.assistantBlocks}
                  toolResultMap={toolResultMap}
                  sessionId={chatSessionId ?? ""}
                  turnIndex={turnIdx}
                  turnId={turn.turnId}
                  isStreamingMsg={turn.live}
                  planReplyFallbackSummary={planReplyFallbackSummary}
                  stopped={turn.status === "cancelled"}
                />
                <TurnFooter
                  turnIndex={turnIdx}
                  copyText={extractTurnCopyTextFromBlocks(turn.assistantBlocks)}
                  isComplete={isTurnComplete}
                  completedAt={turnStamp?.completedAt}
                  modelLabel={turnStamp?.modelLabel}
                  detailHint={turnStamp?.summary ?? (isLastTurn ? usageHint : null) ?? undefined}
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
