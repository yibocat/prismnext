// ──── prismnext Behavioral Constants ────
// App-wide configuration: timing, limits, sizes.
// Import from '@/styles/constants' where needed.

/** Auto-save delay after last edit (ms) */
export const AUTO_SAVE_DELAY = 2000;

/** Auto-compile debounce after last save (ms) */
export const AUTO_COMPILE_DEBOUNCE = 2000;

/** Table-of-contents parse debounce (ms) */
export const TOC_PARSE_DEBOUNCE = 300;

/** Copy-to-clipboard feedback duration (ms) */
export const COPY_FEEDBACK_DURATION = 2000;

/** Maximum number of recent projects to keep */
export const MAX_RECENT_PROJECTS = 10;

/** Maximum number of recently opened files to remember */
export const MAX_RECENT_OPENED_FILES = 10;

// ─── Layout ───

export const SIDEBAR_LEFT_DEFAULT = 280;
export const SIDEBAR_LEFT_MIN = 280;
export const SIDEBAR_LEFT_MAX = 520;

/** Window width below which left sidebar uses overlay instead of inline panel */
export const SIDEBAR_OVERLAY_THRESHOLD = 500;

export const SIDEBAR_RIGHT_DEFAULT = 280;
export const SIDEBAR_RIGHT_MIN = 280;
export const SIDEBAR_RIGHT_MAX = 520;

/** Center main area (editor + chat) — narrow enough for side-by-side, wide enough for code */
export const MAIN_AREA_MIN = 400;

export const RIGHT_AREA_DEFAULT = 500;
export const RIGHT_AREA_MIN = 280;
export const RIGHT_AREA_MAX = 1100;

// ─── Z-Index ───

export const Z_BASE = 10;
export const Z_ABOVE = 20;
export const Z_OVERLAY = 50;
export const Z_TOP = 9999;
