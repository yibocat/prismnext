import { useEffect } from "react";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useDocumentStore } from "@/stores/document-store";
import { useLayoutStore } from "@/stores/layout-store";
import { useGitStore } from "@/stores/git-store";
import { modeRegistry } from "@/lib/workspace/mode-registry";

/** Right-panel keyboard shortcuts — scoped to `[data-right-area]`. Cmd+W is app-wide via menu IPC. */
export function useRightAreaShortcuts(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    const isInRightArea = (target: EventTarget | null) =>
      target instanceof Element && !!target.closest("[data-right-area]");

    const onKeyDown = (e: KeyboardEvent) => {
      if (!isInRightArea(e.target)) return;

      const mod = e.metaKey || e.ctrlKey;
      const rp = useRightPanelStore.getState();
      const activeTab = rp.tabs.find((t) => t.id === rp.activeTabId);
      const focusedMode = useLayoutStore.getState().focusedMode;

      if (mod && e.key === "s" && !e.shiftKey && !e.altKey && activeTab) {
        const fileId = activeTab.fileId;
        if (
          fileId &&
          (activeTab.kind === "file" || activeTab.kind === "texworkspace") &&
          useDocumentStore.getState().isFileDirty(fileId)
        ) {
          e.preventDefault();
          void useDocumentStore.getState().saveFile(fileId);
        }
        return;
      }

      if (!activeTab) return;

      if (
        mod &&
        e.key === "r" &&
        !e.shiftKey &&
        !e.altKey &&
        focusedMode === "git"
      ) {
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

      if (mod && e.key === "Tab" && !e.altKey && focusedMode !== "dashboard") {
        const modeTabs = rp.tabs.filter((t) => {
          const def = modeRegistry.findByTabKind(t.kind);
          if (def?.id !== focusedMode) return false;
          if (t.isInitial) return false;
          return true;
        });
        if (modeTabs.length < 2) return;
        e.preventDefault();
        const idx = Math.max(0, modeTabs.findIndex((t) => t.id === rp.activeTabId));
        const nextIdx = e.shiftKey
          ? (idx - 1 + modeTabs.length) % modeTabs.length
          : (idx + 1) % modeTabs.length;
        rp.setActiveTab(modeTabs[nextIdx].id);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
