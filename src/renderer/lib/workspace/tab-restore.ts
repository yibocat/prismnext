import { useRightPanelStore } from "@/stores/right-panel-store";
import { useDocumentStore } from "@/stores/document-store";
import { takeTabArchiveForRoot } from "@/lib/workspace/tab-archive";

/**
 * Re-open a project's archived working set after its file tree is on screen.
 *
 * Ordering matters: callers must run this AFTER `applyDocumentTree` so
 * `openFile` finds the file in the metadata (its content loads lazily from the
 * archived path). Terminal tabs are re-created via `openTerminalAtCwd` — the
 * PTY itself died with the close, and the terminal view spawns a fresh shell
 * with the same tabId/cwd on mount.
 */
export function restoreArchivedTabs(projectRoot: string): void {
  const archive = takeTabArchiveForRoot(projectRoot);
  if (!archive || archive.tabs.length === 0) return;

  const panel = useRightPanelStore.getState();
  const restoredIds: string[] = [];
  let activeId: string | null = null;

  for (const [index, tab] of archive.tabs.entries()) {
    let id: string | null = null;
    try {
      switch (tab.kind) {
        case "file":
        case "research-plan": {
          if (!tab.fileId && !tab.filePath) break;
          const name = tab.title || (tab.filePath ?? tab.fileId ?? "").split("/").pop() || "file";
          const before = new Set(panel.tabs.map((t) => t.id));
          panel.openFile(tab.fileId ?? tab.filePath!, tab.filePath ?? tab.fileId!, name, {
            pin: true,
            isExternal: tab.isExternal,
          });
          const after = useRightPanelStore.getState().tabs;
          id = after.find((t) => !before.has(t.id))?.id
            ?? after.find((t) => t.kind === tab.kind && (("fileId" in t && t.fileId === tab.fileId) || ("filePath" in t && t.filePath === tab.filePath)))?.id
            ?? null;
          // Keep the archived view mode when the tab was re-created.
          if (id && tab.viewMode) {
            useRightPanelStore.setState((s) => ({
              tabs: s.tabs.map((t) => (t.id === id ? { ...t, viewMode: tab.viewMode } : t)),
            }));
          }
          break;
        }
        case "browser": {
          if (!tab.url) break;
          panel.ensureTab("browser");
          const browser = useRightPanelStore
            .getState()
            .tabs.find((t) => t.kind === "browser");
          if (browser) {
            id = browser.id;
            useRightPanelStore.setState((s) => ({
              tabs: s.tabs.map((t) =>
                t.id === id ? { ...t, url: tab.url, title: tab.title } : t,
              ),
            }));
          }
          break;
        }
        case "git-overview":
          id = panel.ensureTab("git-overview");
          break;
        case "git-diff": {
          if (!tab.filePath) break;
          panel.openGitDiff(tab.filePath);
          id = useRightPanelStore
            .getState()
            .tabs.find((t) => t.kind === "git-diff" && t.filePath === tab.filePath)?.id ?? null;
          break;
        }
        case "terminal": {
          if (tab.terminalSource !== "user") break;
          // Must resolve against the NEW root — archived cwd may be the old
          // checkout; the project root prefix is what matters.
          const cwd = tab.terminalCwd || projectRoot;
          id = panel.openTerminalAtCwd(cwd, tab.title);
          break;
        }
        case "literature": {
          if (!tab.literaturePaperId) break;
          id = panel.openLiteraturePaper(
            tab.literaturePaperId,
            tab.title,
            tab.literatureView ?? "reader",
          );
          break;
        }
        case "experiments": {
          if (tab.experimentId) {
            id = panel.openExperimentTab(tab.experimentId, tab.title);
          } else {
            id = panel.activateExperimentsHomeTab();
          }
          break;
        }
        case "interaction": {
          if (!tab.interactionId) break;
          id = panel.openInteractionTab(tab.interactionId, tab.title);
          break;
        }
        case "settings-editor":
          break; // app-level, not project data
      }
    } catch {
      // One broken tab must not block the rest of the restore.
    }
    if (id) {
      restoredIds.push(id);
      if (index === archive.activeIndex) activeId = id;
    }
  }

  if (activeId) {
    useRightPanelStore.setState({ activeTabId: activeId });
  } else if (restoredIds.length > 0) {
    useRightPanelStore.setState({ activeTabId: restoredIds[0]! });
  }
  void useDocumentStore.getState().setActiveFile;
}
