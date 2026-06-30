import { useEffect, useRef } from "react";
import { Undo2Icon } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Right-area list typography — `--font-toolbar-tab` (= `--font-size-12`, rem-based).
 * Scales when Settings → UI Font changes the root size; not the raw root size itself.
 */
export const gitChangeRowTextClass = "text-[length:var(--font-toolbar-tab)]";

/** Main changes list row — same height band as right-area subtoolbar. */
export const gitChangeRowShellClass =
  "flex items-center gap-2 px-3 h-[var(--height-right-area-subtoolbar)] shrink-0 border-b border-border/60";

/** Sticky list header — Changes scroll container. */
export const gitPanelListHeaderShellClass =
  "flex items-center gap-2 px-3 shrink-0 h-[var(--height-right-area-subtoolbar)] bg-background border-b border-border/60";

export const gitPanelListHeaderClass =
  `${gitPanelListHeaderShellClass} sticky top-0 z-20`;

/** Expanded file row sticks below the list header (Changes). */
export const gitPanelExpandedRowStickyClass =
  "sticky top-[var(--height-right-area-subtoolbar)] z-10 border-b border-border/40";

/** Expanded file row sticks to top of its own scroll container (History files). */
export const gitPanelExpandedRowInScrollerStickyClass =
  "sticky top-0 z-10 border-b border-border/40 bg-background";

/** Dividers between file rows in main panel lists. */
export const gitPanelListBodyClass = "flex flex-col";

/** One file row — shell + optional expanded diff (borders live on shell/diff, not here). */
export const gitPanelListRowClass = "flex flex-col";

/** Bottom edge when a file diff is expanded. */
export const gitPanelExpandedDiffClass = "border-b border-border/60";

export function GitChangeNewLabel() {
  return (
    <span
      className={cn(
        "shrink-0 font-medium text-emerald-600 dark:text-emerald-400",
        "text-[length:var(--font-size-11)]",
      )}
    >
      New
    </span>
  );
}

export function GitChangeLineCounts({
  added,
  deleted,
}: {
  added: number;
  deleted: number;
}) {
  return (
    <span
      className={cn(
        "font-mono tabular-nums shrink-0 flex items-center gap-0.5",
        "text-[length:var(--font-size-11)]",
      )}
    >
      {added > 0 && <span className="text-emerald-500">+{added}</span>}
      {deleted > 0 && <span className="text-red-400">-{deleted}</span>}
    </span>
  );
}

export function GitChangeDiscardSlot({ children }: { children?: React.ReactNode }) {
  return (
    <span className="size-4 shrink-0 flex items-center justify-center">
      {children}
    </span>
  );
}

export function GitChangeStageCheckbox({
  checked,
  indeterminate,
  onClick,
  title,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onClick: (e: React.MouseEvent<HTMLInputElement>) => void;
  title: string;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = indeterminate ?? false;
    }
  }, [indeterminate, checked]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onClick={onClick}
      readOnly
      className="size-3 shrink-0 cursor-pointer accent-primary rounded-sm"
      title={title}
    />
  );
}

export function GitChangeHeaderDiscardButton({
  visible,
  onClick,
}: {
  visible: boolean;
  onClick: () => void;
}) {
  return (
    <GitChangeDiscardSlot>
      {visible && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClick();
              }}
              className="size-4 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="Discard all unstaged changes"
            >
              <Undo2Icon className="size-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-[length:var(--font-size-11)]">
            Discard all
          </TooltipContent>
        </Tooltip>
      )}
    </GitChangeDiscardSlot>
  );
}
