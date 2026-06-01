import { useCallback } from "react";
import { useDocumentStore } from "@/stores/document-store";
import type { SynctexForwardResult } from "@/types/electron";

/**
 * Bidirectional SyncTeX hook for TeX → PDF navigation.
 *
 * Must be used inside a Lector <Root> component — forwardSearch calls
 * usePdfJump().jumpToPage(), which requires the PDF store context.
 */
export function useSyncTex() {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const files = useDocumentStore((s) => s.files);
  const activeFileId = useDocumentStore((s) => s.activeFileId);
  const setActiveFile = useDocumentStore((s) => s.setActiveFile);
  const requestJumpToPosition = useDocumentStore((s) => s.requestJumpToPosition);

  /**
   * Forward search: editor cursor position → PDF highlight.
   * Returns the SynctexForwardResult so the caller can create highlight rects.
   */
  const forwardSearch = useCallback(
    async (currentLine: number): Promise<SynctexForwardResult | null> => {
      if (!projectRoot) return null;
      const activeFile = files.find((f) => f.id === activeFileId);
      if (!activeFile) return null;

      try {
        return await window.electronAPI.compileSynctexForward(
          projectRoot,
          activeFile.relativePath,
          currentLine + 1, // SyncTeX uses 1-based lines
        );
      } catch {
        return null;
      }
    },
    [projectRoot, files, activeFileId],
  );

  /**
   * Reverse search: PDF click position → editor jump.
   * Finds the source file and line corresponding to a PDF coordinate.
   */
  const reverseSearch = useCallback(
    async (page: number, x: number, y: number) => {
      if (!projectRoot) return;

      try {
        const result = await window.electronAPI.compileSynctex(
          projectRoot,
          page,
          x,
          y,
        );
        if (!result) return;

        // Find matching file in project
        const targetFile = files.find((f) => f.relativePath === result.file);
        if (targetFile) {
          // Switch to the target file and jump to the line
          setActiveFile(targetFile.id);
          // Small delay to let the editor mount before jumping
          setTimeout(() => {
            requestJumpToPosition(result.line);
          }, 100);
        }
      } catch {
        // SyncTeX file not found or parse error — silently ignore
      }
    },
    [projectRoot, files, setActiveFile, requestJumpToPosition],
  );

  return { forwardSearch, reverseSearch };
}
