import { useState, memo } from "react";
import type { ContentBlock } from "@/stores/chat-store";
import { TerminalIcon, ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusIcon } from "./shared";

export const BashWidget = memo(function BashWidget({
  toolUse,
  toolResult,
}: {
  toolUse: ContentBlock;
  toolResult?: ContentBlock;
}) {
  const [expanded, setExpanded] = useState(false);
  const command = toolUse.input?.command || "";
  const isError = toolResult?.is_error;
  const isLoading = !toolResult;

  return (
    <div className="my-2 rounded-lg border border-border bg-card text-[length:var(--font-code)] overflow-hidden">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <StatusIcon isLoading={isLoading} isError={!!isError} />
        <TerminalIcon className="size-3.5 text-warning" />
        <span className="truncate font-mono">{command.slice(0, 80)}</span>
        <ChevronDownIcon
          className={cn("ml-auto size-3.5 text-muted-foreground transition-transform", expanded && "rotate-180")}
        />
      </button>
      {expanded && toolResult?.content && (
        <div className="border-t border-border bg-muted/50 px-3 py-2 font-mono text-[length:var(--font-code)] whitespace-pre-wrap">
          {(() => {
            const raw = typeof toolResult.content === "string"
              ? toolResult.content
              : JSON.stringify(toolResult.content, null, 2);
            const truncated = raw.length > 500 ? raw.slice(0, 500) + `\n\n··· ${raw.length - 500} more chars` : raw;
            return truncated;
          })()}
        </div>
      )}
    </div>
  );
});
