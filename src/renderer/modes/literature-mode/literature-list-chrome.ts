/** Proportional UI font — not monospace (git panel size token only). */
export const literatureRowTextClass =
  "font-sans text-[length:var(--font-toolbar-tab)]";

export const literatureRowShellClass =
  "flex items-center gap-3 px-3 h-[var(--height-right-area-subtoolbar)] shrink-0 min-w-0 box-border border-b border-border/60 cursor-pointer";

export const literatureListHeaderClass =
  "flex items-center gap-3 px-3 shrink-0 h-[var(--height-right-area-subtoolbar)] bg-background border-b border-border/50 sticky top-0 z-20";

/** Finder-style header labels: small, medium weight, muted. */
export const literatureListHeaderLabelClass =
  "font-sans text-[length:var(--font-size-11)] font-medium tracking-[0.01em]";

export const literatureListBodyClass = "flex flex-col";

/** Row wrapper — shell + optional expanded detail (borders live on shell/detail, not here). */
export const literatureListRowClass = "flex flex-col";

/** Expanded entry row sticks below the list header. */
export const literaturePanelExpandedRowStickyClass =
  "sticky top-[var(--height-right-area-subtoolbar)] z-10 border-b border-border/40 bg-background";

/** Expanded detail shell (min-height set in JS to fill scroll viewport). */
export const literaturePanelExpandedDetailClass = "bg-background border-b border-border/60";

/** Column layout — checkbox trailing (Git-style); Authors left of Publication.
 *  Progressive disclosure via `@container` on the library root (see literature-library.tsx). */
export const LITERATURE_COL_CHECK = "ml-auto shrink-0 flex items-center justify-center";
export const LITERATURE_COL_YEAR = "w-11 shrink-0 text-muted-foreground";
export const LITERATURE_COL_TITLE = "min-w-0 flex-1 @lg:flex-[4]";
export const LITERATURE_COL_AUTHORS =
  "hidden @md:block w-[6.5rem] @xl:w-[8.5rem] shrink-0 min-w-0 truncate text-muted-foreground";
export const LITERATURE_COL_VENUE =
  "hidden @lg:block min-w-0 flex-[3] truncate text-muted-foreground";
/** Journal labels — placeholder column until tagging ships. */
export const LITERATURE_COL_VENUE_LABELS =
  "hidden @2xl:block w-16 shrink-0 min-w-0 truncate text-muted-foreground/45";

/** Zotero sync badge on list rows — hide when the title column is tight. */
export const literatureRowZoteroBadgeClass =
  "hidden @lg:inline-flex shrink-0 rounded px-1 py-0.5 text-[length:var(--font-size-10)] font-medium bg-primary/10 text-primary/70";

/** Primary action in entry panel footer — matches Git commit button shell. */
export const literaturePrimaryActionShellClass =
  "flex shrink-0 items-stretch h-6 rounded-md overflow-hidden bg-primary text-primary-foreground text-[length:var(--font-menu-item)] font-medium shadow-sm";

export const literaturePrimaryActionBtnClass =
  "flex items-center gap-1 px-2 transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none";

/** Hover affordance for click-to-edit idle values. */
export const literatureInlineIdleClass =
  "rounded-[3px] px-1 -mx-1 py-0.5 cursor-text hover:ring-1 hover:ring-border/30 transition-shadow";

/** Metadata grid label — Zotero info pane style. */
export const literatureMetadataLabelClass =
  "pt-0.5 text-[length:var(--font-size-11)] text-muted-foreground/55";
