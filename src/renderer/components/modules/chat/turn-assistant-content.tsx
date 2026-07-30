import { memo, useMemo } from "react";
import { SquareIcon } from "lucide-react";
import type { ChatStreamMessage } from "@/stores/chat-store";
import { AssistantBlockList } from "./assistant-block-list";
import { contentBlocks } from "./tools/tool-result-map";

/** Merge consecutive assistant bubbles in one turn into a single block stream. */
export function mergeAssistantResponseBlocks(
  responses: Array<{ msg: ChatStreamMessage }>,
): { blocks: ReturnType<typeof contentBlocks>; hasStopped: boolean } {
  const blocks: ReturnType<typeof contentBlocks> = [];
  let hasStopped = false;
  for (const { msg } of responses) {
    if (msg.type !== "assistant") continue;
    if (msg.stopped) hasStopped = true;
    blocks.push(...contentBlocks(msg.message?.content));
  }
  return { blocks, hasStopped };
}

export const TurnAssistantContent = memo(function TurnAssistantContent({
  responses,
  toolResultMap,
  sessionId,
  turnIndex,
  streamingMessage,
  planReplyFallbackSummary,
}: {
  responses: Array<{ msg: ChatStreamMessage; displayIdx: number }>;
  toolResultMap: Map<string, import("@/stores/chat-store").ContentBlock>;
  sessionId: string;
  turnIndex: number;
  streamingMessage: ChatStreamMessage | null;
  planReplyFallbackSummary?: string | null;
}) {
  const { blocks, hasStopped } = useMemo(
    () => mergeAssistantResponseBlocks(responses),
    [responses],
  );

  const isStreamingMsg = useMemo(
    () =>
      !!streamingMessage
      && responses.some(({ msg }) => msg === streamingMessage),
    [responses, streamingMessage],
  );

  const msgIndex = responses[0]?.displayIdx ?? turnIndex;

  if (blocks.length === 0 && !hasStopped) return null;

  return (
    <div className="group w-full min-w-0 max-w-full overflow-hidden animate-in fade-in slide-in-from-bottom-1 duration-200">
      <div className="min-w-0 flex-1">
        <AssistantBlockList
          blocks={blocks}
          toolResultMap={toolResultMap}
          msgIndex={msgIndex}
          isStreamingMsg={isStreamingMsg}
          sessionId={sessionId}
          foldActivity
          turnKey={`${sessionId}:${turnIndex}`}
          planReplyFallbackSummary={planReplyFallbackSummary}
        />
      </div>
      {hasStopped ? (
        <div className="mt-1 flex items-center gap-1.5 text-[length:var(--font-chat-meta)] text-muted-foreground">
          <SquareIcon className="size-3 shrink-0 fill-current" />
          <span>已停止</span>
        </div>
      ) : null}
    </div>
  );
});
