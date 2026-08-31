/**
 * Typst client: live SVG (`typst watch`) + one-shot PDF/export (`typst compile`).
 *
 * Not compile-store: no 150ms LaTeX debounce, no Zap auto-compile, no TeX live-pass loop.
 * Typing flushes buffers into the main `typst watch` session and patches pages.
 * Play / toolbar PDF / export are a separate oneshot CLI.
 */

import { create } from "zustand";
import {
  diagnosticsFromCompileLog,
  paperKeyFromMainFile,
} from "@/lib/compile/compile-artifact";
import { resolveCompilePreviewOpen } from "@/lib/compile/compile-split";
import { compileDesktop } from "@/lib/desktop-api/compile";
import { fsDesktop } from "@/lib/desktop-api/fs";
import { isTypstStandaloneRel, resolveTypstRootFromBuffers } from "@/lib/typst/resolve-typst-root";
import {
  compileArtifactCacheKey,
  compileEngineFromRelPath,
  type CompileArtifactKey,
} from "@shared/compile/artifact-key";
import type { TypstCliFormat } from "@shared/compile/typst-format";
import {
  getPdfBytesForKey,
  setCompileDiagnosticsForKey,
  setPdfBytesForKey,
  useCompileStore,
} from "./compile-store";
import { useDocumentStore } from "./document-store";
import { useLayoutStore } from "./layout-store";
import { useWorkspaceConfigStore } from "./workspace-config-store";

const _svgPagesCache = new Map<string, string[]>();
let _inFlight = false;
let _pending = false;
let _pdfInFlight = false;

interface TypstLiveState {
  revision: number;
}

export const useTypstLiveStore = create<TypstLiveState>(() => ({
  revision: 0,
}));

export function getTypstLivePages(key: CompileArtifactKey): string[] | undefined {
  return _svgPagesCache.get(compileArtifactCacheKey(key));
}

export function resetTypstLiveStore(): void {
  _svgPagesCache.clear();
  _inFlight = false;
  _pending = false;
  _pdfInFlight = false;
  useTypstLiveStore.setState({ revision: 0 });
}

function resolveTypstLiveMainRel(hintRel?: string): string | null {
  const doc = useDocumentStore.getState();
  const { files, activeFileId } = doc;
  const active = files.find((f) => f.id === activeFileId);
  const rel = (hintRel ?? active?.relativePath ?? "").replace(/\\/g, "/");
  if (!rel || compileEngineFromRelPath(rel) !== "typst") return null;
  const manuscript = useWorkspaceConfigStore.getState().manuscriptConfig;
  const manuscriptDir = manuscript?.dir ?? null;
  if (isTypstStandaloneRel(rel, manuscriptDir)) return rel;
  return (
    resolveTypstRootFromBuffers({
      files,
      getContent: (path) => {
        const f = files.find((x) => x.relativePath.replace(/\\/g, "/") === path.replace(/\\/g, "/"));
        return f ? doc.getAsset(f.id) : "";
      },
      manuscriptDir,
      mainFilePin: manuscript?.mainFile ?? null,
      hintRel: rel,
    }) ?? rel
  );
}

function isTypstLivePaneOpen(fileId: string, fileRel: string): boolean {
  const layout = useLayoutStore.getState();
  const previewOpen = resolveCompilePreviewOpen(layout.compilePreviewOpenByFileId[fileId], fileRel);
  const kind = layout.typstPreviewKindByFileId[fileId] ?? "live";
  return previewOpen && kind !== "pdf";
}

async function runTypstLive(mainFile: string, allowCleanStart: boolean): Promise<void> {
  if (_inFlight) {
    _pending = true;
    return;
  }
  const doc = useDocumentStore.getState();
  const projectRoot = doc.projectRoot;
  if (!projectRoot) return;
  const snapshot = doc.getLiveCompilePayload();
  const key = paperKeyFromMainFile(projectRoot, mainFile);
  const cacheKey = compileArtifactCacheKey(key);
  if (!allowCleanStart && snapshot.dirtyFiles.length === 0 && (_svgPagesCache.get(cacheKey)?.length ?? 0) > 0) {
    return;
  }

  _inFlight = true;
  try {
    const result = await compileDesktop.compileTypstLive(projectRoot, mainFile, {
      dirtyFiles: snapshot.dirtyFiles.length > 0 ? snapshot.dirtyFiles : undefined,
    });
    if ("svgPages" in result && result.svgPages) {
      _svgPagesCache.set(cacheKey, result.svgPages);
      if (snapshot.dirtyFiles.length > 0) {
        doc.markCompiledClean(snapshot.dirtyFiles);
      }
      setCompileDiagnosticsForKey(key, { error: null, log: null, structuredErrors: [] });
      useTypstLiveStore.setState((s) => ({
        revision: s.revision + 1,
      }));
    } else if ("error" in result) {
      setCompileDiagnosticsForKey(
        key,
        diagnosticsFromCompileLog(mainFile, result.error, result.stdout ?? null),
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
    _inFlight = false;
    if (_pending) {
      _pending = false;
      const latest = resolveTypstLiveMainRel();
      if (latest) void runTypstLive(latest, false);
    }
  }
}

/** Immediate. No LaTeX debounce, no Zap gate. */
export function scheduleTypstLive(fileId?: string, fileRel?: string): void {
  if (fileId && fileRel && !isTypstLivePaneOpen(fileId, fileRel)) return;
  const mainFile = resolveTypstLiveMainRel(fileRel);
  if (!mainFile) return;
  void runTypstLive(mainFile, false);
}

export function ensureTypstLive(mainFile: string): void {
  const projectRoot = useDocumentStore.getState().projectRoot;
  if (!projectRoot) return;
  const key = paperKeyFromMainFile(projectRoot, mainFile);
  if ((_svgPagesCache.get(compileArtifactCacheKey(key))?.length ?? 0) > 0) return;
  void runTypstLive(mainFile, true);
}

/**
 * One-shot `typst compile` → Lector PDF cache.
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

export async function exportTypst(format: TypstCliFormat): Promise<void> {
  const projectRoot = useDocumentStore.getState().projectRoot;
  const targetPath = resolveTypstLiveMainRel();
  if (!projectRoot || !targetPath) return;
  const snapshot = useDocumentStore.getState().getLiveCompilePayload();
  const result = await compileDesktop.compileTypstExport(projectRoot, targetPath, format, {
    dirtyFiles: snapshot.dirtyFiles.length > 0 ? snapshot.dirtyFiles : undefined,
  });
  if ("ok" in result && result.ok === false) {
    setCompileDiagnosticsForKey(
      paperKeyFromMainFile(projectRoot, targetPath),
      diagnosticsFromCompileLog(targetPath, result.error, result.stdout ?? null),
    );
  }
}
