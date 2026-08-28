import { create } from "zustand";
import { persist } from "zustand/middleware";
import { AUTO_COMPILE_DEBOUNCE, AUTO_COMPILE_SPINNER_MIN_MS, COMPILE_SPINNER_MIN_MS, COMPILE_UI_SPINNER_DELAY_MS } from "@/styles/constants";
import { useDocumentStore } from "./document-store";
import { useWorkspaceConfigStore } from "./workspace-config-store";
import { resolveCompileTarget } from "@/lib/tex/resolve-tex-root";
import { compileDesktop } from "@/lib/desktop-api/compile";
import { fsDesktop } from "@/lib/desktop-api/fs";
import {
  autoCompilePreferenceKey,
  migrateCompileAutoCompilePersist,
  resolveAutoCompileForProjectRoot,
  type CompileAutoCompilePersistV1,
} from "@shared/compile/auto-compile-pref";

// ─── PDF Bytes + Path Cache (outside Zustand state) ───

const _pdfBytesCache = new Map<string, Uint8Array>();
let _currentPdfRootId: string | null = null;

export function getPdfBytes(rootFileId: string): Uint8Array | undefined {
  return _pdfBytesCache.get(rootFileId);
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

function collectCompilePdfDiskCandidates(projectRoot: string): string[] {
  const candidates: string[] = [];
  const push = (rel: string) => {
    const abs = resolveCompilePdfDiskPath(projectRoot, rel);
    if (!candidates.includes(abs)) candidates.push(abs);
  };

  const doc = useDocumentStore.getState();
  const resolved = resolveCompileTarget(
    doc.activeFileId || "",
    doc.files,
    doc.getAsset,
  );
  if (resolved?.targetPath) push(resolved.targetPath);

  const manuscript = useWorkspaceConfigStore.getState().manuscriptConfig;
  if (manuscript) {
    push(`${manuscript.dir}/${manuscript.mainTex}`.replace(/\/+/g, "/"));
  }

  return candidates;
}

let _ensureDiskPdfPromise: Promise<boolean> | null = null;
let _ensureDiskPdfKey: string | null = null;

/**
 * If memory cache is empty, try loading a previously compiled PDF from
 * `<project>/.workbench/compile/<stem>.pdf`. Returns true when bytes are available.
 */
export async function ensureCompilePdfFromDisk(projectRoot: string): Promise<boolean> {
  if (!projectRoot) return false;
  if (getPdfBytes(projectRoot)) return true;

  if (_ensureDiskPdfPromise && _ensureDiskPdfKey === projectRoot) {
    return _ensureDiskPdfPromise;
  }

  _ensureDiskPdfKey = projectRoot;
  _ensureDiskPdfPromise = (async () => {
    if (getPdfBytes(projectRoot)) return true;

    for (const abs of collectCompilePdfDiskCandidates(projectRoot)) {
      try {
        const { bytes } = await fsDesktop.fsReadBytes(abs);
        if (!bytes || bytes.byteLength === 0) continue;
        const copy = new Uint8Array(bytes);
        _pdfBytesCache.set(projectRoot, copy);
        _currentPdfRootId = projectRoot;
        useCompileStore.setState((s) => ({
          pdfRevision: s.pdfRevision + 1,
          lastCompiledRootId: projectRoot,
        }));
        return true;
      } catch {
        // Missing or unreadable — try next candidate.
      }
    }
    return false;
  })().finally(() => {
    if (_ensureDiskPdfKey === projectRoot) {
      _ensureDiskPdfPromise = null;
      _ensureDiskPdfKey = null;
    }
  });

  return _ensureDiskPdfPromise;
}

export function clearPdfCache() {
  // Clear auto-compile timer
  if (_autoCompileTimer !== null) {
    clearTimeout(_autoCompileTimer);
    _autoCompileTimer = null;
  }
  _pdfBytesCache.clear();
  _currentPdfRootId = "";
  useCompileStore.setState({
    pdfRevision: 0,
    lastCompiledRootId: "",
    isCompiling: false,
    compileError: null,
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
  compileError: string | null;
  compileLog: string | null;
  pdfRevision: number;
  compilerStatus: CompilerStatus | null;
  pendingRecompile: boolean;
  lastCompiledRootId: string | null;
  /** Effective switch for the focused project (derived from per-root prefs). */
  autoCompile: boolean;
  autoCompileByRoot: Record<string, boolean>;
  /** Used only when a local root has no remembered toggle (legacy global off). */
  localAutoCompileDefault: boolean;
  synctexForwardTarget: SynctexForwardTarget | null;

  compile: (projectDir: string, mainFile: string, opts?: { fromAutoCompile?: boolean }) => Promise<void>;
  setPdfData: (data: Uint8Array | null, rootFileId?: string) => void;
  setCompileError: (error: string | null) => void;
  detectCompilers: () => Promise<void>;
  clearCompileState: () => void;
  toggleAutoCompile: () => void;
  scheduleAutoCompile: () => void;
  requestSynctexForward: (result: Omit<SynctexForwardTarget, "rev">) => void;
}

// ─── Store ───

export const useCompileStore = create<CompileState>()(
  persist(
    (set, get) => ({
      isCompiling: false,
      compileError: null,
      compileLog: null,
      pdfRevision: 0,
      compilerStatus: null,
      pendingRecompile: false,
      lastCompiledRootId: null,
      autoCompile: true,
      autoCompileByRoot: {},
      localAutoCompileDefault: true,
      synctexForwardTarget: null,

      compile: async (projectDir: string, mainFile: string, opts?: { fromAutoCompile?: boolean }) => {
        const fromAuto = opts?.fromAutoCompile ?? false;

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

          // Live pass with nothing dirty: buffers already match disk/build — skip engine.
          if ((fromAuto || pass > 1) && dirtyRelPaths.length === 0 && dirtyFiles.length === 0) {
            break;
          }

          if (!fromAuto && pass === 1) {
            await docState.saveAllFiles();
          }

          _compileInFlight = true;
          set({ compileError: null, pendingRecompile: false });
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
              // Always publish — discarding on "stale" made continuous typing never update the PDF.
              const buf = result.pdfBytes.slice(0) as ArrayBuffer;
              _pdfBytesCache.set(projectDir, new Uint8Array(buf));
              _currentPdfRootId = projectDir;
              if (dirtyFiles.length > 0) {
                useDocumentStore.getState().markCompiledClean(dirtyFiles);
              }
              set({
                isCompiling: false,
                compileError: null,
                compileLog: result.stdout ?? null,
                pdfRevision: get().pdfRevision + 1,
                lastCompiledRootId: projectDir,
              });
              published = true;
            } else if ("pdfPath" in result && result.pdfPath) {
              const { bytes } = await fsDesktop.fsReadBytes(result.pdfPath);
              _pdfBytesCache.set(projectDir, new Uint8Array(bytes));
              _currentPdfRootId = projectDir;
              if (dirtyFiles.length > 0) {
                useDocumentStore.getState().markCompiledClean(dirtyFiles);
              }
              set({
                isCompiling: false,
                compileError: null,
                compileLog: result.stdout ?? null,
                pdfRevision: get().pdfRevision + 1,
                lastCompiledRootId: projectDir,
              });
              published = true;
            } else if ("error" in result) {
              failed = true;
              set({
                isCompiling: false,
                compileError: result.error,
                compileLog: result.stdout ?? null,
              });
            } else {
              failed = true;
              set({
                isCompiling: false,
                compileError: "Compilation failed",
                compileLog: null,
              });
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
            set({
              isCompiling: false,
              compileError: error instanceof Error ? error.message : String(error),
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
      },

      setPdfData: (data, rootFileId) => {
        if (data && rootFileId) {
          // Defensive copy — same reasoning as above.
          const copy = new Uint8Array(
            data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
          );
          _pdfBytesCache.set(rootFileId, copy);
          _currentPdfRootId = rootFileId;
          set({ pdfRevision: get().pdfRevision + 1, lastCompiledRootId: rootFileId });
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

      setCompileError: (error) => {
        set({ compileError: error });
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

        // Guard: no manuscript configured — nothing to auto-compile
        const manuscriptConfig = useWorkspaceConfigStore.getState().manuscriptConfig;
        if (!manuscriptConfig) {
          console.warn("[compile-store] scheduleAutoCompile: no manuscript configured — skipping auto-compile.");
          return;
        }

        _autoCompileTimer = setTimeout(async () => {
          if (!isAutoCompileEnabled()) {
            return;
          }
          const docState = useDocumentStore.getState();
          const { projectRoot, files, activeFileId } = docState;
          if (!projectRoot || files.length === 0) {
            return;
          }

          // Resolve compile target — prefer active file, fall back to manuscript config
          let targetPath: string | null = null;

          if (activeFileId) {
            const resolved = resolveCompileTarget(activeFileId, files, docState.getAsset);
            if (resolved) targetPath = resolved.targetPath;
          }

          // Fallback: use the manuscriptConfig's mainTex as the preferred entry point
          if (!targetPath) {
            const mainTexRelPath = `${manuscriptConfig.dir}/${manuscriptConfig.mainTex}`;
            const mainTexFile = files.find(f => f.relativePath === mainTexRelPath);
            if (mainTexFile) {
              const resolved = resolveCompileTarget(mainTexFile.id, files, docState.getAsset);
              if (resolved) targetPath = resolved.targetPath;
            }
          }

          if (targetPath) {
            get().compile(projectRoot, targetPath, { fromAutoCompile: true });
          }
        }, AUTO_COMPILE_DEBOUNCE);
      },

      clearCompileState: () => {
        clearAutoCompileTimer();
        _pdfBytesCache.clear();
        _currentPdfRootId = null;
        set({
          isCompiling: false,
          compileError: null,
          pdfRevision: 0,
          lastCompiledRootId: null,
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

export async function compileCurrentDocument(): Promise<void> {
  const docState = useDocumentStore.getState();
  const compileState = useCompileStore.getState();

  const { projectRoot, files, activeFileId } = docState;
  if (!projectRoot || files.length === 0) return;

  // Guard: no manuscript configured — nothing to compile
  const manuscriptConfig = useWorkspaceConfigStore.getState().manuscriptConfig;
  if (!manuscriptConfig) {
    console.warn("[compile-store] compileCurrentDocument: no manuscript configured — skipping compilation. Configure a manuscript folder in Workspace Settings.");
    return;
  }

  // Resolve compile target — prefer active file, fall back to manuscript config
  let targetPath: string | null = null;

  if (activeFileId) {
    const resolved = resolveCompileTarget(activeFileId, files, docState.getAsset);
    if (resolved) targetPath = resolved.targetPath;
  }

  // Fallback: use the manuscriptConfig's mainTex as the preferred entry point
  if (!targetPath) {
    const mainTexRelPath = `${manuscriptConfig.dir}/${manuscriptConfig.mainTex}`;
    const mainTexFile = files.find(f => f.relativePath === mainTexRelPath);
    if (mainTexFile) {
      const resolved = resolveCompileTarget(mainTexFile.id, files, docState.getAsset);
      if (resolved) targetPath = resolved.targetPath;
    }
  }

  if (targetPath) {
    await compileState.compile(projectRoot, targetPath);
  }
}

// ─── Auto-compile preference (per project root) ───

let _aiSessionCount = 0;

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

export function pauseAutoCompileForAi(): void {
  _aiSessionCount++;
  useCompileStore.setState({ autoCompile: false });
  clearAutoCompileTimer();
}

export function resumeAutoCompileAfterAi(): void {
  if (_aiSessionCount <= 0) return;
  _aiSessionCount--;
  if (_aiSessionCount === 0) {
    syncAutoCompileForProject(useDocumentStore.getState().projectRoot);
  }
}
