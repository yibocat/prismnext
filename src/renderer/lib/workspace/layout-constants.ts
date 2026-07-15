/** Panel width at or above this is considered expanded (persisted width writes). */
export const PANEL_COLLAPSE_THRESHOLD_PX = 30;

/** Mode sidebar (RightArea L2) sash — 1px line + extended hit area (matches L1/L3). */
export const MODE_SIDEBAR_SASH_CLASS =
  "w-px bg-border hover:bg-foreground/30 active:bg-foreground/40 transition-colors outline-none cursor-col-resize shrink-0 relative z-10 after:absolute after:inset-y-0 after:-left-3 after:-right-3";

/** App shell + WorkspaceSplit panel sash (react-resizable-panels Separator). */
export const PANEL_SASH_SEPARATOR_CLASS =
  "w-px bg-border hover:bg-foreground/30 active:bg-foreground/40 transition-colors outline-none cursor-col-resize shrink-0 relative after:absolute after:inset-y-0 after:-left-3 after:-right-3";

/** WorkspaceSplit right pane below this % is treated as collapsed (drag-to-close). */
export const WORKSPACE_SPLIT_COLLAPSE_PERCENT = 8;

/** WorkspaceSplit right pane above this % re-opens after drag (hysteresis). */
export const WORKSPACE_SPLIT_EXPAND_PERCENT = 12;

/** Center panel below this width triggers chat-first maximize (user drag only). */
export const CENTER_MAXIMIZE_THRESHOLD_PX = 20;

/** Left sidebar treated as fully collapsed at or below this width. */
export const SIDEBAR_FULLY_COLLAPSED_PX = 0.5;

/**
 * Imperative resize sentinel — fill remaining space in the panel group.
 * react-resizable-panels treats large values as "take all remaining space".
 */
export const RESIZE_FILL_PX = 9999;

/** Margin below canSplit min-sum so narrow-collapse trips slightly early. */
export const SPLIT_MARGIN_PX = 40;
