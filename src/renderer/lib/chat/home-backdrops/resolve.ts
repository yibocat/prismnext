import type { ThemePackId } from "@/lib/theme/theme-packs";
import {
  CHAT_HOME_BACKDROP_STYLES,
  THEME_PACK_HOME_BACKDROP,
  type ChatHomeBackdropSetting,
  type ChatHomeBackdropStyle,
} from "./types";

/**
 * Resolve which backdrop (if any) to show on the empty chat homepage.
 * Returns `null` when the backdrop should be hidden.
 */
export function resolveChatHomeBackdrop(
  setting: ChatHomeBackdropSetting | undefined,
  enabled: boolean | undefined,
  themePack: ThemePackId,
): ChatHomeBackdropStyle | null {
  if (enabled === false) return null;

  let choice = setting ?? "auto";
  // Legacy persisted values.
  if ((choice as string) === "dot-grid" || (choice as string) === "contour") {
    choice = "blueprint";
  }
  if (
    (choice as string) === "none" ||
    (choice as string) === "waves" ||
    (choice as string) === "grain" ||
    (choice as string) === "scatter" ||
    (choice as string) === "coffee" ||
    (choice as string) === "window" ||
    (choice as string) === "typewriter" ||
    (choice as string) === "cat" ||
    (choice as string) === "inkdrop" ||
    (choice as string) === "axes"
  ) {
    choice = "auto";
  }
  if (choice === "auto") {
    const packDefault = THEME_PACK_HOME_BACKDROP[themePack];
    if (packDefault === "none" || packDefault === "auto") return null;
    return packDefault;
  }
  if (choice === "none") return null;
  return choice;
}

/** Next backdrop style in display order (wraps). Resolves `auto` / disabled via theme pack. */
export function cycleChatBackdrop(
  setting: ChatHomeBackdropSetting | undefined,
  enabled: boolean | undefined,
  themePack: ThemePackId,
): ChatHomeBackdropStyle {
  const current =
    enabled === false
      ? resolveChatHomeBackdrop("auto", true, themePack)
      : resolveChatHomeBackdrop(setting, true, themePack);
  const idx = current ? CHAT_HOME_BACKDROP_STYLES.indexOf(current) : -1;
  const safe = idx < 0 ? 0 : idx;
  return CHAT_HOME_BACKDROP_STYLES[(safe + 1) % CHAT_HOME_BACKDROP_STYLES.length];
}
