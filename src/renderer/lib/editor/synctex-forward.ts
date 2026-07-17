import type { Command } from "@codemirror/view";
import type { SynctexForwardResult } from "@/types/electron";
import { useCompileStore } from "@/stores/compile-store";
import { useDocumentStore } from "@/stores/document-store";

/**
 * Forward SyncTeX from the current editor cursor line → PDF highlight request.
 * No-op when project/file/IPC unavailable.
 */
export function createSynctexForwardCommand(filePath: string): Command {
  return (view) => {
    const projectRoot = useDocumentStore.getState().projectRoot;
    if (!projectRoot || !filePath) return false;

    const line = view.state.doc.lineAt(view.state.selection.main.head).number;
    void window.electronAPI
      .compileSynctexForward(projectRoot, filePath, line)
      .then((result: SynctexForwardResult | null) => {
        if (!result) return;
        useCompileStore.getState().requestSynctexForward(result);
      })
      .catch(() => {
        /* SyncTeX optional — ignore when build/index missing */
      });
    return true;
  };
}
