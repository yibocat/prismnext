import { memo, useMemo } from "react";
import type { ContentBlock } from "@/stores/chat-store";
import { MarkdownRenderer } from "./markdown-renderer";
import { PlanArtifactCard } from "./plan-artifact-card";
import { ToolWidget } from "./tools/tool-widget-dispatcher";
import { ThinkingWidget } from "./tools/thinking-widget";
import { ActivityFold } from "./tools/activity-fold";
import { buildArtifactFallbackMarkdown } from "@/lib/markdown/chat-artifact";
import {
  resolveMissingArtifactPathsForReply,
  resolveSuppressArtifactPathsForToolCards,
} from "@/lib/chat/experiment-run-figures";
import { buildInteractionReplyFallbackMarkdown } from "@/lib/chat/interaction-fence-fallback";
import { buildPlanReplyFallbackMarkdown } from "@/lib/chat/plan-reply-fallback";
import { InteractionFenceDedupeProvider } from "@/lib/interaction/interaction-fence-dedupe";
import { planPathFromToolUse } from "@/lib/chat/plan-artifact-ui";
import { segmentAssistantBlocks } from "@/lib/chat/segment-assistant-blocks";

/** Shared assistant block renderer for main chat and Task expert activity. */
export const AssistantBlockList = memo(function AssistantBlockList({
  blocks,
  toolResultMap,
  msgIndex,
  isStreamingMsg,
  sessionId,
  foldActivity = true,
  turnKey,
  planReplyFallbackSummary,
}: {
  blocks: ContentBlock[];
  toolResultMap: Map<string, ContentBlock>;
  msgIndex: number;
  isStreamingMsg?: boolean;
  sessionId: string;
  foldActivity?: boolean;
  /** Stable key for activity-fold persistence (turn-level). */
  turnKey?: string;
  /** Frontmatter description when Plan draft awaits Approve & Build but model omitted chat prose. */
  planReplyFallbackSummary?: string | null;
}) {
  const thinkingComplete = blocks.some(
    (b) => b.type === "text" || b.type === "tool_use",
  );

  const missingArtifacts = isStreamingMsg
    ? []
    : resolveMissingArtifactPathsForReply(blocks, toolResultMap);
  const fallbackReply = buildArtifactFallbackMarkdown(missingArtifacts);
  const interactionFallbackReply = isStreamingMsg
    ? ""
    : buildInteractionReplyFallbackMarkdown(blocks, toolResultMap);
  const planFallbackReply =
    isStreamingMsg || !planReplyFallbackSummary
      ? ""
      : buildPlanReplyFallbackMarkdown(blocks, planReplyFallbackSummary);
  const suppressArtifactPaths = isStreamingMsg
    ? []
    : resolveSuppressArtifactPathsForToolCards(
        blocks,
        toolResultMap,
        missingArtifacts,
      );

  const segments = useMemo(
    () =>
      foldActivity
        ? segmentAssistantBlocks(blocks, { unifiedActivity: true })
        : null,
    [blocks, foldActivity],
  );

  const lastActivitySegmentIndex = useMemo(() => {
    if (!segments) return -1;
    for (let i = segments.length - 1; i >= 0; i--) {
      if (segments[i]?.kind === "activity") return i;
    }
    return -1;
  }, [segments]);

  const renderFlatBlock = (block: ContentBlock, i: number) => {
    if (block.type === "thinking" && block.thinking) {
      return (
        <ThinkingWidget
          key={i}
          thinking={block.thinking}
          duration={block.duration}
          sessionId={sessionId}
          persistKey={sessionId ? `${sessionId}:${msgIndex}:${i}` : undefined}
          isStreamingMsg={isStreamingMsg && !thinkingComplete}
          isProgress={block._progress === true}
        />
      );
    }
    if (block.type === "text" && block.text) {
      return (
        <div key={i} className="min-w-0 max-w-full overflow-hidden text-[length:var(--font-chat-message)]">
          <MarkdownRenderer
            content={block.text}
            isAnimating={isStreamingMsg}
            sessionId={sessionId}
          />
        </div>
      );
    }
    if (block.type === "tool_use") {
      const result = toolResultMap.get(block.id || "");
      const planPath = planPathFromToolUse(block);
      const showPlanCard = !!planPath && !!result && !result.is_error;
      return (
        <div key={i}>
          <ToolWidget
            toolUse={block}
            toolResult={result}
            suppressArtifactPaths={suppressArtifactPaths}
          />
          {showPlanCard ? <PlanArtifactCard pathFallback={planPath} /> : null}
        </div>
      );
    }
    return null;
  };

  const foldPersistBase = turnKey ?? (sessionId ? `${sessionId}:${msgIndex}` : String(msgIndex));

  return (
    <InteractionFenceDedupeProvider messageKey={`${sessionId}:${msgIndex}`}>
      {foldActivity && segments
        ? segments.map((segment, segIndex) => {
            if (segment.kind === "text") {
              return (
                <div
                  key={`text-${segment.blockIndex}`}
                  className="min-w-0 max-w-full overflow-hidden text-[length:var(--font-chat-message)]"
                >
                  <MarkdownRenderer
                    content={segment.block.text!}
                    isAnimating={isStreamingMsg}
                    sessionId={sessionId}
                  />
                </div>
              );
            }
            const isStreamingSegment =
              !!isStreamingMsg && segIndex === lastActivitySegmentIndex;
            return (
              <ActivityFold
                key={`activity-${segment.blockIndices[0] ?? segIndex}`}
                blocks={segment.blocks}
                blockIndices={segment.blockIndices}
                toolResultMap={toolResultMap}
                sessionId={sessionId}
                persistKey={`${foldPersistBase}:a${segIndex}`}
                isStreamingSegment={isStreamingSegment}
                suppressArtifactPaths={suppressArtifactPaths}
              />
            );
          })
        : blocks.map((block, i) => renderFlatBlock(block, i))}
      {fallbackReply ? (
        <div
          key="experiment-artifact-reply"
          className="min-w-0 max-w-full overflow-hidden text-[length:var(--font-chat-message)]"
        >
          <MarkdownRenderer content={fallbackReply} sessionId={sessionId} />
        </div>
      ) : null}
      {interactionFallbackReply ? (
        <div
          key="interaction-fence-reply"
          className="min-w-0 max-w-full overflow-hidden text-[length:var(--font-chat-message)]"
        >
          <MarkdownRenderer content={interactionFallbackReply} sessionId={sessionId} />
        </div>
      ) : null}
      {planFallbackReply ? (
        <div
          key="plan-reply-fallback"
          className="min-w-0 max-w-full overflow-hidden text-[length:var(--font-chat-message)]"
        >
          <MarkdownRenderer content={planFallbackReply} sessionId={sessionId} />
        </div>
      ) : null}
    </InteractionFenceDedupeProvider>
  );
});
