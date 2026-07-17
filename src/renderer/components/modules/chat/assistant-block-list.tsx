import { memo } from "react";
import type { ContentBlock } from "@/stores/chat-store";
import { MarkdownRenderer } from "./markdown-renderer";
import { ToolWidget } from "./tools/tool-widget-dispatcher";
import { ThinkingWidget } from "./tools/thinking-widget";
import { buildArtifactFallbackMarkdown } from "@/lib/markdown/chat-artifact";
import {
  resolveMissingArtifactPathsForReply,
  resolveSuppressArtifactPathsForToolCards,
} from "@/lib/chat/experiment-run-figures";

/** Shared assistant block renderer for main chat and Task expert activity. */
export const AssistantBlockList = memo(function AssistantBlockList({
  blocks,
  toolResultMap,
  msgIndex,
  isStreamingMsg,
  sessionId,
}: {
  blocks: ContentBlock[];
  toolResultMap: Map<string, ContentBlock>;
  msgIndex: number;
  isStreamingMsg?: boolean;
  sessionId: string;
}) {
  const thinkingComplete = blocks.some(
    (b) => b.type === "text" || b.type === "tool_use",
  );

  // If the model forgot to embed result files, append ```artifact fences (cap 5).
  // Wait until the turn finishes so we don't insert between partial prose streams.
  const missingArtifacts = isStreamingMsg
    ? []
    : resolveMissingArtifactPathsForReply(blocks, toolResultMap);
  const fallbackReply = buildArtifactFallbackMarkdown(missingArtifacts);
  // Hide the same files in tool-card galleries (reply body / fallback wins).
  const suppressArtifactPaths = isStreamingMsg
    ? []
    : resolveSuppressArtifactPathsForToolCards(
        blocks,
        toolResultMap,
        missingArtifacts,
      );

  return (
    <>
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
          return (
            <ToolWidget
              key={i}
              toolUse={block}
              toolResult={result}
              suppressArtifactPaths={suppressArtifactPaths}
            />
          );
        }
        return null;
      })}
      {fallbackReply ? (
        <div
          key="experiment-artifact-reply"
          className="min-w-0 max-w-full overflow-hidden text-[length:var(--font-chat-message)]"
        >
          <MarkdownRenderer content={fallbackReply} sessionId={sessionId} />
        </div>
      ) : null}
    </>
  );
});
