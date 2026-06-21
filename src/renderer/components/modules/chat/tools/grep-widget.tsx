import { useState, memo } from "react";
import type { ContentBlock } from "@/stores/chat-store";
import { SearchIcon } from "lucide-react";
import { ToolCard, param } from "./shared";

export const GrepWidget = memo(function GrepWidget({
  toolUse,
  toolResult,
  toolName,
}: {
  toolUse: ContentBlock;
  toolResult?: ContentBlock;
  toolName: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const pattern = param(toolUse.input, "pattern") || param(toolUse.input, "query") || "";
  const path = param(toolUse.input, "path") || param(toolUse.input, "directory") || "";
  const isLoading = !toolResult;
  const isError = toolResult?.is_error;
  const hasContent = toolResult?.content != null;

  /** Parse grep output to count matches */
  const outputText = typeof toolResult?.content === "string"
    ? toolResult.content
    : JSON.stringify(toolResult?.content ?? "", null, 2);
  const matchCount = outputText ? outputText.split("\n").filter((l: string) => l.trim()).length : 0;

  return (
    <ToolCard
      toolName={toolName}
      icon={<SearchIcon className="size-3.5 text-warning" />}
      label={<span className="font-mono truncate">{pattern.slice(0, 60)}</span>}
      meta={
        <>
          {matchCount > 0 && (
            <span className="text-muted-foreground/70 shrink-0 text-[length:var(--font-chat-meta)]">
              {matchCount} match{matchCount !== 1 ? "es" : ""}
            </span>
          )}
          {path && (
            <span className="text-muted-foreground/50 truncate text-[length:var(--font-chat-meta)] hidden sm:inline">
              in {path.split("/").pop() || path}
            </span>
          )}
        </>
      }
      expanded={expanded}
      onToggle={() => setExpanded(!expanded)}
      isLoading={isLoading}
      isError={!!isError}
      hasContent={hasContent}
      bodyClassName="font-mono text-muted-foreground max-h-80 overflow-y-auto"
    >
      <div className="text-[length:var(--font-chat-meta)] text-muted-foreground/70 mb-1">
        grep {pattern}{path ? ` → ${path}` : ""}
      </div>
      <pre className="whitespace-pre-wrap break-all">
        {outputText.length > 3000
          ? outputText.slice(0, 3000) + `\n\n··· ${outputText.length - 3000} more chars`
          : outputText}
      </pre>
    </ToolCard>
  );
});
