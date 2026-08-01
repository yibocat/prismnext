import type { ThemePackId } from "@/lib/theme/theme-packs";

/** Concrete backdrop styles (renderable). */
export type ChatHomeBackdropStyle =
  | "academic"
  | "origami"
  | "rain"
  | "forest"
  | "blueprint"
  | "starfield"
  | "circuit"
  | "bookshelf"
  | "ink"
  | "clips"
  | "paperplane"
  | "stamp"
  | "pendulum"
  | "constellation";

/** User-facing setting — `auto` follows the active theme pack default. */
export type ChatHomeBackdropSetting = "auto" | "none" | ChatHomeBackdropStyle;

export const CHAT_HOME_BACKDROP_STYLES: ChatHomeBackdropStyle[] = [
  "academic",
  "origami",
  "rain",
  "forest",
  "blueprint",
  "starfield",
  "circuit",
  "bookshelf",
  "ink",
  "clips",
  "paperplane",
  "stamp",
  "pendulum",
  "constellation",
];

export const CHAT_HOME_BACKDROP_SETTINGS: ChatHomeBackdropSetting[] = [
  "auto",
  "none",
  ...CHAT_HOME_BACKDROP_STYLES,
];

/** Default backdrop per theme pack when setting is `auto`. */
export const THEME_PACK_HOME_BACKDROP: Record<ThemePackId, ChatHomeBackdropSetting> = {
  academic: "academic",
  "warm-paper": "origami",
  midnight: "rain",
  forest: "forest",
  graphite: "blueprint",
};
