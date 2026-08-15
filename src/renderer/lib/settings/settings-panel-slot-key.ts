import type { SettingsPanelSlot } from "./settings-panel-slots";

/** Stable identity for matching / deduping settings editor tabs. */
export function settingsPanelSlotKey(slot: SettingsPanelSlot): string {
  // One Research Brief tab — focusSection is ephemeral UX, not a new tab.
  if (slot.kind === "research-brief") return JSON.stringify({ kind: "research-brief" });
  // Title is display-only; hangar tabs must not fork when i18n/title updates.
  if (slot.kind === "team-detail") {
    return JSON.stringify({ kind: "team-detail", teamId: slot.teamId });
  }
  // One create-team editor; initial scope is form state, not a new tab.
  if (slot.kind === "team-create") {
    return JSON.stringify({ kind: "team-create" });
  }
  return JSON.stringify(slot);
}
