import { useEffect, useRef, useCallback } from "react";
import { useLayoutStore } from "@/stores/layout-store";
import { useDocumentStore } from "@/stores/document-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useCompileStore, compileCurrentDocument } from "@/stores/compile-store";
import { resolveCompileTarget } from "@/lib/resolve-tex-root";

/**
 * Centralized hook for all texworkspace-specific logic.
 *
 * Previously, `tab.kind === "texworkspace"` checks were scattered across
 * right-area, right-main-area, right-sidebar, files-sidebar, editor, and
 * content router. This hook consolidates:
 *
 * - isActive: whether the current tab is a texworkspace tab
 * - viewMode: split / tex / pdf
 * - setViewMode: toggle between view modes
 * - setActiveFile: switch the active file without changing tab title
 * - autoOpenMainFile: resolve and open the main .tex file on initial entry
 */
export function useTexworkspace() {
  const tabs = useRightPanelStore((s) => s.tabs);
  const activeTabId = useRightPanelStore((s) => s.activeTabId);
  const setTexworkspaceActiveFile = useRightPanelStore((s) => s.setTexworkspaceActiveFile);
  const switchToTexworkspace = useRightPanelStore((s) => s.switchToTexworkspace);

  const texworkspaceViewMode = useLayoutStore((s) => s.texworkspaceViewMode);
  const setTexworkspaceViewMode = useLayoutStore((s) => s.setTexworkspaceViewMode);

  const files = useDocumentStore((s) => s.files);
  const fileContents = useDocumentStore((s) => s.fileContents);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const isActive = activeTab?.kind === "texworkspace";

  // ─── Auto-open main .tex file on initial entry ───
  const autoOpened = useRef(false);
  useEffect(() => {
    if (!activeTab || activeTab.kind !== "texworkspace" || !activeTab.isInitial) return;
    if (autoOpened.current) return;
    autoOpened.current = true;

    const firstTex = files.find((f) => f.name.endsWith(".tex"));
    const resolved = resolveCompileTarget(
      firstTex?.id ?? "",
      files,
      (id) => fileContents.get(id)?.content ?? "",
    );
    if (resolved?.rootId) {
      setTexworkspaceActiveFile(resolved.rootId);
      // Auto-compile the main file when entering texworkspace
      if (useCompileStore.getState().autoCompile) {
        // Delay to let the store settle (setActiveFile is synchronous but
        // the editor/viewer mount may need a frame)
        setTimeout(() => compileCurrentDocument(), 100);
      }
    }
  }, [activeTab, files, fileContents, setTexworkspaceActiveFile]);

  // ─── Compile completion → switch to texworkspace tab ───
  // This was previously in right-main-area.tsx
  const compileFile = isActive ? activeTab.fileId : null;

  return {
    /** Whether the currently active tab is a texworkspace tab */
    isActive,
    /** The active texworkspace tab, or undefined */
    activeTab: isActive ? activeTab : undefined,
    /** Current view mode: "split" | "tex" | "pdf" */
    viewMode: texworkspaceViewMode,
    /** Switch between split / tex / pdf view modes */
    setViewMode: setTexworkspaceViewMode,
    /** Switch the active file within the texworkspace tab, keeping the title fixed */
    setActiveFile: setTexworkspaceActiveFile,
    /** Switch to texworkspace tab (creates one if needed) and open a file */
    switchToFile: switchToTexworkspace,
    /** The active file ID for compilation, or null */
    compileFile,
  } as const;
}

/**
 * Shorthand for components that only need to check if the current tab is
 * a texworkspace tab (e.g., conditional rendering).
 */
export function useIsTexworkspace() {
  const tabs = useRightPanelStore((s) => s.tabs);
  const activeTabId = useRightPanelStore((s) => s.activeTabId);
  const activeTab = tabs.find((t) => t.id === activeTabId);
  return activeTab?.kind === "texworkspace";
}
