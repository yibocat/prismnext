import { ICON_TINTS, isIconTint, type IconTint } from "../platform/icon-spec";

/** User-facing session row chrome persisted in app settings (not session JSON). */

export const SESSION_ICON_COLORS = ICON_TINTS;

export type SessionIconColor = IconTint;

export interface SessionIconConfig {
  kind?: "emoji" | "lucide";
  value?: string;
  /** @deprecated Phase 4 lucide-only `{ name }` */
  name?: string;
  /** Lucide stroke only — ignored for emoji. */
  color?: SessionIconColor;
}

export function normalizeSessionIconConfig(
  icon?: SessionIconConfig | null,
): { kind: "emoji" | "lucide"; value: string; color?: SessionIconColor } | null {
  if (!icon) return null;
  if (icon.kind === "emoji") {
    const value = icon.value?.trim() ?? "";
    if (!value || value.length > 16) return null;
    return { kind: "emoji", value };
  }
  const lucideName = (icon.kind === "lucide" ? icon.value : icon.name)?.trim() ?? "";
  if (!lucideName) return null;
  const color = icon.color && icon.color !== "default" && isIconTint(icon.color)
    ? icon.color
    : undefined;
  return { kind: "lucide", value: lucideName, color };
}

export interface SessionChromeEntry {
  icon?: SessionIconConfig | null;
  unread?: boolean;
}

export type SessionChromeByProject = Record<string, Record<string, SessionChromeEntry>>;
