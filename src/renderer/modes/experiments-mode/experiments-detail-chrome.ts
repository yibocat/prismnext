/**
 * Experiments detail + runs list chrome — shared typography and layout tokens.
 * Mirrors `literature-list-chrome.ts` and `git-change-row-chrome.tsx`.
 */

import { i18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Mode toolbar context line (lab path, experiment count). */
export const experimentsToolbarContextClass =
  "text-[length:var(--font-size-11)] text-muted-foreground";

/** Section label — mode detail uppercase (matches experiments-detail). */
export const experimentsSectionLabelClass =
  "text-[length:var(--font-size-11)] font-medium uppercase tracking-wide text-muted-foreground/75";

/** Subsection label inside a section (e.g. run history under execution). */
export const experimentsSubsectionLabelClass =
  "text-[length:var(--font-size-11)] font-medium tracking-wide text-muted-foreground/70";

/** Detail page title — aligned with literature entry panel. */
export const experimentsDetailTitleClass =
  "text-[length:var(--font-size-18)] font-semibold leading-7 text-foreground";

/** Shell commands and terminal output (Code Font). */
export const experimentsCodeClass =
  "font-mono text-[length:var(--font-code)] break-all";

/** Paths in detail metadata rows (UI Font, same size as other values). */
export const experimentsPathValueClass =
  "font-sans text-[length:var(--font-size-13)] text-foreground/90 break-all";

/** Compact paths in toolbar / card footers (UI Font, small). */
export const experimentsPathCompactClass =
  "font-sans text-[length:var(--font-size-11)] text-foreground/80 truncate";

/** Metadata values — IDs, dates, platform (UI Font). */
export const experimentsUiValueClass =
  "font-sans text-[length:var(--font-size-13)] text-foreground/90 break-all";

/** @deprecated Use experimentsCodeClass, experimentsPathValueClass, or experimentsUiValueClass. */
export const experimentsMonoValueClass = experimentsCodeClass;

/** Runs list row — same height band as git/literature right-area lists. */
export const experimentsRunRowShellClass =
  "flex items-center gap-2 px-3 h-[var(--height-right-area-subtoolbar)] shrink-0 min-w-0 border-b border-border/60 text-left w-full";

/** Runs list column header — Literature-style sticky strip (no card shell). */
export const experimentsRunsListHeaderShellClass =
  "shrink-0 h-[var(--height-right-area-subtoolbar)] bg-background border-b border-border/50 px-3 sticky top-0 z-[1]";

export const experimentsRunsListHeaderLabelClass =
  "font-sans text-[length:var(--font-size-11)] font-medium tracking-[0.01em] text-muted-foreground/75";

/** Row body text — scales with UI font setting. */
export const experimentsRunRowTextClass =
  "font-sans text-[length:var(--font-toolbar-tab)]";

/** @deprecated Prefer flush Literature-style list (no outer card). */
export const experimentsRunsTableShellClass = "min-w-0";

/** Unified command + live output console (Execution section). */
export const experimentsRunConsoleShellClass =
  "overflow-hidden rounded-md border border-border bg-card shadow-none";

/**
 * Expanded run detail under a list row (Literature accordion).
 * Left inset matches list title column (px-3 + checkbox + icon + gaps).
 */
export const experimentsRunDetailPanelClass =
  "space-y-2 bg-background pl-8 pr-3 py-2.5 border-b border-border/60";

/** Empty detail hint when no run is selected. */
export const experimentsRunDetailEmptyClass =
  "flex flex-1 items-center justify-center px-4 py-8";

/** @deprecated Split shell — Execution now uses flush list + row expand. */
export const experimentsRunsSplitShellClass = "min-w-0";

/** @deprecated Accordion expand chrome — use experimentsRunDetailPanelClass. */
export const experimentsRunExpandedClass = experimentsRunDetailPanelClass;

/** Research-brief excerpt block under the title (functional read-only surface). */
export const experimentsBriefBoxClass =
  "rounded-md border border-border/60 bg-muted/30 px-3 py-2.5 space-y-2";

/** Pills for brief-linked section names (distinct from experiment tags). */
export const experimentsBriefSectionPillClass =
  "inline-flex shrink-0 items-center rounded-full border border-dashed border-border/70 bg-background/50 px-2 py-0.5 text-[length:var(--font-size-11)] text-muted-foreground";

/** Metadata label | value — fixed label column; labels vertically centered with values. */
export const experimentsMetadataRowClass =
  "grid grid-cols-[5.25rem_minmax(0,1fr)] items-center gap-x-3 py-1.5";

export const experimentsMetadataLabelClass =
  "text-[length:var(--font-size-11)] text-muted-foreground/65";

/** Section header row — keeps Overview / Environment titles aligned (h-6). */
export const experimentsSectionHeaderRowClass =
  "flex h-6 items-center justify-between gap-2";

/**
 * Browse grid — fill the pane width with fluid columns
 * (`minmax` tracks grow instead of fixed 1/2/3 that leave empty gutters).
 */
export const experimentsGridClass =
  "grid w-full min-w-0 gap-3 [grid-template-columns:repeat(auto-fill,minmax(15rem,1fr))]";

/** Flat experiment card — quiet chrome; hover is fill-only (no border flash). */
export const experimentsCardShellClass = cn(
  "flex h-full min-h-[7.5rem] w-full flex-col rounded-md border border-border/50 bg-card p-3 text-left shadow-none",
  "transition-colors hover:bg-muted",
  "focus-visible:outline-none focus-visible:bg-accent",
);

export const experimentsCardTitleClass =
  "line-clamp-2 font-sans text-[length:var(--font-size-13)] font-medium leading-snug text-foreground";

export const experimentsCardMetaClass =
  "font-sans text-[length:var(--font-size-11)] text-muted-foreground/70";

/** Command input surface — must read as editable, not chrome decoration. */
export const experimentsCommandInputClass = cn(
  "min-h-[4.5rem] w-full resize-none rounded-none border-0 shadow-none",
  "bg-muted/35 px-3 py-2.5 leading-relaxed",
  "placeholder:text-muted-foreground/55",
  "focus-visible:bg-muted/45 focus-visible:ring-0",
);

export function formatExperimentRelativeTime(iso: string | null): string {
  if (!iso) return i18n.t("experiments.runs.noRunsYet");
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return iso;
  const diff = Date.now() - parsed;
  const min = Math.floor(diff / 60000);
  if (min < 1) return i18n.t("experiments.relativeTime.justNow");
  if (min < 60) return i18n.t("experiments.relativeTime.minutesAgo", { count: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return i18n.t("experiments.relativeTime.hoursAgo", { count: hr });
  const day = Math.floor(hr / 24);
  return day < 7
    ? i18n.t("experiments.relativeTime.daysAgo", { count: day })
    : new Date(parsed).toLocaleDateString();
}

export function experimentLabBasename(workspacePath: string): string {
  const parts = workspacePath.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] ?? workspacePath;
}
