import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BrainIcon,
  ChevronDownIcon,
  FilePenLineIcon,
  SearchIcon,
  TerminalIcon,
  type LucideIcon,
} from "lucide-react";
import type { ContentBlock } from "@/stores/chat-store";
import { cn } from "@/lib/utils";
import {
  captureViewportAnchor,
  restoreViewportAnchor,
  type ViewportAnchorCapture,
} from "@/lib/chat/preserve-viewport-anchor";
import {
  buildActivitySummaryLine,
  collectActivityBurstInventory,
  countActivityTools,
  formatActivityInventoryLine,
  inventoryHasDetail,
  isThinkingBlockStreaming,
  resolveActivityBurstPhase,
  resolveActivityDurationSec,
  sumThinkingDurations,
  type ActivityBurstInventory,
  type ActivityBurstPhase,
  type WorkedChildSegment,
} from "@/lib/chat/segment-assistant-blocks";
import { ToolWidget } from "./tool-widget-dispatcher";
import { ThinkingWidget } from "./thinking-widget";
import { DiffStatBadge } from "./shared";
import { PlanArtifactCard } from "../plan-artifact-card";
import { MarkdownRenderer } from "../markdown-renderer";
import { planPathFromToolUse } from "@/lib/chat/plan-artifact-ui";

const BURST_PHASE_ICON: Record<ActivityBurstPhase, LucideIcon> = {
  planning: BrainIcon,
  exploring: SearchIcon,
  editing: FilePenLineIcon,
  executing: TerminalIcon,
};

const EMPTY_INVENTORY: ActivityBurstInventory = {
  editedFiles: 0,
  exploredFiles: 0,
  searches: 0,
  commands: 0,
  lints: 0,
  added: 0,
  removed: 0,
};

export const ActivityFold = memo(function ActivityFold({
  blocks,
  blockIndices,
  toolResultMap,
  persistKey,
  sessionId,
  isStreamingSegment,
  messageThinkingComplete,
  suppressArtifactPaths,
  turnSettled = false,
  childrenSegments,
}: {
  blocks: ContentBlock[];
  blockIndices: number[];
  toolResultMap: Map<string, ContentBlock>;
  /** Stable id for nested thought/burst keys (expand state is not persisted). */
  persistKey?: string;
  sessionId?: string;
  isStreamingSegment: boolean;
  /** Turn-level: trailing prose or tools started (thinking-only bursts can freeze). */
  messageThinkingComplete?: boolean;
  suppressArtifactPaths?: readonly string[];
  /** Whole-turn Worked for (history / turn complete) — not burst Planning/Exploring. */
  turnSettled?: boolean;
  /**
   * Settled Worked-for body: keep live burst folds / Task / interim prose nested
   * inside instead of flattening tools into one list.
   */
  childrenSegments?: WorkedChildSegment[];
}) {
  const { t } = useTranslation();
  // Always start collapsed (live, settled, and session reopen). User toggles only.
  const [expanded, setExpanded] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const pendingAnchorRef = useRef<ViewportAnchorCapture | null>(null);
  const frozenElapsedRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const anchor = toggleRef.current;
    const captured = pendingAnchorRef.current;
    if (!anchor || !captured) return;
    restoreViewportAnchor(captured, anchor);
    pendingAnchorRef.current = null;
  }, [expanded]);

  useEffect(() => {
    if (!isStreamingSegment) return;
    frozenElapsedRef.current = null;
    const start = Date.now();
    const timer = setInterval(() => {
      setElapsed((Date.now() - start) / 1000);
    }, 200);
    return () => clearInterval(timer);
  }, [isStreamingSegment]);

  useEffect(() => {
    if (isStreamingSegment) return;
    if (frozenElapsedRef.current == null && elapsed > 0) {
      frozenElapsedRef.current = elapsed;
    }
  }, [isStreamingSegment, elapsed]);

  const toggleExpanded = useCallback(() => {
    if (toggleRef.current) {
      pendingAnchorRef.current = captureViewportAnchor(toggleRef.current);
    }
    setExpanded((v) => !v);
  }, []);

  const phaseLine = (key: "plannedFor" | "exploredFor" | "editedFor" | "executedFor") =>
    (duration: string, toolCount: number) =>
      toolCount > 0
        ? t(`chat.activity.${key}WithTools`, { duration, count: toolCount })
        : t(`chat.activity.${key}`, { duration });

  const labels = {
    thinking: t("chat.activity.thinking"),
    thoughtFor: (duration: string) => t("chat.activity.thoughtFor", { duration }),
    planning: t("chat.activity.planning"),
    exploring: t("chat.activity.exploring"),
    editing: t("chat.activity.editing"),
    executing: t("chat.activity.executing"),
    plannedFor: phaseLine("plannedFor"),
    exploredFor: phaseLine("exploredFor"),
    editedFor: phaseLine("editedFor"),
    executedFor: phaseLine("executedFor"),
    workedFor: (duration: string) => t("chat.activity.workedFor", { duration }),
  };

  const toolCount = countActivityTools(blocks);
  const thinkingDone =
    messageThinkingComplete
    ?? blocks.some((b) => b.type === "tool_use" || b.type === "text");
  const summaryStreaming =
    !turnSettled && isStreamingSegment && !(thinkingDone && toolCount === 0);

  useEffect(() => {
    if (!thinkingDone || toolCount > 0) return;
    if (frozenElapsedRef.current == null && elapsed > 0) {
      frozenElapsedRef.current = elapsed;
    }
  }, [thinkingDone, toolCount, elapsed]);

  const persistedDuration = resolveActivityDurationSec(blocks);
  const thinkingDuration = sumThinkingDurations(blocks);
  const authoritative = persistedDuration ?? (thinkingDuration > 0 ? thinkingDuration : undefined);

  // Done: always prefer sealed / OpenCode durations so the fold header matches
  // nested ThinkingWidget (live freeze often starts later → shorter).
  // Live: wall clock while the segment is still streaming.
  let displayElapsed = 0;
  if ((turnSettled || !summaryStreaming) && authoritative != null) {
    displayElapsed = authoritative;
  } else if (
    (!isStreamingSegment || (thinkingDone && toolCount === 0))
    && frozenElapsedRef.current != null
  ) {
    displayElapsed = frozenElapsedRef.current;
  } else if (elapsed > 0) {
    displayElapsed = elapsed;
  } else if (authoritative != null) {
    displayElapsed = authoritative;
  }

  // Inventory runs diffLines on edits — skip while streaming / on Worked-for chrome.
  const inventory = useMemo(() => {
    if (turnSettled || summaryStreaming) return EMPTY_INVENTORY;
    return collectActivityBurstInventory(blocks);
  }, [blocks, turnSettled, summaryStreaming]);
  const inventoryLabels = {
    editedFiles: (n: number) => t("chat.activity.invEditedFiles", { count: n }),
    exploredFiles: (n: number) => t("chat.activity.invExploredFiles", { count: n }),
    searches: (n: number) => t("chat.activity.invSearches", { count: n }),
    commands: (n: number) => t("chat.activity.invCommands", { count: n }),
    lints: t("chat.activity.invLints"),
  };
  const inventoryLine =
    !turnSettled
    && !summaryStreaming
    && inventoryHasDetail(inventory)
      ? formatActivityInventoryLine(inventory, inventoryLabels)
      : "";
  const summary = inventoryLine || buildActivitySummaryLine({
    blocks,
    isStreaming: summaryStreaming,
    elapsedSec: displayElapsed,
    turnSettled,
    labels,
  });
  // Burst folds may show +/-; whole-turn Worked for is duration-only text.
  const showDiffStats =
    !turnSettled
    && !summaryStreaming
    && (inventory.added > 0 || inventory.removed > 0);
  const burstPhase = turnSettled
    ? null
    : resolveActivityBurstPhase(blocks);
  const PhaseIcon = burstPhase ? BURST_PHASE_ICON[burstPhase] : null;
  // Align nested burst persist keys with live (`:aN`, not `:worked:aN`).
  const burstPersistBase = persistKey?.replace(/:worked$/, "") ?? persistKey;

  return (
    <div className="min-w-0 max-w-full">
      <button
        ref={toggleRef}
        type="button"
        className={cn(
          "group flex w-full max-w-full items-center gap-2 overflow-hidden py-1 text-left",
          "text-[length:var(--font-chat-message)] text-muted-foreground/65",
          "transition-colors hover:text-muted-foreground/80 cursor-pointer",
        )}
        onMouseDown={(e) => e.preventDefault()}
        onClick={toggleExpanded}
      >
        {PhaseIcon ? <PhaseIcon className="size-3.5 shrink-0 opacity-80" /> : null}
        <span
          className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden"
          key={summaryStreaming ? "live" : "done"}
        >
          <span className="min-w-0 truncate tabular-nums">{summary}</span>
          {showDiffStats ? (
            <DiffStatBadge
              added={inventory.added}
              removed={inventory.removed}
              className="shrink-0"
            />
          ) : null}
          <ChevronDownIcon
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground/70 transition-transform duration-150",
              expanded ? "rotate-0" : "-rotate-90",
            )}
          />
        </span>
      </button>
      {expanded ? (
        <div className="mb-0.5 space-y-0.5">
          {childrenSegments && childrenSegments.length > 0
            ? childrenSegments.map((child, childIndex) => {
                if (child.kind === "text") {
                  return (
                    <div
                      key={`worked-text-${child.blockIndex}`}
                      className="min-w-0 max-w-full overflow-hidden py-0.5 text-[length:var(--font-chat-message)]"
                    >
                      <MarkdownRenderer
                        content={child.block.text!}
                        isAnimating={false}
                        sessionId={sessionId}
                        muted
                      />
                    </div>
                  );
                }
                if (child.kind === "tool") {
                  const result = toolResultMap.get(child.block.id || "");
                  return (
                    <div key={`worked-tool-${child.block.id ?? child.blockIndex}`}>
                      <ToolWidget
                        toolUse={child.block}
                        toolResult={result}
                        suppressArtifactPaths={suppressArtifactPaths}
                      />
                    </div>
                  );
                }
                const foldKey = child.blockIndices[0] ?? childIndex;
                return (
                  <ActivityFold
                    key={`activity-${foldKey}`}
                    blocks={child.blocks}
                    blockIndices={child.blockIndices}
                    toolResultMap={toolResultMap}
                    sessionId={sessionId}
                    persistKey={
                      burstPersistBase
                        ? `${burstPersistBase}:a${foldKey}`
                        : undefined
                    }
                    isStreamingSegment={false}
                    messageThinkingComplete
                    suppressArtifactPaths={suppressArtifactPaths}
                    turnSettled={false}
                  />
                );
              })
            : blocks.map((block, i) => {
                const blockIndex = blockIndices[i] ?? i;
                if (block.type === "thinking" && block.thinking) {
                  return (
                    <ThinkingWidget
                      key={`think-${blockIndex}`}
                      thinking={block.thinking}
                      duration={block.duration}
                      sessionId={sessionId}
                      variant="nested"
                      persistKey={
                        persistKey ? `${persistKey}:t${blockIndex}` : undefined
                      }
                      isStreamingMsg={isThinkingBlockStreaming(
                        blocks,
                        i,
                        isStreamingSegment,
                      )}
                      isProgress={block._progress === true}
                    />
                  );
                }
                if (block.type === "tool_use") {
                  const result = toolResultMap.get(block.id || "");
                  const planPath = planPathFromToolUse(block);
                  const showPlanCard = !!planPath && !!result && !result.is_error;
                  return (
                    <div key={`tool-${block.id ?? blockIndex}`}>
                      <ToolWidget
                        toolUse={block}
                        toolResult={result}
                        suppressArtifactPaths={suppressArtifactPaths}
                        nestedInActivity
                      />
                      {showPlanCard ? <PlanArtifactCard pathFallback={planPath} /> : null}
                    </div>
                  );
                }
                return null;
              })}
        </div>
      ) : null}
    </div>
  );
});
