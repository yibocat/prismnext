import { memo, useMemo } from "react";
import type { ContentBlock } from "@/stores/chat-store";
import { MarkdownRenderer } from "./markdown-renderer";
import { PlanArtifactCard } from "./plan-artifact-card";
import { ToolWidget } from "./tools/tool-widget-dispatcher";
import { ThinkingWidget } from "./tools/thinking-widget";
import { ActivityFold } from "./tools/activity-fold";
import {
  artifactPathMatchesAny,
  buildArtifactFallbackMarkdown,
} from "@/lib/markdown/chat-artifact";
import {
  resolveMissingArtifactPathsForReply,
  resolveSuppressArtifactPathsForToolCards,
} from "@/lib/chat/experiment-run-figures";
import {
  buildInteractionReplyFallbackMarkdown,
  collectInteractionResourcePathsFromBlocks,
} from "@/lib/chat/interaction-fence-fallback";
import { buildPlanReplyFallbackMarkdown } from "@/lib/chat/plan-reply-fallback";
import { InteractionFenceDedupeProvider } from "@/lib/interaction/interaction-fence-dedupe";
import { planPathFromToolUse } from "@/lib/chat/plan-artifact-ui";
import {
  activityFoldPersistKey,
  isActivityBurstStreaming,
  isThinkingBlockStreaming,
  segmentAssistantBlocks,
} from "@/lib/chat/segment-assistant-blocks";

/**
 * Live: contiguous thought+tools → burst folds; Task standalone; prose outside.
 * Settled / history: one Worked-for fold through the last process block; final reply out.
 */
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

  // Paths already displayed as interactions (spec resources) must not
  // re-appear as plain artifact previews — one surface per file.
  const interactionResourcePaths = isStreamingMsg
    ? []
    : collectInteractionResourcePathsFromBlocks(blocks, toolResultMap);
  const missingArtifacts = isStreamingMsg
    ? []
    : resolveMissingArtifactPathsForReply(blocks, toolResultMap).filter(
        (p) => !artifactPathMatchesAny(p, interactionResourcePaths),
      );
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
    : [
        ...resolveSuppressArtifactPathsForToolCards(
          blocks,
          toolResultMap,
          missingArtifacts,
        ),
        ...interactionResourcePaths,
      ];

  const segments = useMemo(
    () => (foldActivity ? segmentAssistantBlocks(blocks) : null),
    [blocks, foldActivity],
  );

  const lastFlatTextIndex = useMemo(() => {
    for (let i = blocks.length - 1; i >= 0; i--) {
      const b = blocks[i]!;
      if (b.type === "text" && b.text?.trim()) return i;
    }
    return -1;
  }, [blocks]);

  const renderFlatBlock = (block: ContentBlock, i: number) => {
    if (block.type === "thinking" && block.thinking) {
      return (
        <ThinkingWidget
          key={`think-${i}`}
          thinking={block.thinking}
          duration={block.duration}
          sessionId={sessionId}
          persistKey={sessionId ? `${sessionId}:${msgIndex}:${i}` : undefined}
          isStreamingMsg={isThinkingBlockStreaming(
            blocks,
            i,
            !!isStreamingMsg,
          )}
          isProgress={block._progress === true}
        />
      );
    }
    if (block.type === "text" && block.text) {
      const animateTip =
        !!isStreamingMsg
        && i === lastFlatTextIndex
        && i === blocks.length - 1;
      return (
        <div
          key={`text-${i}`}
          className="min-w-0 max-w-full overflow-hidden text-[length:var(--font-chat-message)]"
        >
          <MarkdownRenderer
            content={block.text}
            isAnimating={animateTip}
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
        <div key={`tool-${block.id ?? i}`}>
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

  const foldTurnId = turnKey ?? (sessionId ? `${sessionId}:${msgIndex}` : String(msgIndex));

  return (
    <InteractionFenceDedupeProvider messageKey={`${sessionId}:${msgIndex}`}>
      {foldActivity && segments
        ? segments.map((segment, segIndex) => {
            if (segment.kind === "text") {
              const animateTip =
                !!isStreamingMsg && segIndex === segments.length - 1;
              return (
                <div
                  key={`text-${segment.blockIndex}`}
                  className="min-w-0 max-w-full overflow-hidden text-[length:var(--font-chat-message)]"
                >
                  <MarkdownRenderer
                    content={segment.block.text!}
                    isAnimating={animateTip}
                    sessionId={sessionId}
                  />
                </div>
              );
            }
            if (segment.kind === "tool") {
              const result = toolResultMap.get(segment.block.id || "");
              return (
                <div key={`tool-${segment.block.id ?? segment.blockIndex}`}>
                  <ToolWidget
                    toolUse={segment.block}
                    toolResult={result}
                    suppressArtifactPaths={suppressArtifactPaths}
                  />
                </div>
              );
            }
            if (segment.kind !== "activity") return null;
            const firstIndex = segment.blockIndices[0] ?? segIndex;
            return (
              <ActivityFold
                key={`activity-${firstIndex}`}
                blocks={segment.blocks}
                blockIndices={segment.blockIndices}
                toolResultMap={toolResultMap}
                sessionId={sessionId}
                persistKey={activityFoldPersistKey(foldTurnId, firstIndex)}
                isStreamingSegment={isActivityBurstStreaming(segment.blocks, !!isStreamingMsg, {
                  hasLaterSegment: segIndex < segments.length - 1,
                })}
                messageThinkingComplete={thinkingComplete}
                suppressArtifactPaths={suppressArtifactPaths}
                turnSettled={false}
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
