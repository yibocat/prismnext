import { useEffect, useRef } from "react";
import { useRightPanelStore } from "@/stores/right-panel-store";
import type { SettingsPanelSlot } from "@/lib/settings/settings-panel-slots";

export function hasOpenSettingsEditor(): boolean {
  return useRightPanelStore
    .getState()
    .tabs.some((t) => t.kind === "settings-editor");
}

export function closeAllSettingsEditorTabs(): void {
  const store = useRightPanelStore.getState();
  for (const tab of store.tabs.filter((t) => t.kind === "settings-editor")) {
    store.closeTab(tab.id);
  }
}

/** Active tab when it is a settings editor; otherwise null. */
export function useActiveSettingsEditorSlot(): SettingsPanelSlot | null {
  return useRightPanelStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    if (tab?.kind === "settings-editor" && tab.settingsSlot) return tab.settingsSlot;
    return null;
  });
}

/** First open settings-editor tab payload (any tab, not only active). */
export function useOpenSettingsEditorSlot(): SettingsPanelSlot | null {
  return useRightPanelStore((s) => {
    const tab = s.tabs.find((t) => t.kind === "settings-editor" && t.settingsSlot);
    return tab?.settingsSlot ?? null;
  });
}

export function useSettingsEditorSlotOfKind<K extends SettingsPanelSlot["kind"]>(
  kind: K,
): Extract<SettingsPanelSlot, { kind: K }> | null {
  return useRightPanelStore((s) => {
    const tab = s.tabs.find(
      (t) => t.kind === "settings-editor" && t.settingsSlot?.kind === kind,
    );
    return (tab?.settingsSlot as Extract<SettingsPanelSlot, { kind: K }>) ?? null;
  });
}

export function useHasSettingsEditorOfKinds(
  kinds: readonly SettingsPanelSlot["kind"][],
): boolean {
  const kindSet = new Set(kinds);
  return useRightPanelStore((s) =>
    s.tabs.some(
      (t) =>
        t.kind === "settings-editor" &&
        t.settingsSlot &&
        kindSet.has(t.settingsSlot.kind),
    ),
  );
}

/** Reload list data when a matching settings editor tab is closed. */
export function useOnSettingsEditorKindsClosed(
  kinds: readonly SettingsPanelSlot["kind"][],
  onClosed: () => void,
): void {
  const open = useHasSettingsEditorOfKinds(kinds);
  const prevOpenRef = useRef(open);
  useEffect(() => {
    if (prevOpenRef.current && !open) {
      onClosed();
    }
    prevOpenRef.current = open;
  }, [open, onClosed]);
}
