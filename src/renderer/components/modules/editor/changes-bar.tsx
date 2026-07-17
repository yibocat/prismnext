import { useMemo } from "react";
import { useChangesStore, type ProposedChange } from "@/stores/changes-store";
import { Hint } from "@/components/ui/hint";
import { CheckIcon, XIcon, ChevronUpIcon, ChevronDownIcon, ShieldAlertIcon } from "lucide-react";
import { diffLines } from "diff";

export type ChangesBarMode = "permission" | "review";

interface ChangesBarProps {
  change: ProposedChange;
  changeIndex: number;
  totalChanges: number;
  mode?: ChangesBarMode;
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
  mode = "review",
  onAcceptAll,
  onRejectAll,
  onPrevChange,
  onNextChange,
}: ChangesBarProps) {
  const { added, removed } = useMemo(
    () => countDiff(change.oldContent, change.newContent),
    [change.oldContent, change.newContent],
  );

  const isPermission = mode === "permission";

  return (
    <div className="flex h-[var(--height-changes-bar)] shrink-0 items-center gap-2 border-b border-border bg-muted/50 px-3">
      {isPermission && (
        <ShieldAlertIcon className="size-3.5 shrink-0 text-primary" />
      )}
      <span className="text-[length:var(--font-toolbar-tab)] text-muted-foreground truncate min-w-0">
        {isPermission ? "Allow AI to edit this file?" : (change.filePath.split("/").pop() || change.filePath)}
      </span>
      {!isPermission && (
        <span className="text-[length:var(--font-toolbar-label)] text-muted-foreground shrink-0">
          ({change.toolName})
        </span>
      )}

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
          <Hint label="Previous change">
            <button
              type="button"
              className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0"
              onClick={onPrevChange}
            >
              <ChevronUpIcon className="size-3" />
            </button>
          </Hint>
          <Hint label="Next change">
            <button
              type="button"
              className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0"
              onClick={onNextChange}
            >
              <ChevronDownIcon className="size-3" />
            </button>
          </Hint>
        </>
      )}

      <Hint
        label={isPermission ? "Allow" : "Accept all changes"}
        shortcutId={isPermission ? "product.acceptChange" : "product.acceptAll"}
      >
        <button
          type="button"
          className="flex items-center gap-1 rounded px-2 py-0.5 text-[length:var(--font-toolbar-tab)] text-success hover:bg-success/10 transition-colors shrink-0"
          onClick={onAcceptAll}
        >
          <CheckIcon className="size-3" />
          {isPermission ? "Allow" : "Accept"}
        </button>
      </Hint>
      <Hint
        label={isPermission ? "Deny" : "Reject all changes"}
        shortcutId={isPermission ? "product.rejectChange" : "product.rejectAll"}
      >
        <button
          type="button"
          className="flex items-center gap-1 rounded px-2 py-0.5 text-[length:var(--font-toolbar-tab)] text-destructive hover:bg-destructive/10 transition-colors shrink-0"
          onClick={onRejectAll}
        >
          <XIcon className="size-3" />
          {isPermission ? "Deny" : "Reject"}
        </button>
      </Hint>
    </div>
  );
}
