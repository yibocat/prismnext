import { icons, type LucideIcon } from "lucide-react";
import {
  SESSION_ICON_COLORS,
  normalizeSessionIconConfig,
  type SessionIconColor,
  type SessionIconConfig,
} from "@shared/chat/session-chrome";
import type { IconSpec } from "@shared/platform/icon-spec";
import { isValidLucideIconName } from "@/lib/workspace/folder-icons";

export type ResolvedSessionIcon =
  | { kind: "emoji"; value: string }
  | { kind: "lucide"; value: string; color: SessionIconColor; Icon: LucideIcon };

/** Persist the picker spec as-is. Do not fall back to a stale draft tint. */
export function sessionIconFromPickerSpec(spec: IconSpec | null): SessionIconConfig | null {
  if (!spec || spec.kind === "image") return null;
  if (spec.kind === "emoji") return { kind: "emoji", value: spec.value };
  return spec.color
    ? { kind: "lucide", value: spec.value, color: spec.color }
    : { kind: "lucide", value: spec.value };
}

export function resolveSessionIcon(icon?: SessionIconConfig | null): ResolvedSessionIcon | null {
  const normalized = normalizeSessionIconConfig(icon);
  if (!normalized) return null;
  if (normalized.kind === "emoji") {
    return { kind: "emoji", value: normalized.value };
  }
  if (!isValidLucideIconName(normalized.value)) return null;
  const Icon = icons[normalized.value] as LucideIcon | undefined;
  if (!Icon) return null;
  const color = normalized.color && (SESSION_ICON_COLORS as readonly string[]).includes(normalized.color)
    ? normalized.color
    : "default";
  return { kind: "lucide", value: normalized.value, color, Icon };
}

export function sessionIconColorClass(color?: SessionIconColor): string {
  switch (color) {
    case "primary":
      return "text-primary";
    case "muted":
      return "text-muted-foreground";
    case "sky":
      return "text-sky-500";
    case "indigo":
      return "text-indigo-500";
    case "violet":
      return "text-violet-500";
    case "emerald":
      return "text-emerald-500";
    case "teal":
      return "text-teal-500";
    case "warning":
      return "text-warning";
    case "orange":
      return "text-orange-500";
    case "destructive":
      return "text-destructive";
    case "rose":
      return "text-rose-500";
    case "pink":
      return "text-pink-500";
    default:
      return "text-foreground";
  }
}

export function sessionIconSwatchClass(color: SessionIconColor): string {
  switch (color) {
    case "primary":
      return "bg-primary";
    case "muted":
      return "bg-muted-foreground";
    case "sky":
      return "bg-sky-500";
    case "indigo":
      return "bg-indigo-500";
    case "violet":
      return "bg-violet-500";
    case "emerald":
      return "bg-emerald-500";
    case "teal":
      return "bg-teal-500";
    case "warning":
      return "bg-warning";
    case "orange":
      return "bg-orange-500";
    case "destructive":
      return "bg-destructive";
    case "rose":
      return "bg-rose-500";
    case "pink":
      return "bg-pink-500";
    default:
      return "bg-foreground";
  }
}
