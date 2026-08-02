/**
 * Derive RightArea “which modes are open / focused” from tabs only.
 * There is no writable activeModes / focusedMode — tabs + activeTabId are truth.
 */
import { useRightPanelStore } from "@/stores/right-panel-store";
import type { RightToolbarTab } from "@/stores/layout-store";
import { modeRegistry, type RightTab } from "@/lib/workspace/mode-registry";

export type FocusedModeId = RightToolbarTab | "dashboard";

export function modeIdOfTab(tab: RightTab): string | undefined {
  return modeRegistry.findByTabKind(tab.kind)?.id;
}

/** Unique mode ids that currently have ≥1 tab (order = first appearance in tabs). */
export function activeModeIds(tabs: RightTab[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tab of tabs) {
    const id = modeIdOfTab(tab);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function hasMode(tabs: RightTab[], modeId: string): boolean {
  return tabs.some((t) => modeIdOfTab(t) === modeId);
}

export function focusedModeId(
  tabs: RightTab[],
  activeTabId: string | null,
): FocusedModeId {
  if (!activeTabId) return "dashboard";
  const tab = tabs.find((t) => t.id === activeTabId);
  if (!tab) return "dashboard";
  const id = modeIdOfTab(tab);
  return (id as RightToolbarTab | undefined) ?? "dashboard";
}

export function countTabsByMode(tabs: RightTab[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const tab of tabs) {
    const id = modeIdOfTab(tab);
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

/**
 * Fire ModeDefinition onActivate / onDeactivate on 0→1 / 1→0 tab transitions.
 * Call after any tabs array replacement (or wire via store subscribe).
 */
export function notifyModeLifecycleTransitions(
  prevTabs: RightTab[],
  nextTabs: RightTab[],
): void {
  if (prevTabs === nextTabs) return;
  const prev = countTabsByMode(prevTabs);
  const next = countTabsByMode(nextTabs);
  const modeIds = new Set<string>([...prev.keys(), ...next.keys()]);
  for (const modeId of modeIds) {
    const before = prev.get(modeId) ?? 0;
    const after = next.get(modeId) ?? 0;
    if (before === 0 && after > 0) {
      modeRegistry.get(modeId)?.onActivate?.();
    } else if (before > 0 && after === 0) {
      modeRegistry.get(modeId)?.onDeactivate?.();
    }
  }
}

export function useFocusedModeId(): FocusedModeId {
  return useRightPanelStore((s) => focusedModeId(s.tabs, s.activeTabId));
}

export function useHasMode(modeId: string): boolean {
  return useRightPanelStore((s) => hasMode(s.tabs, modeId));
}

export function useActiveModeIds(): string[] {
  return useRightPanelStore((s) => activeModeIds(s.tabs));
}
