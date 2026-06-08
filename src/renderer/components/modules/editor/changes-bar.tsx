import { useMemo } from "react";
import { useChangesStore, type ProposedChange } from "@/stores/changes-store";
import { CheckIcon, XIcon, ChevronUpIcon, ChevronDownIcon } from "lucide-react";
import { diffLines } from "diff";

interface ChangesBarProps {
  change: ProposedChange;
  changeIndex: number;
  totalChanges: number;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onPrevChange?: () => void;
  onNextChange?: () => void;
}

function countDiff(oldContent: string, newContent: string) {
  const changes = diffLines(oldContent, newContent);
  let added = 0;
  let removed = 0;
  for (const change of changes) {
    const lines = change.value.split("\n").filter((l) => l !== "" || change.value.endsWith("\n")).length;
    // Count actual changed lines
    const lineCount = change.value.split("\n").length - (change.value.endsWith("\n") ? 1 : 0);
    if (change.added) added += lineCount;
    else if (change.removed) removed += lineCount;
  }
  return { added, removed };
}

export function ChangesBar({
  change,
  changeIndex,
  totalChanges,
  onAcceptAll,
  onRejectAll,
  onPrevChange,
  onNextChange,
}: ChangesBarProps) {
  const { added, removed } = useMemo(
    () => countDiff(change.oldContent, change.newContent),
    [change.oldContent, change.newContent],
  );

  return (
    <div className="flex h-[var(--height-changes-bar)] shrink-0 items-center gap-2 border-b border-border bg-muted/50 px-3">
      <span className="text-[length:var(--font-toolbar-tab)] text-muted-foreground truncate min-w-0">
        {change.filePath.split("/").pop() || change.filePath}
      </span>
      <span className="text-[length:var(--font-toolbar-label)] text-muted-foreground shrink-0">
        ({change.toolName})
      </span>

      {added > 0 && (
        <span className="text-[length:var(--font-badge)] text-success shrink-0">
          +{added}
        </span>
      )}
      {removed > 0 && (
        <span className="text-[length:var(--font-badge)] text-destructive shrink-0">
          -{removed}
        </span>
      )}

      {totalChanges > 1 && (
        <span className="text-[length:var(--font-badge)] text-muted-foreground shrink-0">
          {changeIndex + 1}/{totalChanges}
        </span>
      )}

      <div className="flex-1" />

      {totalChanges > 1 && onPrevChange && onNextChange && (
        <>
          <button
            type="button"
            className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0"
            onClick={onPrevChange}
            title="Previous change"
          >
            <ChevronUpIcon className="size-3" />
          </button>
          <button
            type="button"
            className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0"
            onClick={onNextChange}
            title="Next change"
          >
            <ChevronDownIcon className="size-3" />
          </button>
        </>
      )}

      <button
        type="button"
        className="flex items-center gap-1 rounded px-2 py-0.5 text-[length:var(--font-toolbar-tab)] text-success hover:bg-success/10 transition-colors shrink-0"
        onClick={onAcceptAll}
        title="Accept all changes (⌘Y)"
      >
        <CheckIcon className="size-3" />
        Accept
      </button>
      <button
        type="button"
        className="flex items-center gap-1 rounded px-2 py-0.5 text-[length:var(--font-toolbar-tab)] text-destructive hover:bg-destructive/10 transition-colors shrink-0"
        onClick={onRejectAll}
        title="Reject all changes (⌘N)"
      >
        <XIcon className="size-3" />
        Reject
      </button>
    </div>
  );
}
