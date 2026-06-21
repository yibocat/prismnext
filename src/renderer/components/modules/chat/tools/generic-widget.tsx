import { useState, memo } from "react";
import type { ContentBlock } from "@/stores/chat-store";
import { WrenchIcon } from "lucide-react";
import { ToolCard } from "./shared";

export const GenericWidget = memo(function GenericWidget({
  toolUse,
  toolResult,
  toolName,
}: {
  toolUse: ContentBlock;
  toolResult?: ContentBlock;
  toolName: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLoading = !toolResult;
  const isError = toolResult?.is_error;
  const hasContent = toolResult?.content != null;

  // During live streaming, OpenCode may not populate rawInput, leaving
  // only `title` (a required ACP field) as the sole source of context.
  // Show it so the user at least knows what the tool is doing.
  const contextTitle =
    toolUse.title ||
    (toolUse.input as any)?._title ||
    "";

  return (
    <ToolCard
      toolName={toolName || "tool"}
      icon={<WrenchIcon className="size-3.5 text-muted-foreground" />}
      label={undefined}
      meta={
        contextTitle ? (
          <span className="text-muted-foreground/70 truncate text-[length:var(--font-chat-meta)]">
            {contextTitle.slice(0, 80)}
          </span>
        ) : undefined
      }
      expanded={expanded}
      onToggle={() => setExpanded(!expanded)}
      isLoading={isLoading}
      isError={!!isError}
      hasContent={hasContent}
      bodyClassName="font-mono whitespace-pre-wrap text-muted-foreground max-h-80 overflow-y-auto"
    >
      {() => {
        const raw = typeof toolResult!.content === "string"
          ? toolResult!.content
          : JSON.stringify(toolResult!.content, null, 2);
        const truncated = raw.length > 2000 ? raw.slice(0, 2000) + `\n\n··· ${raw.length - 2000} more chars` : raw;
        return truncated;
      }}
    </ToolCard>
  );
});
