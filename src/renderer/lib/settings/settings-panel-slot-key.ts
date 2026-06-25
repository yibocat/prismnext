import type { SettingsPanelSlot } from "./settings-panel-slots";

/** Stable identity for matching / deduping settings editor tabs. */
export function settingsPanelSlotKey(slot: SettingsPanelSlot): string {
  return JSON.stringify(slot);
}
