import { useState, memo } from "react";
import type { ContentBlock } from "@/stores/chat-store";
import { FolderIcon, FileIcon } from "lucide-react";
import { ToolCard, param } from "./shared";

interface DirEntry {
  name: string;
  type: "file" | "directory";
  size?: number;
  mtime?: number;
}

export const ListWidget = memo(function ListWidget({
  toolUse,
  toolResult,
  toolName,
}: {
  toolUse: ContentBlock;
  toolResult?: ContentBlock;
  toolName: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const dirPath = param(toolUse.input, "path") || param(toolUse.input, "directory") || ".";
  const isLoading = !toolResult;
  const isError = toolResult?.is_error;
  const hasContent = toolResult?.content != null;

  let entries: DirEntry[] = [];
  const raw = toolResult?.content;
  if (raw) {
    if (typeof raw === "object" && Array.isArray(raw)) {
      entries = raw.map((e: any) => ({
        name: e.name || e.file || String(e),
        type: e.type === "directory" || e.is_dir ? "directory" : "file",
        size: e.size,
        mtime: e.mtime,
      }));
    } else if (typeof raw === "string") {
      entries = raw.split("\n").filter((l: string) => l.trim()).map((l: string) => ({
        name: l.trim(),
        type: l.endsWith("/") ? "directory" : "file",
      }));
    }
  }

  const dirName = dirPath.split("/").pop() || dirPath;

  function fmtSize(bytes?: number): string {
    if (bytes == null) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <ToolCard
      toolName={toolName}
      icon={<FolderIcon className="size-3.5 text-warning" />}
      label={<span className="truncate font-medium">{dirName}</span>}
      meta={entries.length > 0 && (
        <span className="text-muted-foreground/70 shrink-0 text-[length:var(--font-chat-meta)]">
          {entries.length} item{entries.length !== 1 ? "s" : ""}
        </span>
      )}
      expanded={expanded}
      onToggle={() => setExpanded(!expanded)}
      isLoading={isLoading}
      isError={!!isError}
      hasContent={hasContent}
      bodyClassName="font-mono max-h-80 overflow-y-auto"
    >
      <div className="text-[length:var(--font-chat-meta)] text-muted-foreground/70 mb-1">{dirPath}</div>
      {entries.slice(0, 200).map((e, i) => (
        <div key={i} className="flex items-center gap-1.5 py-0.5 text-muted-foreground hover:text-foreground transition-colors">
          {e.type === "directory"
            ? <FolderIcon className="size-3 shrink-0 text-muted-foreground/60" />
            : <FileIcon className="size-3 shrink-0 text-muted-foreground/60" />
          }
          <span className="truncate flex-1">{e.name}</span>
          {e.size != null && (
            <span className="text-muted-foreground/50 shrink-0 text-[length:var(--font-chat-meta)]">{fmtSize(e.size)}</span>
          )}
        </div>
      ))}
      {entries.length > 200 && (
        <div className="text-muted-foreground text-[length:var(--font-chat-meta)] mt-1">
          ··· {entries.length - 200} more items not shown
        </div>
      )}
    </ToolCard>
  );
});
