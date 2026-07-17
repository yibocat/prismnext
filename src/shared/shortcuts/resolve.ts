import { getShortcutDef } from "./registry";
import type { ShortcutChord, ShortcutDef, ShortcutOverrides } from "./types";

export type ResolvedChord = {
  def: ShortcutDef;
  chord: ShortcutChord;
  isCustom: boolean;
};

/**
 * Resolve the effective chord for an id.
 * Overrides apply only when `def.remappable === true`.
 */
export function resolveChord(
  id: string,
  overrides?: ShortcutOverrides | null,
): ResolvedChord | null {
  const def = getShortcutDef(id);
  if (!def) return null;

  const override = overrides?.[id];
  if (def.remappable && override && typeof override.key === "string") {
    return { def, chord: override, isCustom: true };
  }

  return { def, chord: def.defaultChord, isCustom: false };
}
