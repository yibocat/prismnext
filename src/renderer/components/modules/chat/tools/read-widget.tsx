import { useState, memo } from "react";
import type { ContentBlock } from "@/stores/chat-store";
import { FileTextIcon } from "lucide-react";
import { ToolCard, param } from "./shared";

export const ReadWidget = memo(function ReadWidget({
  toolUse,
  toolResult,
  toolName,
}: {
  toolUse: ContentBlock;
  toolResult?: ContentBlock;
  toolName: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const filePath = param(toolUse.input, "file_path", "filePath")
    || param(toolUse.input, "path") || "";
  const offset = parseInt(param(toolUse.input, "offset") || "0", 10) || undefined;
  const limit = parseInt(param(toolUse.input, "limit") || "0", 10) || undefined;
  const fileName = filePath.split("/").pop() || filePath;
  const isLoading = !toolResult;
  const isError = toolResult?.is_error;
  const hasContent = toolResult?.content != null;

  const rangeLabel = offset != null
    ? limit != null ? `L${offset}-${offset + limit}` : `L${offset}+`
    : "";

  return (
    <ToolCard
      toolName={toolName}
      icon={<FileTextIcon className="size-3.5 text-info" />}
      label={<span className="truncate font-medium">{fileName}</span>}
      meta={rangeLabel && (
        <span className="text-muted-foreground/70 shrink-0 text-[length:var(--font-chat-meta)]">{rangeLabel}</span>
      )}
      expanded={expanded}
      onToggle={() => setExpanded(!expanded)}
      isLoading={isLoading}
      isError={!!isError}
      hasContent={hasContent}
      bodyClassName="font-mono text-muted-foreground max-h-80 overflow-y-auto"
    >
      {() => (
        <>
          <div className="text-[length:var(--font-chat-meta)] text-muted-foreground/70 mb-1">{filePath}</div>
          <pre className="whitespace-pre-wrap break-all">
            {(() => {
              const raw = typeof toolResult!.content === "string"
                ? toolResult!.content
                : JSON.stringify(toolResult!.content, null, 2);
              return raw.length > 3000
                ? raw.slice(0, 3000) + `\n\n··· ${raw.length - 3000} more chars`
                : raw;
            })()}
          </pre>
        </>
      )}
    </ToolCard>
  );
});
