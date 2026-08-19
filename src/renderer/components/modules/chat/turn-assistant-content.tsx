import { memo } from "react";
import { SquareIcon } from "lucide-react";
import type { ContentBlock } from "@/stores/chat-store";
import { AssistantBlockList } from "./assistant-block-list";

export const TurnAssistantContent = memo(function TurnAssistantContent({
  blocks,
  toolResultMap,
  sessionId,
  turnIndex,
  turnId,
  isStreamingMsg,
  planReplyFallbackSummary,
  stopped = false,
}: {
  blocks: ContentBlock[];
  toolResultMap: Map<string, ContentBlock>;
  sessionId: string;
  turnIndex: number;
  turnId?: string;
  isStreamingMsg: boolean;
  planReplyFallbackSummary?: string | null;
  stopped?: boolean;
}) {
  if (blocks.length === 0 && !stopped) return null;

  return (
    <div className="group w-full min-w-0 max-w-full overflow-hidden animate-in fade-in slide-in-from-bottom-1 duration-200">
      <div className="min-w-0 flex-1">
        <AssistantBlockList
          blocks={blocks}
          toolResultMap={toolResultMap}
          msgIndex={turnIndex}
          isStreamingMsg={isStreamingMsg}
          sessionId={sessionId}
          foldActivity
          turnKey={turnId || `${sessionId}:${turnIndex}`}
          planReplyFallbackSummary={planReplyFallbackSummary}
        />
      </div>
      {stopped ? (
        <div className="mt-1 flex items-center gap-1.5 text-[length:var(--font-chat-meta)] text-muted-foreground">
          <SquareIcon className="size-3 shrink-0 fill-current" />
          <span>已停止</span>
        </div>
      ) : null}
    </div>
  );
});
