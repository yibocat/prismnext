/** Panel width at or above this is considered expanded (persisted width writes). */
export const PANEL_COLLAPSE_THRESHOLD_PX = 30;

/**
 * Hit target for react-resizable-panels Separators.
 * Must match CSS `after:-left-px after:-right-px` (1px each side + 1px line ≈ 3px).
 * The library expands the 1px line to this size; keep it tight so scrollbars
 * and the chat turn rail stay clickable.
 */
export const PANEL_RESIZE_HIT = { fine: 4, coarse: 6 } as const;

/**
 * Left sidebar shell sash only. Wider than PANEL_RESIZE_HIT so the line is
 * grabable without sitting on a scrollbar or the chat turn rail.
 * CSS fringe must stay in sync: 3px + 1px line + 3px = 7px (fine: 8).
 */
export const LEFT_SIDEBAR_RESIZE_HIT = { fine: 8, coarse: 10 } as const;

const PANEL_SASH_HIT_FRINGE =
  "after:absolute after:inset-y-0 after:-left-px after:-right-px";

const LEFT_SIDEBAR_SASH_HIT_FRINGE =
  "after:absolute after:inset-y-0 after:-left-[3px] after:-right-[3px]";

/** Hover/active — same on left and RightArea so the grab line actually lights up. */
const PANEL_SASH_HOVER = "hover:bg-border active:bg-foreground/25";

/** Shared resize sash chrome — line color supplied per surface via CSS vars. */
const PANEL_SASH_BASE = `w-px transition-colors outline-none cursor-col-resize shrink-0 relative z-10 ${PANEL_SASH_HIT_FRINGE}`;

const LEFT_SIDEBAR_SASH_BASE = `w-px transition-colors outline-none cursor-col-resize shrink-0 relative z-20 ${LEFT_SIDEBAR_SASH_HIT_FRINGE}`;

/**
 * Shared 1px sash chrome: custom `ShellSash` and WorkspaceSplit's RRP Separator.
 * WorkspaceSplit groups should set `disableCursor` so the library does not inject
 * `ew-resize !important` (that fought CSS `col-resize`).
 */
export const PANEL_SASH_SEPARATOR_CLASS = `${PANEL_SASH_BASE} bg-[var(--shell-edge-line)] ${PANEL_SASH_HOVER}`;

/** Left nav shell sash — mixes with sidebar surface; pair with `SHELL_SASH_SHADOW_RIGHT_CLASS` when open. */
export const LEFT_SIDEBAR_SASH_SEPARATOR_CLASS = `${LEFT_SIDEBAR_SASH_BASE} bg-[var(--sidebar-edge-line)] ${PANEL_SASH_HOVER}`;

/** RightArea mode sidebar drag sash — tight hit like other inner sashes; same hover. */
export const MODE_SIDEBAR_SASH_CLASS = `${PANEL_SASH_BASE} bg-[var(--sidebar-edge-line)] ${PANEL_SASH_HOVER}`;

/** Drop shadow on a sash toward the main canvas (left sidebar open). */
export const SHELL_SASH_SHADOW_RIGHT_CLASS = "shell-sash-shadow-right";

/** Drop shadow on a sash toward the center pane (RightArea open). */
export const SHELL_SASH_SHADOW_LEFT_CLASS = "shell-sash-shadow-left";

/** WorkspaceSplit right pane below this % is treated as collapsed (drag-to-close). */
export const WORKSPACE_SPLIT_COLLAPSE_PERCENT = 8;

/** WorkspaceSplit right pane above this % re-opens after drag (hysteresis). */
export const WORKSPACE_SPLIT_EXPAND_PERCENT = 12;

/** Left sidebar treated as fully collapsed at or below this width. */
export const SIDEBAR_FULLY_COLLAPSED_PX = 0.5;

/** Click toggle only — sash drag stays unanimated. */
export const LEFT_SIDEBAR_TOGGLE_MS = 220;

/** Same curve as the left sidebar — programmatic RightArea open/close only. */
export const RIGHT_AREA_TOGGLE_MS = LEFT_SIDEBAR_TOGGLE_MS;
