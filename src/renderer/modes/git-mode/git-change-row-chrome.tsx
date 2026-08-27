import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Undo2Icon } from "lucide-react";
import { Hint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";

/**
 * Right-area list typography — `--font-toolbar-tab` (= `--font-size-12`, rem-based).
 * Scales when Settings → UI Font changes the root size; not the raw root size itself.
 */
export const gitChangeRowTextClass = "text-[length:var(--font-toolbar-tab)]";

/** Same chip as Git TabToolbar (branch / local) — pad + type + icon box. */
export const gitToolbarChipClass =
  "flex items-center gap-1.5 h-6 px-2 rounded text-[length:var(--font-menu-item)] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors";

export const gitToolbarIconClass = "size-3.5 shrink-0";

/** Main changes list row — same height band as right-area subtoolbar. */
export const gitChangeRowShellClass =
  "flex items-center gap-2 px-3 h-[var(--height-right-area-subtoolbar)] shrink-0 border-b border-border/60";

/** Sticky list header — `pl-2` lines up with TabToolbar; `pr-3` lines up with file rows. */
export const gitPanelListHeaderShellClass =
  "flex items-center gap-2 pl-2 pr-3 shrink-0 h-[var(--height-right-area-subtoolbar)] bg-background border-b border-border/60";

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
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        // "added" maps cleanly to the universal green semantic; all 5 packs
        // keep success in the green family, so this is safe to theme.
        "shrink-0 font-medium text-success",
        gitChangeRowTextClass,
      )}
    >
      {t("git.changes.new")}
    </span>
  );
}

export function GitChangeDeletedLabel() {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        // "deleted" maps cleanly to the universal red semantic; destructive
        // stays red-family across all 5 packs.
        "shrink-0 font-medium text-destructive",
        gitChangeRowTextClass,
      )}
    >
      {t("git.changes.deleted")}
    </span>
  );
}

export function GitChangeLineCounts({
  added,
  deleted,
  tone = "solid",
}: {
  added: number;
  deleted: number;
  /** `hover`: gray until the parent `.group` is hovered / open (filter chip + menu). */
  tone?: "solid" | "hover";
}) {
  if (added <= 0 && deleted <= 0) return null;
  const hoverTone =
    "text-muted-foreground group-hover:text-success group-focus:text-success group-data-[highlighted]:text-success group-data-[state=open]:text-success";
  const hoverToneDeleted =
    "text-muted-foreground group-hover:text-destructive group-focus:text-destructive group-data-[highlighted]:text-destructive group-data-[state=open]:text-destructive";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-baseline gap-0.5 tabular-nums",
        gitChangeRowTextClass,
      )}
    >
      {added > 0 && (
        <span className={tone === "hover" ? hoverTone : "text-success"}>+{added}</span>
      )}
      {deleted > 0 && (
        <span className={tone === "hover" ? hoverToneDeleted : "text-destructive"}>
          -{deleted}
        </span>
      )}
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
    <Hint label={title}>
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        onClick={onClick}
        readOnly
        className="size-3 shrink-0 cursor-pointer accent-primary rounded-sm"
      />
    </Hint>
  );
}

export function GitChangeHeaderDiscardButton({
  visible,
  onClick,
}: {
  visible: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <GitChangeDiscardSlot>
      {visible && (
        <Hint label={t("git.changes.discardAllUnstaged")}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
            className="size-4 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <Undo2Icon className="size-3" />
          </button>
        </Hint>
      )}
    </GitChangeDiscardSlot>
  );
}
