/**
 * Shared layout tokens for Settings card surfaces.
 * Select dropdown chrome lives in `@/components/ui/app-select`.
 */
export const SETTINGS_CARD = "rounded-lg border border-border px-4 divide-y divide-border";
export const SETTINGS_ROW = "flex items-center justify-between gap-3 py-2.5";
export const SETTINGS_ROW_LABEL = "text-[length:var(--font-size-13)] font-medium";
export const SETTINGS_ROW_DESC = "text-[length:var(--font-size-12)] text-muted-foreground mt-0.5";

export const SETTINGS_CATEGORY_HEADER =
  "text-[length:var(--font-size-12)] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-1";
export const SETTINGS_RESET_ICON =
  "opacity-0 group-hover:opacity-100 transition-opacity shrink-0 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground";
/** Same chrome as {@link SETTINGS_RESET_ICON}, always visible (e.g. form field labels). */
export const SETTINGS_LABEL_RESET_ICON =
  "shrink-0 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors";

/** Right-area detail editor — same horizontal rhythm as settings pages (px-8), full panel width. */
export const SETTINGS_DETAIL_SHELL = "w-full px-8 py-8 space-y-6";
export const SETTINGS_DETAIL_SECTION = "space-y-4";
export const SETTINGS_FORM_FIELD = "space-y-1.5";
export const SETTINGS_DETAIL_ACTIONS = "flex flex-wrap items-center gap-2";

/** Dialog-height controls for detail-panel forms. */
export const SETTINGS_FORM_INPUT = "!h-8 !text-[length:var(--font-size-12)]";
export const SETTINGS_FORM_INPUT_MONO = "!h-8 !text-[length:var(--font-size-12)] font-mono";
export const SETTINGS_FORM_TEXTAREA =
  "!min-h-[7rem] !text-[length:var(--font-size-13)] leading-relaxed resize-y";

export const SETTINGS_STEPPER =
  "inline-flex items-center border border-input bg-background rounded-md h-6";
export const SETTINGS_STEPPER_BTN = "rounded-none h-full hover:bg-transparent [&_svg]:size-3";

export { appSelectTriggerWideClass as SETTINGS_TRIGGER } from "@/components/ui/app-select";
