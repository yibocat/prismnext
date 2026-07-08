/**
 * Experiments detail + runs list chrome — shared typography and layout tokens.
 * Mirrors `literature-list-chrome.ts` and `git-change-row-chrome.tsx`.
 */

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

/** Runs list column header row (static — no sticky; avoids covering AiBar z-10). */
export const experimentsRunsListHeaderShellClass =
  "shrink-0 h-[var(--height-right-area-subtoolbar)] bg-muted/20 border-b border-border/60 px-3";

export const experimentsRunsListHeaderLabelClass =
  "font-sans text-[length:var(--font-size-11)] font-medium tracking-[0.01em] text-muted-foreground/75";

/** Row body text — scales with UI font setting. */
export const experimentsRunRowTextClass =
  "font-sans text-[length:var(--font-toolbar-tab)]";

/** Bordered runs table shell. */
export const experimentsRunsTableShellClass =
  "overflow-hidden rounded-md border border-border/60";

/** Unified command + live output console (Execution section). */
export const experimentsRunConsoleShellClass =
  "overflow-hidden rounded-md border border-border/60 bg-background/80";

/** Expanded run detail padding. */
export const experimentsRunExpandedClass =
  "border-b border-border/40 bg-muted/20 px-3 py-2.5 space-y-2 last:border-b-0";

/** Research-brief excerpt block under the title (functional read-only surface). */
export const experimentsBriefBoxClass =
  "rounded-md border border-border/60 bg-muted/30 px-3 py-2.5 space-y-2";

/** Pills for brief-linked section names (distinct from experiment tags). */
export const experimentsBriefSectionPillClass =
  "inline-flex shrink-0 items-center rounded-full border border-dashed border-border/70 bg-background/50 px-2 py-0.5 text-[length:var(--font-size-11)] text-muted-foreground";

/** Metadata label | value — fixed label column for side-by-side Overview / Environment. */
export const experimentsMetadataRowClass =
  "grid grid-cols-[5.25rem_minmax(0,1fr)] items-baseline gap-x-3 py-1.5";

export const experimentsMetadataLabelClass =
  "text-[length:var(--font-size-11)] text-muted-foreground/65";

/** Section header row — keeps Overview / Environment titles aligned (h-6). */
export const experimentsSectionHeaderRowClass =
  "flex h-6 items-center justify-between gap-2";

/** Browse grid — up to 3 columns on large panes. */
export const experimentsGridClass =
  "grid min-w-0 gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";

/** Experiment summary card on the browse grid. */
export const experimentsCardShellClass =
  "flex min-h-[7.5rem] flex-col rounded-md border border-border/60 bg-background/80 p-3 text-left transition-colors hover:border-border hover:bg-accent/30";

export const experimentsCardTitleClass =
  "line-clamp-2 text-[length:var(--font-size-13)] font-medium leading-snug text-foreground";

export const experimentsCardMetaClass =
  "text-[length:var(--font-size-11)] text-muted-foreground/70";

export function formatExperimentRelativeTime(iso: string | null): string {
  if (!iso) return "No runs yet";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return day < 7 ? `${day}d ago` : new Date(t).toLocaleDateString();
}

export function experimentLabBasename(workspacePath: string): string {
  const parts = workspacePath.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] ?? workspacePath;
}
