import type { ShortcutChord, ShortcutPlatform } from "./types";

function normalizeKeyLabel(key: string): string {
  if (key === " ") return "Space";
  if (key === "Escape") return "Esc";
  if (key === "ArrowUp") return "↑";
  if (key === "ArrowDown") return "↓";
  if (key === "ArrowLeft") return "←";
  if (key === "ArrowRight") return "→";
  if (key === "Enter") return "↵";
  if (key.length === 1) return key.toUpperCase();
  return key;
}

/** Modifier + key segments for Kbd chips / Settings (platform-aware). */
export function chordDisplayParts(
  chord: ShortcutChord,
  platform: ShortcutPlatform = "darwin",
): string[] {
  const parts: string[] = [];
  const isMac = platform === "darwin";

  if (chord.primary) {
    parts.push(isMac ? "⌘" : "Ctrl");
  }
  if (chord.ctrl && !(chord.primary && !isMac)) {
    // On non-mac, primary already rendered as Ctrl — skip duplicate.
    if (isMac || !chord.primary) parts.push(isMac ? "⌃" : "Ctrl");
  }
  if (chord.alt) parts.push(isMac ? "⌥" : "Alt");
  if (chord.shift) parts.push(isMac ? "⇧" : "Shift");
  if (chord.meta && !chord.primary) parts.push("⌘");

  parts.push(normalizeKeyLabel(chord.key));
  return parts;
}

/** Human-readable chord for tooltips / Settings (platform-aware). */
export function formatChord(
  chord: ShortcutChord,
  platform: ShortcutPlatform = "darwin",
): string {
  const parts = chordDisplayParts(chord, platform);
  return platform === "darwin" ? parts.join("") : parts.join("+");
}

export function detectShortcutPlatform(
  platform: NodeJS.Platform | string = typeof process !== "undefined" ? process.platform : "darwin",
): ShortcutPlatform {
  if (platform === "darwin") return "darwin";
  if (platform === "win32") return "win32";
  return "linux";
}
