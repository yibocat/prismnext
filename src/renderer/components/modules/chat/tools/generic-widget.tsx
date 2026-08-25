import { useState, memo } from "react";
import type { ContentBlock } from "@/stores/chat-store";
import { WrenchIcon } from "lucide-react";
import { ToolCard, toolUseContextTitle } from "./shared";

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

  // Pi primitives have no ACP `title`. Prefer an explicit title, else one
  // line from args (path / pattern / command) that is not just the tool name.
  const contextTitle = toolUseContextTitle(toolUse);

  return (
    <ToolCard
      toolName={toolName || "tool"}
      icon={<WrenchIcon className="size-3.5 text-muted-foreground" />}
      label={undefined}
      meta={
        contextTitle ? (
          <span className="text-muted-foreground/70 min-w-0 truncate text-[length:var(--font-chat-meta)]">
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
