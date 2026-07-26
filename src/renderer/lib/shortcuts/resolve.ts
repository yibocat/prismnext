import { i18n } from "@/lib/i18n";
import { useSettingsStore } from "@/stores/settings-store";
import {
  chordMatchesEvent,
  detectShortcutPlatform,
  formatChord,
  resolveChord,
  type ShortcutChord,
  type ShortcutOverrides,
} from "../../../shared/shortcuts";

export type ResolvedShortcut = {
  id: string;
  label: string;
  chord: ShortcutChord;
  chordLabel: string;
  tooltip: string;
  isCustom: boolean;
  remappable: boolean;
  implemented: boolean;
  category: string;
  labelKey: string;
};

function readOverrides(): ShortcutOverrides {
  const raw = useSettingsStore.getState().settings.shortcutOverrides;
  if (!raw || typeof raw !== "object") return {};
  return raw as ShortcutOverrides;
}

/** Resolve shortcut for UI (label + chord + tooltip). */
export function resolveShortcut(id: string): ResolvedShortcut | null {
  const resolved = resolveChord(id, readOverrides());
  if (!resolved) return null;

  const platform = detectShortcutPlatform(
    typeof window !== "undefined" ? (window.electronAPI?.platform ?? "darwin") : "darwin",
  );
  const chordLabel = formatChord(resolved.chord, platform);
  const label = i18n.t(resolved.def.labelKey);
  return {
    id: resolved.def.id,
    label,
    chord: resolved.chord,
    chordLabel,
    tooltip: `${label} (${chordLabel})`,
    isCustom: resolved.isCustom,
    remappable: resolved.def.remappable,
    implemented: resolved.def.implemented !== false,
    category: resolved.def.category,
    labelKey: resolved.def.labelKey,
  };
}

/** `title` / tooltip string: "Action (⌘K)". Falls back to id if missing. */
export function shortcutTooltip(id: string): string {
  return resolveShortcut(id)?.tooltip ?? id;
}

export function shortcutChordLabel(id: string): string {
  return resolveShortcut(id)?.chordLabel ?? "";
}

/** Whether a keyboard event matches the resolved chord for `id` (incl. overrides). */
export function matchesShortcutEvent(id: string, e: KeyboardEvent): boolean {
  const resolved = resolveChord(id, readOverrides());
  if (!resolved) return false;
  const platform = detectShortcutPlatform(
    typeof window !== "undefined" ? (window.electronAPI?.platform ?? "darwin") : "darwin",
  );
  return chordMatchesEvent(resolved.chord, e, platform);
}
