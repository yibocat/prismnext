import type { ShortcutChord, ShortcutPlatform } from "./types";

function eventKeyNormalized(key: string): string {
  if (key === "Esc") return "Escape";
  if (key.length === 1) return key.toLowerCase();
  return key;
}

function chordKeyNormalized(key: string): string {
  if (key === "Esc") return "Escape";
  if (key === "↵" || key === "Return") return "Enter";
  if (key.length === 1) return key.toLowerCase();
  return key;
}

function matchesChordKey(
  chord: ShortcutChord,
  event: Pick<KeyboardEvent, "key" | "code" | "altKey">,
): boolean {
  const want = chordKeyNormalized(chord.key);
  const got = eventKeyNormalized(event.key);

  if (want === "\\" || want === "backslash") {
    return got === "\\" || event.code === "Backslash";
  }
  if (want === "`" || want === "backquote") {
    return got === "`" || event.code === "Backquote";
  }

  // Digit chords must use `code` when Shift is held — `key` becomes @ # $ % ^ etc.
  if (/^[0-9]$/.test(want)) {
    return event.code === `Digit${want}` || got === want;
  }

  // Option/Alt + letter: macOS remaps `key` (e.g. ⌥P → "π"); match physical key.
  if (/^[a-z]$/.test(want) && event.altKey) {
    return event.code === `Key${want.toUpperCase()}` || got === want;
  }

  return got === want;
}

/**
 * Whether a keyboard event matches the chord on the given platform.
 * `primary` → metaKey on darwin, ctrlKey on win/linux.
 * Absolute `ctrl` (without primary) is Control on macOS; on win/linux it is the
 * same physical key as `primary` (both require ctrlKey).
 */
export function chordMatchesEvent(
  chord: ShortcutChord,
  event: Pick<KeyboardEvent, "key" | "code" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">,
  platform: ShortcutPlatform = "darwin",
): boolean {
  const isMac = platform === "darwin";
  const wantPrimary = Boolean(chord.primary);
  const wantShift = Boolean(chord.shift);
  const wantAlt = Boolean(chord.alt);
  const wantCtrl = Boolean(chord.ctrl);
  const wantMeta = Boolean(chord.meta) && !wantPrimary;

  if (wantShift !== event.shiftKey) return false;
  if (wantAlt !== event.altKey) return false;

  if (isMac) {
    const hasPrimary = event.metaKey;
    if (wantPrimary !== hasPrimary) return false;
    if (wantCtrl !== event.ctrlKey) return false;
    if (!wantPrimary && wantMeta !== event.metaKey) return false;
  } else {
    // Win/Linux: primary and absolute ctrl share the Control key.
    const needsCtrl = wantPrimary || wantCtrl;
    if (needsCtrl !== event.ctrlKey) return false;
    if (wantMeta !== event.metaKey) return false;
  }

  return matchesChordKey(chord, event);
}
