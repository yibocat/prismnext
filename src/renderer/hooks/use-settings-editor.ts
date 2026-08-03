import { useEffect, useRef } from "react";
import { useRightPanelStore } from "@/stores/right-panel-store";
import type { RightTab } from "@/lib/workspace/mode-registry";
import type { SettingsPanelSlot } from "@/lib/settings/settings-panel-slots";

const SETTINGS_TAB_KIND = "settings-editor" as const;

export function isSettingsEditorTab(tab: RightTab): boolean {
  return tab.kind === SETTINGS_TAB_KIND;
}

export function partitionRightTabs(tabs: RightTab[]): {
  settingsTabs: RightTab[];
  workspaceTabs: RightTab[];
} {
  const settingsTabs: RightTab[] = [];
  const workspaceTabs: RightTab[] = [];
  for (const tab of tabs) {
    if (isSettingsEditorTab(tab)) settingsTabs.push(tab);
    else workspaceTabs.push(tab);
  }
  return { settingsTabs, workspaceTabs };
}

/** Active tab id constrained to the visible surface (settings vs workspace). */
export function resolveSurfaceActiveTabId(
  surfaceTabs: RightTab[],
  activeTabId: string | null,
): string | null {
  if (surfaceTabs.length === 0) return null;
  if (activeTabId && surfaceTabs.some((t) => t.id === activeTabId)) return activeTabId;
  return surfaceTabs[surfaceTabs.length - 1]?.id ?? null;
}

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
