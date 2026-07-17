import type { ShortcutChord } from "./types";

/**
 * Map a registry chord to a CodeMirror 6 keymap key string
 * (e.g. `{ key: "f", primary: true, shift: true }` → `"Mod-Shift-f"`).
 */
export function chordToCodeMirrorKey(chord: ShortcutChord): string {
  const parts: string[] = [];
  if (chord.primary) parts.push("Mod");
  if (chord.ctrl) parts.push("Ctrl");
  if (chord.alt) parts.push("Alt");
  if (chord.shift) parts.push("Shift");
  if (chord.meta && !chord.primary) parts.push("Meta");

  const raw = chord.key === "Esc" ? "Escape" : chord.key;
  const key = raw.length === 1 ? raw.toLowerCase() : raw;
  parts.push(key);
  return parts.join("-");
}
