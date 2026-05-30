import { useState, memo } from "react";
import type { ContentBlock } from "@/stores/chat-store";
import { WrenchIcon, ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusIcon } from "./shared";

export const GenericWidget = memo(function GenericWidget({
  toolUse,
  toolResult,
}: {
  toolUse: ContentBlock;
  toolResult?: ContentBlock;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLoading = !toolResult;
  const isError = toolResult?.is_error;
  const hasContent = toolResult?.content != null;

  return (
    <div className="my-2 rounded-lg border border-border bg-card text-[length:var(--font-code)] overflow-hidden">
      <button
        type="button"
        className={cn(
          "flex w-full items-center gap-2 px-3 py-2 text-left transition-colors",
          hasContent ? "hover:bg-muted/50 cursor-pointer" : "cursor-default",
        )}
        onClick={() => hasContent && setExpanded(!expanded)}
      >
        <StatusIcon isLoading={isLoading} isError={!!isError} />
        <WrenchIcon className="size-3.5 text-muted-foreground" />
        <span className="font-medium truncate">{toolUse.name}</span>
        {hasContent && (
          <ChevronDownIcon
            className={cn("ml-auto size-3.5 text-muted-foreground transition-transform", expanded && "rotate-180")}
          />
        )}
      </button>
      {expanded && hasContent && (
        <div className="border-t border-border bg-muted/30 px-3 py-2 font-mono whitespace-pre-wrap text-[length:var(--font-code)] text-muted-foreground max-h-80 overflow-y-auto">
          {(() => {
            const raw = typeof toolResult!.content === "string"
              ? toolResult!.content
              : JSON.stringify(toolResult!.content, null, 2);
            const truncated = raw.length > 2000 ? raw.slice(0, 2000) + `\n\n··· ${raw.length - 2000} more chars` : raw;
            return truncated;
          })()}
        </div>
      )}
    </div>
  );
});
