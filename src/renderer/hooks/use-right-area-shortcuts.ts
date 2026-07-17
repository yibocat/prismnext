import { useEffect } from "react";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useDocumentStore } from "@/stores/document-store";
import { useLayoutStore } from "@/stores/layout-store";
import { useGitStore } from "@/stores/git-store";
import { useSettingsStore } from "@/stores/settings-store";
import { modeRegistry } from "@/lib/workspace/mode-registry";
import {
  chordMatchesEvent,
  detectShortcutPlatform,
  resolveChord,
} from "../../shared/shortcuts";

function matchesShortcut(id: string, e: KeyboardEvent): boolean {
  const overrides = useSettingsStore.getState().settings.shortcutOverrides;
  const resolved = resolveChord(id, overrides);
  if (!resolved) return false;
  return chordMatchesEvent(resolved.chord, e, detectShortcutPlatform());
}

/** Right-panel keyboard shortcuts — scoped to `[data-right-area]`. */
export function useRightAreaShortcuts(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    const isInRightArea = (target: EventTarget | null) =>
      target instanceof Element && !!target.closest("[data-right-area]");

    const onKeyDown = (e: KeyboardEvent) => {
      if (!isInRightArea(e.target)) return;

      const rp = useRightPanelStore.getState();
      const activeTab = rp.tabs.find((t) => t.id === rp.activeTabId);
      const focusedMode = useLayoutStore.getState().focusedMode;

      if (!activeTab) return;

      if (matchesShortcut("workspace.gitRefresh", e) && focusedMode === "git") {
        const gitRoot = useGitStore.getState().unitRoot
          ?? useDocumentStore.getState().projectRoot;
        if (gitRoot && useGitStore.getState().isGitRepo) {
          e.preventDefault();
          const sidebarView = useGitStore.getState().sidebarView;
          if (sidebarView === "history") {
            void useGitStore.getState().loadHistory(gitRoot);
          } else {
            void useGitStore.getState().forceRefreshStatus(gitRoot);
            void useGitStore.getState().refreshBranches(gitRoot);
          }
        }
        return;
      }

      if (
        (matchesShortcut("workspace.nextTab", e) || matchesShortcut("workspace.prevTab", e))
        && focusedMode !== "dashboard"
      ) {
        const modeTabs = rp.tabs.filter((t) => {
          const def = modeRegistry.findByTabKind(t.kind);
          if (def?.id !== focusedMode) return false;
          if (t.isInitial) return false;
          return true;
        });
        if (modeTabs.length < 2) return;
        e.preventDefault();
        const idx = Math.max(0, modeTabs.findIndex((t) => t.id === rp.activeTabId));
        const nextIdx = matchesShortcut("workspace.prevTab", e)
          ? (idx - 1 + modeTabs.length) % modeTabs.length
          : (idx + 1) % modeTabs.length;
        rp.setActiveTab(modeTabs[nextIdx].id);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
