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

/** Row highlight — outline only (border changes hit box and blocks adjacent rows). */
export const literatureRowPdfDropPendingClass =
  "rounded-sm bg-primary/[0.03] outline outline-2 outline-dashed outline-primary/45 outline-offset-[-2px]";

export const literatureRowPdfDropReadyClass =
  "rounded-sm bg-primary/[0.06] outline outline-2 outline-dashed outline-primary outline-offset-[-2px]";

/** Library drop zone while dragging files over the panel. */
export const literatureLibraryPdfDropZoneClass =
  "border-2 border-dashed border-primary/40 transition-[border-color] duration-150";

export const literaturePanelExpandedDetailClass = "bg-background border-b border-border/60";

/** Column layout — checkbox trailing (Git-style); Authors left of Publication.
 *  Progressive disclosure via `@container` on the library root (see literature-library.tsx). */
export const LITERATURE_COL_EXTRACT = "w-5 shrink-0 flex items-center justify-start";
export const LITERATURE_COL_CHECK = "ml-auto shrink-0 flex items-center justify-center";
export const LITERATURE_COL_YEAR = "w-11 shrink-0 text-muted-foreground";
export const LITERATURE_COL_TITLE = "min-w-0 flex-1 @lg:flex-[4]";
export const LITERATURE_COL_AUTHORS =
  "hidden @md:block w-[6.5rem] @xl:w-[8.5rem] shrink-0 min-w-0 truncate text-muted-foreground";
export const LITERATURE_COL_VENUE =
  "hidden @lg:block min-w-0 flex-[3] truncate text-muted-foreground";
/** Journal labels — reserved (not user tags). */
export const LITERATURE_COL_VENUE_LABELS =
  "hidden @2xl:block w-16 shrink-0 min-w-0 truncate text-muted-foreground/45";
export const LITERATURE_COL_CREATED =
  "hidden @2xl:block w-[6.5rem] shrink-0 min-w-0 truncate text-muted-foreground tabular-nums";
export const LITERATURE_COL_UPDATED =
  "hidden @3xl:block w-[6.5rem] shrink-0 min-w-0 truncate text-muted-foreground tabular-nums";

/** Detail panel pill — system + user tags share base chrome. */
export const literatureDetailBadgeClass =
  "inline-flex shrink-0 items-center rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[length:var(--font-size-11)] text-muted-foreground";

export const literatureDetailBadgeAddClass =
  "inline-flex shrink-0 items-center rounded-full border border-dashed border-border/70 bg-transparent px-2 py-0.5 text-[length:var(--font-size-11)] text-muted-foreground/80 hover:border-border hover:bg-muted/30 hover:text-muted-foreground transition-colors";

/** Zotero sync badge on list rows — hide when the title column is tight. */
export const literatureRowZoteroBadgeClass =
  "hidden @lg:inline-flex shrink-0 rounded px-1 py-0.5 text-[length:var(--font-size-10)] font-medium bg-primary/10 text-primary/70";

/** Primary action in entry panel footer — matches Git commit button shell. */
export const literaturePrimaryActionShellClass =
  "flex shrink-0 items-stretch h-6 rounded-md overflow-hidden bg-primary text-primary-foreground text-[length:var(--font-menu-item)] font-medium shadow-sm";

export const literaturePrimaryActionBtnClass =
  "flex items-center gap-1 px-2 transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none";

/** Paired read actions in entry panel footer — Open PDF, Open Markdown, Extract text. */
export const literatureReadActionBtnClass =
  "inline-flex shrink-0 items-center gap-1 h-7 px-2 rounded-md border border-border/55 bg-background text-[length:var(--font-menu-item)] text-foreground/90 transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50";

export const literatureReadActionDestructiveBtnClass =
  "inline-flex shrink-0 items-center gap-1 h-7 px-2 rounded-md border border-destructive/35 bg-background text-[length:var(--font-menu-item)] text-destructive transition-colors hover:bg-destructive/10 disabled:pointer-events-none disabled:opacity-50";

/** Hover affordance for click-to-edit idle values — border inside box (no ring; avoids clip in flex rows). */
export const literatureInlineIdleClass =
  "box-border w-full min-w-0 rounded-[3px] border border-transparent px-1 py-0.5 cursor-text hover:border-border/55 transition-colors";

/** Metadata grid label — Zotero info pane style. */
export const literatureMetadataLabelClass =
  "pt-0.5 text-[length:var(--font-size-11)] text-muted-foreground/55";
