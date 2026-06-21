import { useState, memo } from "react";
import type { ContentBlock } from "@/stores/chat-store";
import { FolderSearchIcon, FileIcon, FolderIcon } from "lucide-react";
import { ToolCard, param } from "./shared";

export const GlobWidget = memo(function GlobWidget({
  toolUse,
  toolResult,
  toolName,
}: {
  toolUse: ContentBlock;
  toolResult?: ContentBlock;
  toolName: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const pattern = param(toolUse.input, "pattern") || param(toolUse.input, "glob") || "";
  const path = param(toolUse.input, "path") || "";
  const isLoading = !toolResult;
  const isError = toolResult?.is_error;
  const hasContent = toolResult?.content != null;

  /** Parse file list from result */
  const outputText = typeof toolResult?.content === "string"
    ? toolResult.content
    : "";
  const files = outputText
    ? outputText.split("\n").filter((l: string) => l.trim()).slice(0, 100)
    : [];
  const fileCount = files.length;

  return (
    <ToolCard
      toolName={toolName}
      icon={<FolderSearchIcon className="size-3.5 text-info" />}
      label={<span className="font-mono truncate">{pattern.slice(0, 50)}</span>}
      meta={
        fileCount > 0 ? (
          <span className="text-muted-foreground/70 shrink-0 text-[length:var(--font-chat-meta)]">
            {fileCount} file{fileCount !== 1 ? "s" : ""}
          </span>
        ) : undefined
      }
      expanded={expanded}
      onToggle={() => setExpanded(!expanded)}
      isLoading={isLoading}
      isError={!!isError}
      hasContent={hasContent}
      bodyClassName="font-mono max-h-80 overflow-y-auto"
    >
      <div className="text-[length:var(--font-chat-meta)] text-muted-foreground/70 mb-1">
        {pattern}{path ? ` in ${path}` : ""} · {fileCount} result{fileCount !== 1 ? "s" : ""}
      </div>
      {files.map((f, i) => (
        <div key={i} className="flex items-center gap-1.5 py-0.5 text-muted-foreground hover:text-foreground transition-colors">
          {f.endsWith("/") ? (
            <FolderIcon className="size-3 shrink-0 text-muted-foreground/60" />
          ) : (
            <FileIcon className="size-3 shrink-0 text-muted-foreground/60" />
          )}
          <span className="truncate">{f.trim()}</span>
        </div>
      ))}
      {fileCount === 100 && (
        <div className="text-muted-foreground text-[length:var(--font-chat-meta)] mt-1">
          ··· results truncated at 100
        </div>
      )}
    </ToolCard>
  );
});
