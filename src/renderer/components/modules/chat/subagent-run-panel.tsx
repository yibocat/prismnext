import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDownIcon, SquareIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { blurKeyboardFocus, cn } from "@/lib/utils";
import { useChatStore, type ContentBlock } from "@/stores/chat-store";
import { AssistantBlockList } from "./assistant-block-list";
import { buildToolResultMapFromBlocks, contentBlocks } from "./tools/tool-result-map";
import { param } from "./tools/shared";
import { ChatFloatPanel, CHAT_FLOAT_PANEL_HEIGHT } from "./chat-float-panel";
import { CHAT_CHROME_BUTTON_TEXT } from "./worktree-selector";
import { resolveTaskAgentMeta, taskActivityEmptyHint } from "./tools/task-widget";

/** Exit duration — keep in sync with `duration-150` classes; slightly past anim to avoid snap. */
export const SUBAGENT_PANEL_EXIT_MS = 180;

function promptFromConversation(
  conversation:
    | {
        turns?: Array<{ assistant?: { blocks?: ContentBlock[] } }>;
        live?: { assistant?: { blocks?: ContentBlock[] } } | null;
      }
    | undefined,
  taskToolUseId: string,
  fallback: string,
): string {
  if (!conversation) return fallback.trim();
  const turns = [conversation.live, ...[...(conversation.turns ?? [])].reverse()];
  for (const turn of turns) {
    if (!turn) continue;
    for (const block of turn.assistant?.blocks ?? []) {
      if (block.type !== "tool_use" || block.id !== taskToolUseId) continue;
      const fromInput =
        param(block.input, "prompt")
        || param(block.input, "description")
        || "";
      if (fromInput.trim()) return fromInput.trim();
    }
  }
  return fallback.trim();
}

/** Prefer live tool_use.input.prompt (no staging preface) over tracked run.prompt. */
function resolveDelegationPrompt(
  taskToolUseId: string,
  messages: Array<{ message?: { content?: ContentBlock[] | string } } | null | undefined>,
  fallback: string,
): string {
  for (const msg of messages) {
    if (!msg) continue;
    for (const block of contentBlocks(msg.message?.content)) {
      if (block.type !== "tool_use" || block.id !== taskToolUseId) continue;
      const fromInput =
        param(block.input, "prompt")
        || param(block.input, "description")
        || "";
      if (fromInput.trim()) return fromInput.trim();
    }
  }
  return fallback.trim();
}

/** User-bubble matching ChatMessages UserHeader chrome (sticky at top of scroll). */
const DelegationUserBubble = memo(function DelegationUserBubble({
  text,
}: {
  text: string;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const long = text.length > 140;
  if (!text) return null;
  return (
    <div className="sticky top-0 z-20 mx-3 mb-2">
      <div
        className={cn(
          "rounded-lg border border-border bg-card px-4 py-2 shadow-[0_0_6px_rgba(0,0,0,0.06)]",
          long && !expanded && "cursor-pointer transition-colors hover:bg-accent",
        )}
        onClick={long && !expanded ? () => setExpanded(true) : undefined}
      >
        <span
          className={cn(
            "text-[length:var(--font-chat-message)] text-foreground",
            long && !expanded ? "line-clamp-2" : "whitespace-pre-wrap break-words",
          )}
        >
          {text}
        </span>
        {long && !expanded ? (
          <div className="mt-0.5 text-[length:var(--font-chat-meta)] text-muted-foreground">
            {t("chat.subagent.expandPrompt")}
          </div>
        ) : null}
        {long && expanded ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(false);
            }}
            className={cn(
              "mt-1 -mx-4 -mb-2 w-[calc(100%+2rem)] rounded-b-lg px-4 pb-2 pt-1",
              "text-left text-[length:var(--font-chat-meta)] text-muted-foreground",
              "cursor-pointer transition-colors hover:bg-accent hover:text-foreground",
            )}
          >
            {t("chat.subagent.collapsePrompt")}
          </button>
        ) : null}
      </div>
    </div>
  );
});

const SubagentStreamingDots = memo(function SubagentStreamingDots({
  label,
}: {
  label: string;
}) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <div className="flex items-center gap-1">
        <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:0ms]" />
        <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:150ms]" />
        <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:300ms]" />
      </div>
      <span className="text-[length:var(--font-chat-meta)] text-muted-foreground">
        {label}
      </span>
    </div>
  );
});

/**
 * Task / subagent run as a mini chat session: same float shell as AiBar,
 * delegation prompt as a user bubble, expert stream as assistant turn.
 */
export const SubAgentRunPanel = memo(function SubAgentRunPanel({
  taskToolUseId,
  className,
  fillHeight = false,
  onClose,
}: {
  taskToolUseId: string;
  className?: string;
  fillHeight?: boolean;
  /** Override store close (hosts use this for exit animation). */
  onClose?: () => void;
}) {
  const { t } = useTranslation();
  const parentSessionId = useChatStore(
    (s) => s.tabs.find((t) => t.id === s.activeTabId)?.sessionId ?? "",
  );
  const tab = useChatStore((s) => s.tabs.find((t) => t.id === s.activeTabId));
  const run = tab?.subAgentRuns?.[taskToolUseId] ?? null;
  const closePanelStore = useChatStore((s) => s.closeSubAgentPanel);
  const closePanel = onClose ?? closePanelStore;
  const cancelSubAgentRun = useChatStore((s) => s.cancelSubAgentRun);

  const scrollRef = useRef<HTMLDivElement>(null);
  /** Live runs follow the tail; finished opens start at the top. */
  const stickToBottomRef = useRef(false);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const expertId = (run?.expertId || "expert").replace(/^@/, "");
  const meta = resolveTaskAgentMeta(expertId);
  const isStopping = run?.status === "stopping";
  const isRunning = run?.status === "running" || isStopping;
  const isError = run?.status === "error";
  const blocks = run?.blocks ?? [];
  const toolResultMap = useMemo(
    () => buildToolResultMapFromBlocks(blocks, { isStreaming: isRunning && !isStopping }),
    [blocks, isRunning, isStopping],
  );

  const delegationPrompt = useMemo(
    () =>
      resolveDelegationPrompt(
        taskToolUseId,
        [...(tab?.messages ?? []), tab?.streamingMessage],
        run?.prompt ?? "",
      ) || promptFromConversation(tab?.conversation, taskToolUseId, run?.prompt ?? ""),
    [taskToolUseId, tab?.messages, tab?.streamingMessage, tab?.conversation, run?.prompt],
  );

  const hasAssistantContent = blocks.some((b) => {
    if (b.type === "text" && b.text?.trim()) return true;
    if (b.type === "thinking" && b.thinking?.trim() && !(b as { _progress?: boolean })._progress) {
      return true;
    }
    if (b.type === "tool_use") return true;
    return false;
  });

  const activityHintKey = taskActivityEmptyHint(run);
  const streamingLabel = isStopping
    ? t("chat.subagent.stopping")
    : activityHintKey
      ? t(`chat.subagent.${activityHintKey}`)
      : t("chat.subagent.streaming");
  const emptyLabel = activityHintKey
    ? t(`chat.subagent.${activityHintKey}`)
    : t("chat.subagent.empty");

  const title = `Task @${meta.label}`;

  const updateStickState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distance < 80;
    stickToBottomRef.current = nearBottom;
    setShowScrollButton(!nearBottom && el.scrollHeight > el.clientHeight + 24);
  }, []);

  const scrollToBottom = useCallback((smooth = true) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    stickToBottomRef.current = true;
    setShowScrollButton(false);
  }, []);

  // Opening a finished Task → top; opening a live Task → stick to bottom.
  useLayoutEffect(() => {
    const status = useChatStore
      .getState()
      .tabs.find((t) => t.id === useChatStore.getState().activeTabId)
      ?.subAgentRuns?.[taskToolUseId]?.status;
    const live = status === "running";
    stickToBottomRef.current = live;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = live ? el.scrollHeight : 0;
    updateStickState();
  }, [taskToolUseId, updateStickState]);

  // Follow live stream when the user is already at the bottom (main chat UX).
  useLayoutEffect(() => {
    if (!isRunning || isStopping) return;
    if (!stickToBottomRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [blocks, isRunning, isStopping]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => updateStickState();
    el.addEventListener("scroll", onScroll, { passive: true });
    updateStickState();
    return () => el.removeEventListener("scroll", onScroll);
  }, [updateStickState, taskToolUseId]);

  return (
    <ChatFloatPanel
      panelAttr="data-subagent-run-panel"
      title={title}
      fillHeight={fillHeight}
      className={className}
      onClose={closePanel}
      closeLabel={t("chat.subagent.closePanel")}
      headerEnd={
        run?.status === "running" ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className={cn("text-muted-foreground", CHAT_CHROME_BUTTON_TEXT)}
            onClick={(e) => {
              e.stopPropagation();
              void cancelSubAgentRun(taskToolUseId);
            }}
          >
            {t("chat.subagent.stop")}
          </Button>
        ) : null
      }
    >
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          <DelegationUserBubble text={delegationPrompt} />
          <div className="px-6 min-w-0 max-w-full overflow-hidden pb-3">
            {isStopping ? (
              <SubagentStreamingDots label={t("chat.subagent.stopping")} />
            ) : null}
            {isRunning && !isStopping && !hasAssistantContent ? (
              <SubagentStreamingDots label={streamingLabel} />
            ) : null}
            {run?.status === "running" && run?.error ? (
              <div className="mt-2 flex items-center gap-1.5 text-[length:var(--font-chat-meta)] text-muted-foreground">
                <SquareIcon className="size-3 shrink-0 fill-current" />
                <span className="whitespace-pre-wrap break-words">{run.error}</span>
              </div>
            ) : null}

            {hasAssistantContent ? (
              <div className="group w-full min-w-0 max-w-full overflow-hidden">
                <AssistantBlockList
                  blocks={blocks}
                  toolResultMap={toolResultMap}
                  msgIndex={0}
                  isStreamingMsg={isRunning && !isStopping}
                  sessionId={parentSessionId}
                  foldActivity
                  turnKey={`${parentSessionId}:sub:${taskToolUseId}`}
                />
              </div>
            ) : null}

            {isError && run?.error ? (
              <div className="mt-2 flex items-center gap-1.5 text-[length:var(--font-chat-meta)] text-muted-foreground">
                <SquareIcon className="size-3 shrink-0 fill-current" />
                <span className="whitespace-pre-wrap break-words">{run.error}</span>
              </div>
            ) : null}

            {!isRunning && !hasAssistantContent && !run?.error ? (
              <p className="text-[length:var(--font-chat-meta)] text-muted-foreground">
                {emptyLabel}
              </p>
            ) : null}
          </div>
        </div>

        {showScrollButton ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-end px-3">
            <button
              type="button"
              onClick={() => scrollToBottom(true)}
              className="pointer-events-auto flex size-8 items-center justify-center rounded-full border border-border bg-background shadow-md text-muted-foreground hover:text-foreground transition-all hover:shadow-lg"
              aria-label={t("chat.subagent.scrollToBottom", { defaultValue: "Scroll to bottom" })}
            >
              <ArrowDownIcon className="size-4" />
            </button>
          </div>
        ) : null}
      </div>
    </ChatFloatPanel>
  );
});

/** Host for panel chat: same width/height language as AiBar float panel. */
export const SubAgentRunPanelHost = memo(function SubAgentRunPanelHost() {
  const toolUseId = useChatStore(
    (s) => s.tabs.find((t) => t.id === s.activeTabId)?.openSubAgentPanelToolUseId ?? null,
  );
  const closeSubAgentPanel = useChatStore((s) => s.closeSubAgentPanel);
  const [displayedId, setDisplayedId] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  closingRef.current = closing;
  const hostRef = useRef<HTMLDivElement>(null);

  // Only react to store id changes — do NOT reset `closing` when it becomes true
  // (that was cancelling the exit animation and causing close jitter).
  useEffect(() => {
    if (toolUseId) {
      setDisplayedId(toolUseId);
      setClosing(false);
      return;
    }
    if (!closingRef.current) setDisplayedId(null);
  }, [toolUseId]);

  const closeAnimated = useCallback(() => {
    if (closingRef.current || !displayedId) return;
    setClosing(true);
    // Clear store id immediately so the panel-chat message scrim can fade
    // in sync with this exit; keep `displayedId` until the anim finishes.
    closeSubAgentPanel();
    blurKeyboardFocus();
    window.setTimeout(() => {
      setDisplayedId(null);
      setClosing(false);
    }, SUBAGENT_PANEL_EXIT_MS);
  }, [closeSubAgentPanel, displayedId]);

  // Click outside → close (panel chat; AiBar has its own stack listener).
  useEffect(() => {
    if (!displayedId || closing) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (hostRef.current?.contains(target)) return;
      if (target.closest("[data-subagent-run-panel]")) return;
      if (
        target.closest("[data-radix-menu-content]")
        || target.closest("[data-radix-popper-content-wrapper]")
      ) {
        return;
      }
      closeAnimated();
    };
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, [displayedId, closing, closeAnimated]);

  // Esc → close (same as AiBar float stack).
  useEffect(() => {
    if (!displayedId || closing) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const target = e.target as HTMLElement | null;
      if (
        target?.closest("[data-radix-menu-content]")
        || target?.closest("[data-radix-popper-content-wrapper]")
      ) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      closeAnimated();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [displayedId, closing, closeAnimated]);

  if (!displayedId) return null;
  return (
    <div
      ref={hostRef}
      className={cn(
        "mb-2 w-full min-w-0 pointer-events-auto",
        // Prefer opacity/transform transitions over animate-in↔out class swaps
        // (swapping classes mid-flight was a source of flicker).
        "transition-[opacity,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]",
        closing
          ? "opacity-0 translate-y-2"
          : "opacity-100 translate-y-0 animate-in fade-in slide-in-from-bottom-2 duration-200",
      )}
      style={{ height: CHAT_FLOAT_PANEL_HEIGHT }}
    >
      <SubAgentRunPanel
        taskToolUseId={displayedId}
        fillHeight
        onClose={closeAnimated}
      />
    </div>
  );
});
