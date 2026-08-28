import { create } from "zustand";
import { persist } from "zustand/middleware";
import { AUTO_COMPILE_DEBOUNCE, AUTO_COMPILE_SPINNER_MIN_MS, COMPILE_SPINNER_MIN_MS, COMPILE_UI_SPINNER_DELAY_MS } from "@/styles/constants";
import { useDocumentStore } from "./document-store";
import { useWorkspaceConfigStore } from "./workspace-config-store";
import { resolveCompileTarget } from "@/lib/tex/resolve-tex-root";
import { parseLatexLog } from "@/lib/compile/parse-latex-log";
import { isTypstStandaloneRel, resolveTypstRootFromBuffers } from "@/lib/typst/resolve-typst-root";
import { compileDesktop } from "@/lib/desktop-api/compile";
import { fsDesktop } from "@/lib/desktop-api/fs";
import {
  autoCompilePreferenceKey,
  migrateCompileAutoCompilePersist,
  resolveAutoCompileForProjectRoot,
  type CompileAutoCompilePersistV1,
} from "@shared/compile/auto-compile-pref";
import {
  compileArtifactCacheKey,
  compileEngineFromRelPath,
  derivePaperPdfRel,
  deriveStandalonePdfRel,
  type CompileArtifactKey,
} from "@shared/compile/artifact-key";
import { parseTypstLog } from "@shared/compile/typst-log";
import type { TypstCliFormat } from "@shared/compile/typst-format";
import { isRemoteProjectRoot } from "@shared/remote";

// ─── PDF Bytes + Path Cache (outside Zustand state) ───

const _pdfBytesCache = new Map<string, Uint8Array>();
let _currentPdfRootId: string | null = null;
const _svgPagesCache = new Map<string, string[]>();
let _typstLiveTimer: ReturnType<typeof setTimeout> | null = null;
let _typstLiveInFlight = false;
let _typstLivePending = false;

export function paperKeyFromMainFile(projectRoot: string, mainFile: string): CompileArtifactKey {
  const engine = compileEngineFromRelPath(mainFile) ?? "latex";
  const manuscriptDir = useWorkspaceConfigStore.getState().manuscriptConfig?.dir ?? null;
  if (engine === "typst" && isTypstStandaloneRel(mainFile, manuscriptDir)) {
    return {
      projectRoot,
      engine,
      route: "standalone",
      sourceFile: mainFile.replace(/\\/g, "/"),
    };
  }
  return {
    projectRoot,
    engine,
    route: "paper",
    compileRoot: mainFile.replace(/\\/g, "/"),
  };
}

export function getPdfBytesForKey(key: CompileArtifactKey): Uint8Array | undefined {
  return _pdfBytesCache.get(compileArtifactCacheKey(key));
}

export function getTypstLivePages(key: CompileArtifactKey): string[] | undefined {
  return _svgPagesCache.get(compileArtifactCacheKey(key));
}

async function runTypstLiveCompile(
  projectDir: string,
  mainFile: string,
  evenIfClean: boolean,
): Promise<void> {
  if (_typstLiveInFlight) {
    _typstLivePending = true;
    return;
  }
  const docState = useDocumentStore.getState();
  const snapshot = docState.getLiveCompilePayload();
  const key = paperKeyFromMainFile(projectDir, mainFile);
  const cacheKey = compileArtifactCacheKey(key);
  if (!evenIfClean && snapshot.dirtyFiles.length === 0 && (getTypstLivePages(key)?.length ?? 0) > 0) {
    return;
  }

  _typstLiveInFlight = true;
  useCompileStore.setState({ compilingKey: cacheKey });
  try {
    const result = await compileDesktop.compileTypstLive(projectDir, mainFile, {
      dirtyFiles: snapshot.dirtyFiles.length > 0 ? snapshot.dirtyFiles : undefined,
    });
    if ("svgPages" in result && result.svgPages) {
      _svgPagesCache.set(cacheKey, result.svgPages);
      if (snapshot.dirtyFiles.length > 0) {
        docState.markCompiledClean(snapshot.dirtyFiles);
      }
      setCompileDiagnosticsForKey(
        key,
        diagnosticsFromCompileLog(mainFile, null, result.stdout ?? null),
      );
      useCompileStore.setState((s) => ({
        typstLiveRevision: s.typstLiveRevision + 1,
        compilingKey: null,
      }));
    } else if ("error" in result) {
      setCompileDiagnosticsForKey(
        key,
        diagnosticsFromCompileLog(mainFile, result.error, result.stdout ?? null),
      );
      useCompileStore.setState({ compilingKey: null });
    } else {
      useCompileStore.setState({ compilingKey: null });
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
    useCompileStore.setState({ compilingKey: null });
  } finally {
    _typstLiveInFlight = false;
    if (_typstLivePending) {
      _typstLivePending = false;
      const latestRoot = useDocumentStore.getState().projectRoot;
      const latestTarget = resolveUiCompileTargetPath();
      if (latestRoot && latestTarget) {
        void runTypstLiveCompile(latestRoot, latestTarget, true);
      }
    }
  }
}

export function setPdfBytesForKey(key: CompileArtifactKey, data: Uint8Array): void {
  const cacheKey = compileArtifactCacheKey(key);
  const copy = new Uint8Array(
    data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
  );
  _pdfBytesCache.set(cacheKey, copy);
  _currentPdfRootId = cacheKey;
  useCompileStore.setState((s) => ({
    pdfRevision: s.pdfRevision + 1,
    lastCompiledRootId: cacheKey,
    lastCompiledProjectRoot: key.projectRoot,
    lastPaperKey: key.route === "paper" ? key : s.lastPaperKey,
  }));
}

export type CompileProblemEntry = {
  file?: string;
  line?: number;
  message: string;
  severity?: "error" | "warning";
};

export type CompileDiagnostics = {
  error: string | null;
  log: string | null;
  structuredErrors: CompileProblemEntry[];
};

export function setCompileDiagnosticsForKey(
  key: CompileArtifactKey,
  diag: CompileDiagnostics,
): void {
  const cacheKey = compileArtifactCacheKey(key);
  useCompileStore.setState((s) => ({
    diagnosticsByKey: { ...s.diagnosticsByKey, [cacheKey]: diag },
  }));
}

export function diagnosticsFromCompileLog(
  mainFile: string,
  error: string | null,
  log: string | null,
): CompileDiagnostics {
  const engine = compileEngineFromRelPath(mainFile);
  let structuredErrors: CompileProblemEntry[] = [];
  if (engine === "typst") {
    structuredErrors = parseTypstLog(log ?? "").errors.map((e) => ({
      file: e.file,
      line: e.line,
      message: e.message,
      severity: "error" as const,
    }));
  } else {
    structuredErrors = parseLatexLog(log).map((p) => ({
      file: p.file,
      line: p.line,
      message: p.message,
      severity: p.severity,
    }));
  }
  if (error) {
    if (structuredErrors.length === 0) {
      structuredErrors = [{ message: error, severity: "error" }];
    }
  } else {
    structuredErrors = structuredErrors.filter((e) => e.severity === "warning");
  }
  return { error, log, structuredErrors };
}

/** @deprecated latex paper + focused project only. New code must use getPdfBytesForKey. */
export function getPdfBytes(projectRoot: string): Uint8Array | undefined {
  const last = useCompileStore.getState().lastPaperKey;
  if (last && last.projectRoot === projectRoot) {
    return getPdfBytesForKey(last);
  }
  return _pdfBytesCache.get(projectRoot);
}

function joinProjectPath(projectRoot: string, ...parts: string[]): string {
  const sep = projectRoot.includes("\\") ? "\\" : "/";
  const root = projectRoot.replace(/[/\\]+$/, "");
  return [root, ...parts.map((p) => p.replace(/^[/\\]+/, "").replace(/[/\\]+/g, sep))].join(sep);
}

function texStem(relativePath: string): string {
  const base = relativePath.split(/[/\\]/).pop() ?? relativePath;
  return base.replace(/\.tex$/i, "");
}

/** Absolute path of the compile PDF for a manuscript main file. */
export function resolveCompilePdfDiskPath(
  projectRoot: string,
  mainRelativePath: string,
): string {
  return joinProjectPath(
    projectRoot,
    ".workbench",
    "compile",
    `${texStem(mainRelativePath)}.pdf`,
  );
}

let _ensureDiskPdfPromise: Promise<boolean> | null = null;
let _ensureDiskPdfKey: string | null = null;

function paperRelFromManuscript(
  manuscript: { dir: string; mainFile?: string } | null,
): string | null {
  if (!manuscript?.mainFile) return null;
  return `${manuscript.dir}/${manuscript.mainFile}`.replace(/\/+/g, "/");
}

function resolvePaperKeyForProject(projectRoot: string): CompileArtifactKey | null {
  const doc = useDocumentStore.getState();
  const resolved = resolveCompileTarget(doc.activeFileId || "", doc.files, doc.getAsset);
  const manuscript = useWorkspaceConfigStore.getState().manuscriptConfig;
  const compileRoot = resolved?.targetPath ?? paperRelFromManuscript(manuscript);
  if (!compileRoot) return null;
  return paperKeyFromMainFile(projectRoot, compileRoot);
}

export async function ensureCompilePdfForKey(key: CompileArtifactKey): Promise<boolean> {
  if (getPdfBytesForKey(key)) return true;
  if (isRemoteProjectRoot(key.projectRoot)) return false;

  const cacheKey = compileArtifactCacheKey(key);
  if (_ensureDiskPdfPromise && _ensureDiskPdfKey === cacheKey) {
    return _ensureDiskPdfPromise;
  }

  _ensureDiskPdfKey = cacheKey;
  _ensureDiskPdfPromise = (async () => {
    if (getPdfBytesForKey(key)) return true;
    const rel = key.route === "paper"
      ? derivePaperPdfRel(key.engine, key.compileRoot)
      : deriveStandalonePdfRel(key.sourceFile);
    const abs = joinProjectPath(key.projectRoot, ...rel.split("/"));
    try {
      const { bytes } = await fsDesktop.fsReadBytes(abs);
      if (!bytes?.byteLength) return false;
      setPdfBytesForKey(key, new Uint8Array(bytes));
      return true;
    } catch {
      return false;
    }
  })().finally(() => {
    if (_ensureDiskPdfKey === cacheKey) {
      _ensureDiskPdfPromise = null;
      _ensureDiskPdfKey = null;
    }
  });

  return _ensureDiskPdfPromise;
}

/**
 * If memory cache is empty, try loading a previously compiled PDF from
 * `<project>/.workbench/compile/<stem>.pdf`. Remote roots skip disk (laptop
 * path is not the Host compile dir). Returns true when bytes are available.
 */
export async function ensureCompilePdfFromDisk(projectRoot: string): Promise<boolean> {
  if (!projectRoot) return false;
  if (isRemoteProjectRoot(projectRoot)) return false;
  const key = resolvePaperKeyForProject(projectRoot);
  if (!key) return false;
  return ensureCompilePdfForKey(key);
}

export function clearPdfCache() {
  // Clear auto-compile timer
  if (_autoCompileTimer !== null) {
    clearTimeout(_autoCompileTimer);
    _autoCompileTimer = null;
  }
  _pdfBytesCache.clear();
  _svgPagesCache.clear();
  _currentPdfRootId = "";
  useCompileStore.setState({
    pdfRevision: 0,
    typstLiveRevision: 0,
    lastCompiledRootId: "",
    lastCompiledProjectRoot: null,
    lastPaperKey: null,
    isCompiling: false,
    diagnosticsByKey: {},
    compilingKey: null,
  });
}

// ─── Auto-compile debounce timer ───

let _autoCompileTimer: ReturnType<typeof setTimeout> | null = null;
let _compileInFlight = false;
let _boundDocumentRoot = false;

/**
 * document-store → project-lifecycle → this file. Never read `useDocumentStore`
 * while this module is still evaluating — that crashed the renderer on boot.
 * `import()` waits until document-store finishes.
 */
function bindAutoCompileToDocumentStore(): void {
  if (_boundDocumentRoot) return;
  _boundDocumentRoot = true;
  void import("./document-store").then((mod) => {
    const store = mod.useDocumentStore;
    if (!store?.getState) return;
    syncAutoCompileForProject(store.getState().projectRoot);
    store.subscribe((state, prev) => {
      if (state.projectRoot === prev.projectRoot) return;
      syncAutoCompileForProject(state.projectRoot);
    });
  });
}

function resyncAutoCompileFromDocument(): void {
  void import("./document-store").then((mod) => {
    const store = mod.useDocumentStore;
    if (!store?.getState) return;
    syncAutoCompileForProject(store.getState().projectRoot);
  });
}

function clearAutoCompileTimer() {
  if (_autoCompileTimer !== null) {
    clearTimeout(_autoCompileTimer);
    _autoCompileTimer = null;
  }
}

// ─── Types ───

interface TexliveStatus {
  available: boolean;
  engines: string[];
  version: string | null;
}

export interface CompilerStatus {
  texlive: TexliveStatus;
  tectonic: boolean;
}

/** Forward SyncTeX result queued for the TeX PDF preview to consume. */
export type SynctexForwardTarget = {
  page: number;
  x: number;
  y: number;
  height: number;
  width: number;
  /** Bumps on every request so identical coords still trigger a jump. */
  rev: number;
};

interface CompileState {
  isCompiling: boolean;
  diagnosticsByKey: Record<string, CompileDiagnostics>;
  compilingKey: string | null;
  pdfRevision: number;
  typstLiveRevision: number;
  compilerStatus: CompilerStatus | null;
  pendingRecompile: boolean;
  lastCompiledRootId: string | null;
  lastCompiledProjectRoot: string | null;
  lastPaperKey: CompileArtifactKey | null;
  /** Effective switch for the focused project (derived from per-root prefs). */
  autoCompile: boolean;
  autoCompileByRoot: Record<string, boolean>;
  /** Used only when a local root has no remembered toggle (legacy global off). */
  localAutoCompileDefault: boolean;
  synctexForwardTarget: SynctexForwardTarget | null;

  compile: (
    projectDir: string,
    mainFile: string,
    opts?: { fromAutoCompile?: boolean; evenIfClean?: boolean },
  ) => Promise<void>;
  setPdfData: (data: Uint8Array | null, rootFileId?: string) => void;
  detectCompilers: () => Promise<void>;
  clearCompileState: () => void;
  toggleAutoCompile: () => void;
  scheduleAutoCompile: () => void;
  /** PDF pane is open and cache is empty: compile once even if buffers match disk. */
  ensurePreviewCompile: (mainFile?: string) => void;
  scheduleTypstLiveCompile: () => void;
  ensureTypstLiveCompile: (mainFile?: string) => void;
  exportTypst: (format: TypstCliFormat) => Promise<void>;
  requestSynctexForward: (result: Omit<SynctexForwardTarget, "rev">) => void;
}

// ─── Store ───

export const useCompileStore = create<CompileState>()(
  persist(
    (set, get) => ({
      isCompiling: false,
      diagnosticsByKey: {},
      compilingKey: null,
      pdfRevision: 0,
      typstLiveRevision: 0,
      compilerStatus: null,
      pendingRecompile: false,
      lastCompiledRootId: null,
      lastCompiledProjectRoot: null,
      lastPaperKey: null,
      autoCompile: true,
      autoCompileByRoot: {},
      localAutoCompileDefault: true,
      synctexForwardTarget: null,

      compile: async (
        projectDir: string,
        mainFile: string,
        opts?: { fromAutoCompile?: boolean; evenIfClean?: boolean },
      ) => {
        const fromAuto = opts?.fromAutoCompile ?? false;
        const evenIfClean = opts?.evenIfClean ?? false;

        // One engine run at a time; coalesce to "need another pass with latest buffers".
        if (_compileInFlight) {
          set({ pendingRecompile: true });
          return;
        }

        const MAX_LIVE_PASSES = 6;
        let pass = 0;

        while (pass < MAX_LIVE_PASSES) {
          pass++;
          const docState = useDocumentStore.getState();
          const generation = docState.contentVersion;
          const snapshot = fromAuto || pass > 1
            ? docState.getLiveCompilePayload()
            : {
                dirtyRelPaths: docState.getDirtyRelativePaths(),
                dirtyFiles: [] as Array<{ relPath: string; content: string }>,
              };
          const { dirtyRelPaths, dirtyFiles } = snapshot;

          // Live pass with nothing dirty: buffers already match disk/build — skip engine
          // (unless this is the first open of a Typst tab that still has no PDF).
          if ((fromAuto || pass > 1) && dirtyRelPaths.length === 0 && dirtyFiles.length === 0) {
            if (!(evenIfClean && pass === 1)) break;
          }

          if (!fromAuto && pass === 1) {
            await docState.saveAllFiles();
          }

          _compileInFlight = true;
          const artifactKey = paperKeyFromMainFile(projectDir, mainFile);
          set({
            pendingRecompile: false,
            compilingKey: compileArtifactCacheKey(artifactKey),
          });
          const spinnerTimer = setTimeout(() => {
            set({ isCompiling: true });
          }, COMPILE_UI_SPINNER_DELAY_MS);

          const startTime = Date.now();
          const spinnerMin = fromAuto || pass > 1
            ? AUTO_COMPILE_SPINNER_MIN_MS
            : COMPILE_SPINNER_MIN_MS;
          const liveFast = fromAuto || pass > 1;

          let published = false;
          let failed = false;

          try {
            const result = await compileDesktop.compileExecute(
              projectDir,
              mainFile,
              false,
              {
                dirtyRelPaths,
                ...(dirtyFiles.length > 0 ? { dirtyFiles } : {}),
                skipSynctex: true,
                fast: liveFast,
                pdfOnDisk: liveFast,
              },
            );

            const elapsed = Date.now() - startTime;
            if (elapsed < spinnerMin) {
              await new Promise((r) => setTimeout(r, spinnerMin - elapsed));
            }

            if ("pdfBytes" in result && result.pdfBytes) {
              const buf = result.pdfBytes.slice(0) as ArrayBuffer;
              setPdfBytesForKey(paperKeyFromMainFile(projectDir, mainFile), new Uint8Array(buf));
              if (dirtyFiles.length > 0) {
                useDocumentStore.getState().markCompiledClean(dirtyFiles);
              }
              setCompileDiagnosticsForKey(
                paperKeyFromMainFile(projectDir, mainFile),
                diagnosticsFromCompileLog(mainFile, null, result.stdout ?? null),
              );
              set({ isCompiling: false });
              published = true;
            } else if ("pdfPath" in result && result.pdfPath) {
              const { bytes } = await fsDesktop.fsReadBytes(result.pdfPath);
              setPdfBytesForKey(paperKeyFromMainFile(projectDir, mainFile), new Uint8Array(bytes));
              if (dirtyFiles.length > 0) {
                useDocumentStore.getState().markCompiledClean(dirtyFiles);
              }
              setCompileDiagnosticsForKey(
                paperKeyFromMainFile(projectDir, mainFile),
                diagnosticsFromCompileLog(mainFile, null, result.stdout ?? null),
              );
              set({ isCompiling: false });
              published = true;
            } else if ("error" in result) {
              failed = true;
              setCompileDiagnosticsForKey(
                paperKeyFromMainFile(projectDir, mainFile),
                diagnosticsFromCompileLog(mainFile, result.error, result.stdout ?? null),
              );
              set({ isCompiling: false });
            } else {
              failed = true;
              setCompileDiagnosticsForKey(
                paperKeyFromMainFile(projectDir, mainFile),
                diagnosticsFromCompileLog(mainFile, "Compilation failed", null),
              );
              set({ isCompiling: false });
            }

            if (!published && !failed) {
              set({ isCompiling: false });
            }
          } catch (error) {
            failed = true;
            const elapsed = Date.now() - startTime;
            if (elapsed < spinnerMin) {
              await new Promise((r) => setTimeout(r, spinnerMin - elapsed));
            }
            setCompileDiagnosticsForKey(
              paperKeyFromMainFile(projectDir, mainFile),
              diagnosticsFromCompileLog(
                mainFile,
                error instanceof Error ? error.message : String(error),
                null,
              ),
            );
            set({
              isCompiling: false,
            });
          } finally {
            clearTimeout(spinnerTimer);
            _compileInFlight = false;
          }

          const latest = useDocumentStore.getState().contentVersion;
          const needAnother =
            get().pendingRecompile || latest !== generation;
          set({ pendingRecompile: false });

          if (!needAnother) break;
          // Follow-up always uses live memory flush.
        }
        set({ compilingKey: null });
      },

      setPdfData: (data, rootFileId) => {
        if (data && rootFileId) {
          const last = get().lastPaperKey;
          if (last && (rootFileId === last.projectRoot || rootFileId === compileArtifactCacheKey(last))) {
            setPdfBytesForKey(last, data);
            return;
          }
          const copy = new Uint8Array(
            data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
          );
          _pdfBytesCache.set(rootFileId, copy);
          _currentPdfRootId = rootFileId;
          set({
            pdfRevision: get().pdfRevision + 1,
            lastCompiledRootId: rootFileId,
            lastCompiledProjectRoot: rootFileId,
          });
        } else if (rootFileId) {
          _pdfBytesCache.delete(rootFileId);
          if (_currentPdfRootId === rootFileId) {
            _currentPdfRootId = null;
          }
        } else {
          _pdfBytesCache.clear();
          _currentPdfRootId = null;
        }
      },

      detectCompilers: async () => {
        try {
          const status = await compileDesktop.compileDetectTexlive();
          set({ compilerStatus: status });
        } catch (error) {
          console.error("Failed to detect compilers:", error);
        }
      },

      toggleAutoCompile: () => {
        const next = !get().autoCompile;
        const projectRoot = useDocumentStore.getState().projectRoot;
        if (projectRoot) {
          const key = autoCompilePreferenceKey(projectRoot);
          set({
            autoCompile: next,
            autoCompileByRoot: { ...get().autoCompileByRoot, [key]: next },
          });
        } else {
          set({ autoCompile: next, localAutoCompileDefault: next });
        }
        if (next) {
          get().scheduleAutoCompile();
        } else {
          clearAutoCompileTimer();
        }
      },

      scheduleAutoCompile: () => {
        clearAutoCompileTimer();

        if (!isAutoCompileEnabled()) {
          return;
        }

        _autoCompileTimer = setTimeout(async () => {
          if (!isAutoCompileEnabled()) {
            return;
          }
          const docState = useDocumentStore.getState();
          const { projectRoot, files } = docState;
          if (!projectRoot || files.length === 0) {
            return;
          }

          const targetPath = resolveUiCompileTargetPath();
          if (!targetPath) {
            warnNoCompileTargetOnce("scheduleAutoCompile");
            return;
          }
          if (compileEngineFromRelPath(targetPath) === "typst") {
            void runTypstLiveCompile(projectRoot, targetPath, false);
            return;
          }
          get().compile(projectRoot, targetPath, { fromAutoCompile: true });
        }, AUTO_COMPILE_DEBOUNCE);
      },

      ensurePreviewCompile: (mainFile) => {
        if (_aiSessionCount > 0) return;
        const projectRoot = useDocumentStore.getState().projectRoot;
        const targetPath = mainFile ?? resolveUiCompileTargetPath();
        if (!projectRoot || !targetPath) return;
        const key = paperKeyFromMainFile(projectRoot, targetPath);
        if (getPdfBytesForKey(key)) return;
        void get().compile(projectRoot, targetPath, { fromAutoCompile: true, evenIfClean: true });
      },

      scheduleTypstLiveCompile: () => {
        if (_typstLiveTimer) clearTimeout(_typstLiveTimer);
        if (!isAutoCompileEnabled()) return;
        _typstLiveTimer = setTimeout(() => {
          _typstLiveTimer = null;
          if (!isAutoCompileEnabled()) return;
          const projectRoot = useDocumentStore.getState().projectRoot;
          const targetPath = resolveUiCompileTargetPath();
          if (!projectRoot || !targetPath) return;
          if (compileEngineFromRelPath(targetPath) !== "typst") return;
          void runTypstLiveCompile(projectRoot, targetPath, false);
        }, AUTO_COMPILE_DEBOUNCE);
      },

      ensureTypstLiveCompile: (mainFile) => {
        if (_aiSessionCount > 0) return;
        const projectRoot = useDocumentStore.getState().projectRoot;
        const targetPath = mainFile ?? resolveUiCompileTargetPath();
        if (!projectRoot || !targetPath) return;
        if (compileEngineFromRelPath(targetPath) !== "typst") return;
        const key = paperKeyFromMainFile(projectRoot, targetPath);
        if (getTypstLivePages(key)?.length) return;
        void runTypstLiveCompile(projectRoot, targetPath, true);
      },

      exportTypst: async (format) => {
        const projectRoot = useDocumentStore.getState().projectRoot;
        const targetPath = resolveUiCompileTargetPath();
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
      },

      clearCompileState: () => {
        clearAutoCompileTimer();
        if (_typstLiveTimer) {
          clearTimeout(_typstLiveTimer);
          _typstLiveTimer = null;
        }
        _pdfBytesCache.clear();
        _svgPagesCache.clear();
        _currentPdfRootId = null;
        set({
          isCompiling: false,
          diagnosticsByKey: {},
          compilingKey: null,
          pdfRevision: 0,
          typstLiveRevision: 0,
          lastCompiledRootId: null,
          lastCompiledProjectRoot: null,
          lastPaperKey: null,
          pendingRecompile: false,
          synctexForwardTarget: null,
        });
      },

      requestSynctexForward: (result) => {
        set({
          synctexForwardTarget: {
            ...result,
            rev: (get().synctexForwardTarget?.rev ?? 0) + 1,
          },
        });
      },
    }),
    {
      name: "prism-next-compile",
      version: 1,
      partialize: (state): CompileAutoCompilePersistV1 => ({
        autoCompileByRoot: state.autoCompileByRoot,
        localAutoCompileDefault: state.localAutoCompileDefault,
      }),
      migrate: (persisted, fromVersion) => migrateCompileAutoCompilePersist(persisted, fromVersion),
      onRehydrateStorage: () => () => {
        resyncAutoCompileFromDocument();
      },
    },
  ),
);

// ─── Helper to compile from current state ───

let _warnedNoCompileTarget = false;

function warnNoCompileTargetOnce(context: string): void {
  if (_warnedNoCompileTarget) return;
  _warnedNoCompileTarget = true;
  console.warn(`[compile-store] ${context}: no compile target — skipping.`);
}

function resolveUiCompileTargetPath(): string | null {
  const docState = useDocumentStore.getState();
  const { files, activeFileId } = docState;
  const active = files.find((f) => f.id === activeFileId);
  const rel = active?.relativePath ?? "";
  if (compileEngineFromRelPath(rel) === "typst") {
    const manuscript = useWorkspaceConfigStore.getState().manuscriptConfig;
    const manuscriptDir = manuscript?.dir ?? null;
    if (isTypstStandaloneRel(rel, manuscriptDir)) return rel;
    return (
      resolveTypstRootFromBuffers({
        files,
        getContent: (path) => {
          const f = files.find((x) => x.relativePath.replace(/\\/g, "/") === path.replace(/\\/g, "/"));
          return f ? docState.getAsset(f.id) : "";
        },
        manuscriptDir,
        mainFilePin: manuscript?.mainFile ?? null,
        hintRel: rel,
      }) ?? rel
    );
  }
  const resolved = resolveCompileTarget(activeFileId || "", files, docState.getAsset);
  const manuscriptConfig = useWorkspaceConfigStore.getState().manuscriptConfig;
  const pinRel = paperRelFromManuscript(manuscriptConfig);
  return (
    resolved?.targetPath ??
    (pinRel
      ? files.find((f) => f.relativePath === pinRel)?.relativePath ?? null
      : null)
  );
}

export async function compileCurrentDocument(): Promise<void> {
  const docState = useDocumentStore.getState();
  const compileState = useCompileStore.getState();

  const { projectRoot, files } = docState;
  if (!projectRoot || files.length === 0) return;

  const targetPath = resolveUiCompileTargetPath();
  if (!targetPath) {
    warnNoCompileTargetOnce("compileCurrentDocument");
    return;
  }

  await compileState.compile(projectRoot, targetPath);
}

// ─── Auto-compile preference (per project root) ───

let _aiSessionCount = 0;
const _aiPauseOwners = new Set<string>();

export function isAutoCompileEnabled(): boolean {
  if (_aiSessionCount > 0) return false;
  const projectRoot = useDocumentStore.getState().projectRoot;
  const { autoCompileByRoot, localAutoCompileDefault } = useCompileStore.getState();
  return resolveAutoCompileForProjectRoot(autoCompileByRoot, projectRoot, localAutoCompileDefault);
}

export function syncAutoCompileForProject(projectRoot: string | null): void {
  const effective = _aiSessionCount > 0
    ? false
    : resolveAutoCompileForProjectRoot(
        useCompileStore.getState().autoCompileByRoot,
        projectRoot,
        useCompileStore.getState().localAutoCompileDefault,
      );
  if (useCompileStore.getState().autoCompile !== effective) {
    useCompileStore.setState({ autoCompile: effective });
  }
  if (!effective) clearAutoCompileTimer();
}

bindAutoCompileToDocumentStore();

export function pauseAutoCompileForAi(ownerId?: string): void {
  if (ownerId) {
    if (_aiPauseOwners.has(ownerId)) return;
    _aiPauseOwners.add(ownerId);
  }
  _aiSessionCount++;
  useCompileStore.setState({ autoCompile: false });
  clearAutoCompileTimer();
}

export function resumeAutoCompileAfterAi(ownerId?: string): void {
  if (ownerId) {
    if (!_aiPauseOwners.has(ownerId)) return;
    _aiPauseOwners.delete(ownerId);
  }
  if (_aiSessionCount <= 0) return;
  _aiSessionCount--;
  if (_aiSessionCount === 0) {
    syncAutoCompileForProject(useDocumentStore.getState().projectRoot);
    if (isAutoCompileEnabled()) {
      useCompileStore.getState().scheduleAutoCompile();
    }
  }
}

export function aiAutoCompilePauseCountForTests(): number {
  return _aiSessionCount;
}

export function resetAiAutoCompilePauseForTests(): void {
  _aiPauseOwners.clear();
  _aiSessionCount = 0;
}
