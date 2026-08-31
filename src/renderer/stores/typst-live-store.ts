/**
 * Typst oneshot PDF / export (`tinymist compile`).
 * Live preview is Tinymist (`typst-session-store`), not this store.
 * Not compile-store: no 150ms LaTeX debounce, no Zap auto-compile, no TeX live-pass loop.
 */

import { diagnosticsFromCompileLog, paperKeyFromMainFile } from "@/lib/compile/compile-artifact";
import { compileDesktop } from "@/lib/desktop-api/compile";
import { fsDesktop } from "@/lib/desktop-api/fs";
import { resolveTypstLiveMainRelFromState } from "@/lib/typst/resolve-typst-root";
import { compileArtifactCacheKey, compileEngineFromRelPath } from "@shared/compile/artifact-key";
import type { TypstCliFormat } from "@shared/compile/typst-format";
import {
  getPdfBytesForKey,
  setCompileDiagnosticsForKey,
  setPdfBytesForKey,
  useCompileStore,
} from "./compile-store";
import { useDocumentStore } from "./document-store";
import { useWorkspaceConfigStore } from "./workspace-config-store";

let _pdfInFlight = false;

export function resetTypstLiveStore(): void {
  _pdfInFlight = false;
}

function resolveTypstLiveMainRel(hintRel?: string): string | null {
  const doc = useDocumentStore.getState();
  const { files, activeFileId } = doc;
  const active = files.find((f) => f.id === activeFileId);
  const rel = (hintRel ?? active?.relativePath ?? "").replace(/\\/g, "/");
  if (!rel || compileEngineFromRelPath(rel) !== "typst") return null;
  const manuscript = useWorkspaceConfigStore.getState().manuscriptConfig;
  const manuscriptDir = manuscript?.dir ?? null;
  return resolveTypstLiveMainRelFromState({
    files,
    getContent: (path) => {
      const f = files.find((x) => x.relativePath.replace(/\\/g, "/") === path.replace(/\\/g, "/"));
      return f ? doc.getAsset(f.id) : "";
    },
    manuscriptDir,
    mainFilePin: manuscript?.mainFile ?? null,
    hintRel: rel,
  });
}

/**
 * One-shot `tinymist compile` → Lector PDF cache.
 * Play, toolbar PDF, and compileCurrentDocument when the active file is `.typ`.
 */
export async function compileTypstPdf(
  hintRel?: string,
  opts?: { skipIfCached?: boolean },
): Promise<void> {
  const doc = useDocumentStore.getState();
  const projectRoot = doc.projectRoot;
  const mainFile = resolveTypstLiveMainRel(hintRel);
  if (!projectRoot || !mainFile) return;
  const key = paperKeyFromMainFile(projectRoot, mainFile);
  if (opts?.skipIfCached && getPdfBytesForKey(key)) return;
  if (_pdfInFlight) return;

  const snapshot = doc.getLiveCompilePayload();
  _pdfInFlight = true;
  useCompileStore.setState({
    compilingKey: compileArtifactCacheKey(key),
    isCompiling: true,
  });
  try {
    const result = await compileDesktop.compileExecute(projectRoot, mainFile, false, {
      ...(snapshot.dirtyFiles.length > 0 ? { dirtyFiles: snapshot.dirtyFiles } : {}),
      skipSynctex: true,
    });
    if ("pdfBytes" in result && result.pdfBytes) {
      const buf = result.pdfBytes.slice(0) as ArrayBuffer;
      setPdfBytesForKey(key, new Uint8Array(buf));
      if (snapshot.dirtyFiles.length > 0) {
        doc.markCompiledClean(snapshot.dirtyFiles);
      }
      setCompileDiagnosticsForKey(
        key,
        diagnosticsFromCompileLog(mainFile, null, result.stdout ?? null),
      );
    } else if ("pdfPath" in result && result.pdfPath) {
      const { bytes } = await fsDesktop.fsReadBytes(result.pdfPath);
      setPdfBytesForKey(key, new Uint8Array(bytes));
      if (snapshot.dirtyFiles.length > 0) {
        doc.markCompiledClean(snapshot.dirtyFiles);
      }
      setCompileDiagnosticsForKey(
        key,
        diagnosticsFromCompileLog(mainFile, null, result.stdout ?? null),
      );
    } else if ("error" in result) {
      setCompileDiagnosticsForKey(
        key,
        diagnosticsFromCompileLog(mainFile, result.error, result.stdout ?? null),
      );
    } else {
      setCompileDiagnosticsForKey(
        key,
        diagnosticsFromCompileLog(mainFile, "Compilation failed", null),
      );
    }
  } catch (error) {
    setCompileDiagnosticsForKey(
      key,
      diagnosticsFromCompileLog(
        mainFile,
        error instanceof Error ? error.message : String(error),
        null,
      ),
    );
  } finally {
    _pdfInFlight = false;
    useCompileStore.setState({ isCompiling: false, compilingKey: null });
  }
}

export async function exportTypst(format: TypstCliFormat): Promise<{
  ok: boolean;
  files?: string[];
  error?: string;
}> {
  const projectRoot = useDocumentStore.getState().projectRoot;
  const targetPath = resolveTypstLiveMainRel();
  if (!projectRoot || !targetPath) return { ok: false, error: "No Typst file" };
  const snapshot = useDocumentStore.getState().getLiveCompilePayload();
  const result = await compileDesktop.compileTypstExport(projectRoot, targetPath, format, {
    dirtyFiles: snapshot.dirtyFiles.length > 0 ? snapshot.dirtyFiles : undefined,
  });
  if ("canceled" in result && result.canceled) return { ok: false };
  if ("ok" in result && result.ok === false) {
    setCompileDiagnosticsForKey(
      paperKeyFromMainFile(projectRoot, targetPath),
      diagnosticsFromCompileLog(targetPath, result.error, result.stdout ?? null),
    );
    return { ok: false, error: result.error };
  }
  if ("ok" in result && result.ok) {
    return { ok: true, files: result.files };
  }
  return { ok: false, error: "Export failed" };
}
