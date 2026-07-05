import { useEffect } from "react";
import { useCompileStore } from "@/stores/compile-store";
import { useDocumentStore } from "@/stores/document-store";
import { useLayoutStore } from "@/stores/layout-store";
import { useRightPanelStore } from "@/stores/right-panel-store";

/**
 * When the agent calls `latex-compile`, main pushes PDF bytes (or errors) here
 * so Tex workspace preview stays in sync without Cmd+Enter.
 */
export function useAgentCompilePreview(): void {
  useEffect(() => {
    const unsubscribe = window.electronAPI.onCompileAgentComplete((data) => {
      const projectRoot = useDocumentStore.getState().projectRoot;
      if (!projectRoot || projectRoot !== data.projectDir) return;

      const compileStore = useCompileStore.getState();

      if (data.success && data.pdfBytes) {
        const buf = data.pdfBytes.slice(0) as ArrayBuffer;
        compileStore.setPdfData(new Uint8Array(buf), data.projectDir);
        useCompileStore.setState({
          compileError: null,
          compileLog: data.logTail || null,
        });
      } else {
        useCompileStore.setState({
          compileError: data.error || "Compilation failed",
          compileLog: data.logTail || null,
        });
      }

      const { tabs, activeTabId } = useRightPanelStore.getState();
      const activeTab = tabs.find((t) => t.id === activeTabId);
      if (activeTab?.kind !== "texworkspace") return;

      const layout = useLayoutStore.getState();
      if (data.success) {
        if (layout.texworkspaceViewMode === "tex") {
          layout.setTexworkspaceViewMode("split");
        }
        layout.setTexworkspaceProblemsOpen(false);
      } else if (data.error || data.logTail) {
        if (layout.texworkspaceViewMode === "tex") {
          layout.setTexworkspaceViewMode("split");
        }
        layout.setTexworkspaceProblemsOpen(true);
      }
    });

    return unsubscribe;
  }, []);
}
