import type { SettingsPanelSlot } from "./settings-panel-slots";

/** Stable identity for matching / deduping settings editor tabs. */
export function settingsPanelSlotKey(slot: SettingsPanelSlot): string {
  // One Research Brief tab — focusSection is ephemeral UX, not a new tab.
  if (slot.kind === "research-brief") return JSON.stringify({ kind: "research-brief" });
  return JSON.stringify(slot);
}
