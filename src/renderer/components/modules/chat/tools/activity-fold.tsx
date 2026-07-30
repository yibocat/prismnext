import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BrainIcon, ChevronDownIcon } from "lucide-react";
import type { ContentBlock } from "@/stores/chat-store";
import { cn } from "@/lib/utils";
import {
  captureViewportAnchor,
  restoreViewportAnchor,
  type ViewportAnchorCapture,
} from "@/lib/chat/preserve-viewport-anchor";
import {
  buildActivitySummaryLine,
  countActivityTools,
  isBridgeTextBlockExported as isBridgeTextBlock,
  sumThinkingDurations,
} from "@/lib/chat/segment-assistant-blocks";
import { ToolWidget } from "./tool-widget-dispatcher";
import { ThinkingWidget } from "./thinking-widget";
import { PlanArtifactCard } from "../plan-artifact-card";
import { planPathFromToolUse } from "@/lib/chat/plan-artifact-ui";

function getActivityFoldState(key: string): boolean {
  return localStorage.getItem(`activity:${key}`) === "open";
}

function saveActivityFoldState(key: string, open: boolean): void {
  if (open) localStorage.setItem(`activity:${key}`, "open");
  else localStorage.removeItem(`activity:${key}`);
}

export const ActivityFold = memo(function ActivityFold({
  blocks,
  blockIndices,
  toolResultMap,
  persistKey,
  sessionId,
  isStreamingSegment,
  messageThinkingComplete,
  suppressArtifactPaths,
}: {
  blocks: ContentBlock[];
  blockIndices: number[];
  toolResultMap: Map<string, ContentBlock>;
  persistKey?: string;
  sessionId?: string;
  isStreamingSegment: boolean;
  /** Turn-level: trailing prose or tools started (unified fold excludes tail text). */
  messageThinkingComplete?: boolean;
  suppressArtifactPaths?: readonly string[];
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(
    () => (persistKey ? getActivityFoldState(persistKey) : false),
  );
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
    if (persistKey) saveActivityFoldState(persistKey, expanded);
  }, [persistKey, expanded]);

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

  const labels = {
    working: t("chat.activity.working"),
    thinking: t("chat.activity.thinking"),
    thoughtFor: (duration: string) => t("chat.activity.thoughtFor", { duration }),
    workedFor: (duration: string, toolCount: number) =>
      toolCount > 0
        ? t("chat.activity.workedForWithTools", { duration, count: toolCount })
        : t("chat.activity.workedFor", { duration }),
  };

  const toolCount = countActivityTools(blocks);
  const thinkingDone =
    messageThinkingComplete
    ?? blocks.some(
      (b) => b.type === "tool_use" || (b.type === "text" && !isBridgeTextBlock(b)),
    );
  const summaryStreaming =
    isStreamingSegment && !(thinkingDone && toolCount === 0);

  useEffect(() => {
    if (!thinkingDone || toolCount > 0) return;
    if (frozenElapsedRef.current == null && elapsed > 0) {
      frozenElapsedRef.current = elapsed;
    }
  }, [thinkingDone, toolCount, elapsed]);

  const thinkingDuration = sumThinkingDurations(blocks);
  const displayElapsed =
    ((!isStreamingSegment || (thinkingDone && toolCount === 0)) && frozenElapsedRef.current != null)
      ? frozenElapsedRef.current
      : elapsed > 0
        ? elapsed
        : thinkingDuration;

  const summary = buildActivitySummaryLine({
    blocks: blocks.filter((b) => !isBridgeTextBlock(b)),
    isStreaming: summaryStreaming,
    elapsedSec: displayElapsed,
    labels,
  });

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
        <BrainIcon className="size-3.5 shrink-0 opacity-80" />
        <span
          className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden"
          key={summaryStreaming ? "live" : "done"}
        >
          <span className="min-w-0 truncate tabular-nums">{summary}</span>
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
          {blocks.map((block, i) => {
            const blockIndex = blockIndices[i] ?? i;
            if (isBridgeTextBlock(block) && block.text) {
              return (
                <p
                  key={`bridge-${blockIndex}`}
                  className="py-0.5 text-[length:var(--font-chat-meta)] text-muted-foreground/75 leading-relaxed"
                >
                  {block.text}
                </p>
              );
            }
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
                  isStreamingMsg={isStreamingSegment && !thinkingDone}
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
