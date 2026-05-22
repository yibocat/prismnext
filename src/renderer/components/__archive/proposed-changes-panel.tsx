import { Check, X } from "lucide-react";
import type { ProposedChange } from "@/stores/changes-store";

interface ProposedChangesPanelProps {
  change: ProposedChange;
  changeIndex: number;
  totalChanges: number;
  onAccept: () => void;
  onReject: () => void;
}

export function ProposedChangesPanel({
  change,
  changeIndex,
  totalChanges,
  onAccept,
  onReject,
}: ProposedChangesPanelProps) {
  const oldLines = change.oldContent.split("\n").length;
  const newLines = change.newContent.split("\n").length;
  const added = Math.max(0, newLines - oldLines);
  const removed = Math.max(0, oldLines - newLines);

  return (
    <div className="flex items-center justify-between border-border border-t bg-muted/50 px-3 py-1.5">
      <div className="flex items-center gap-2 text-[length:var(--font-chat-meta)] min-w-0">
        <span className="font-medium text-foreground shrink-0">Changes</span>
        {totalChanges > 1 && (
          <span className="shrink-0 rounded bg-violet-500/15 px-1.5 py-0.5 font-medium text-violet-600 text-[length:var(--font-chat-meta)] dark:text-violet-400">
            {changeIndex + 1}/{totalChanges} files
          </span>
        )}
        <span className="truncate text-muted-foreground">{change.filePath}</span>
        <span className="shrink-0 text-muted-foreground">{change.toolName}</span>
        {added > 0 && <span className="shrink-0 text-green-400">+{added}</span>}
        {removed > 0 && <span className="shrink-0 text-red-400">-{removed}</span>}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={onAccept}
          className="flex items-center gap-1 rounded-md bg-green-600/20 px-2.5 py-1 text-green-400 text-[length:var(--font-chat-meta)] transition-colors hover:bg-green-600/30"
        >
          <Check className="size-3.5" />
          Accept All
          <kbd className="ml-1 rounded bg-green-600/20 px-1 py-0.5 font-mono text-[length:var(--font-kbd)]">
            ⌘Y
          </kbd>
        </button>
        <button
          onClick={onReject}
          className="flex items-center gap-1 rounded-md bg-red-600/20 px-2.5 py-1 text-red-400 text-[length:var(--font-chat-meta)] transition-colors hover:bg-red-600/30"
        >
          <X className="size-3.5" />
          Reject All
          <kbd className="ml-1 rounded bg-red-600/20 px-1 py-0.5 font-mono text-[length:var(--font-kbd)]">
            ⌘N
          </kbd>
        </button>
      </div>
    </div>
  );
}
