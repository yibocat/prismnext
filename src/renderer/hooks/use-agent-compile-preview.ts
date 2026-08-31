import { useEffect } from "react";
import { compileDesktop } from "@/lib/desktop-api/compile";
import {
  setCompileDiagnosticsForKey,
  setPdfBytesForKey,
} from "@/stores/compile-store";
import { useDocumentStore } from "@/stores/document-store";
import type { CompileArtifactKey } from "@shared/compile/artifact-key";

/**
 * When the agent compiles (`latex-compile` / `typst-compile`), main pushes PDF
 * bytes (or errors) here so an already-open Files preview stays in sync
 * without Cmd+Enter. Does not steal RightArea or force the PDF pane open.
 * Standalone figures still get keyed diagnostics for the Files error strip;
 * their PDF bytes are not written here.
 */
export function useAgentCompilePreview(): void {
  useEffect(() => {
    const unsubscribe = compileDesktop.onCompileAgentComplete((data) => {
      const projectRoot = useDocumentStore.getState().projectRoot;
      const eventRoot = data.projectRoot || data.projectDir;
      if (!projectRoot || projectRoot !== eventRoot) return;

      const compileRoot = data.compileRoot || data.mainFile || data.sourceFile || "";
      const engine = data.engine ?? "latex";
      const key: CompileArtifactKey | null = compileRoot
        ? data.route === "standalone"
          ? {
              projectRoot: eventRoot,
              engine,
              route: "standalone",
              sourceFile: data.sourceFile || compileRoot,
            }
          : {
              projectRoot: eventRoot,
              engine,
              route: "paper",
              compileRoot,
            }
        : null;

      if (key) {
        setCompileDiagnosticsForKey(key, {
          error: data.success ? null : (data.error || "Compilation failed"),
          log: data.logTail || null,
          structuredErrors: data.success
            ? []
            : (data.errors ?? []).map((e) => ({
                file: e.file,
                line: e.line,
                message: e.message,
                severity: "error" as const,
              })),
        });
      }

      if (data.route === "standalone") {
        return;
      }

      if (data.success && data.pdfBytes && key) {
        const buf = data.pdfBytes.slice(0) as ArrayBuffer;
        setPdfBytesForKey(key, new Uint8Array(buf));
      }
    });

    return unsubscribe;
  }, []);
}
