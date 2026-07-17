import { create } from "zustand";
import { persist } from "zustand/middleware";
import { AUTO_COMPILE_DEBOUNCE } from "@/styles/constants";
import { useDocumentStore } from "./document-store";
import { useWorkspaceConfigStore } from "./workspace-config-store";
import { resolveCompileTarget } from "@/lib/tex/resolve-tex-root";

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
    ".prismnext",
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
    doc.getContent,
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
 * `<project>/.prismnext/compile/<stem>.pdf`. Returns true when bytes are available.
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
        const { bytes } = await window.electronAPI.fsReadBytes(abs);
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

interface CompilerStatus {
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
  compilerBackend: "tectonic" | "texlive";
  compilerStatus: CompilerStatus | null;
  pendingRecompile: boolean;
  lastCompiledRootId: string | null;
  autoCompile: boolean;
  synctexForwardTarget: SynctexForwardTarget | null;

  compile: (projectDir: string, mainFile: string) => Promise<void>;
  setCompilerBackend: (backend: "tectonic" | "texlive") => void;
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
      compilerBackend: "tectonic",
      compilerStatus: null,
      pendingRecompile: false,
      lastCompiledRootId: null,
      // TODO: future settings panel — expose autoCompile as a user-configurable
      // preference in the Settings dialog (persisted via zustand persist middleware,
      // already survives app restarts). The toolbar toggle should remain as a
      // quick-access shortcut synchronized with the settings value.
      autoCompile: true,
      synctexForwardTarget: null,

      compile: async (projectDir: string, mainFile: string) => {
        const state = get();

        // If already compiling, mark pending recompile
        if (state.isCompiling) {
          set({ pendingRecompile: true });
          return;
        }

        // Save all dirty files first
        await useDocumentStore.getState().saveAllFiles();

        set({ isCompiling: true, compileError: null });

        const startTime = Date.now();
        const useTexlive = state.compilerBackend === "texlive";

        try {
          console.log(`[compile-store] compile: projectDir=${projectDir} mainFile=${mainFile} useTexlive=${useTexlive}`);
          const result = await window.electronAPI.compileExecute(
            projectDir,
            mainFile,
            useTexlive,
          );

          // Ensure spinner visible for at least 500ms
          const elapsed = Date.now() - startTime;
          if (elapsed < 500) {
            await new Promise((r) => setTimeout(r, 500 - elapsed));
          }

          if ("pdfBytes" in result) {
            // Defensive copy: the Blob constructor used for PDF preview
            // can transfer/detach the original ArrayBuffer.  Store an
            // independent copy so the cache survives repeated use.
            const buf = result.pdfBytes.slice(0) as ArrayBuffer;
            const pdfData = new Uint8Array(buf);
            _pdfBytesCache.set(projectDir, pdfData);

            _currentPdfRootId = projectDir;
            set({
              isCompiling: false,
              compileError: null,
              compileLog: result.stdout ?? null,
              pdfRevision: get().pdfRevision + 1,
              lastCompiledRootId: projectDir,
              pendingRecompile: false,
            });
          } else {
            set({
              isCompiling: false,
              compileError: result.error,
              compileLog: result.stdout ?? null,
              pendingRecompile: false,
            });
          }
        } catch (error) {
          // Ensure spinner visible for at least 500ms
          const elapsed = Date.now() - startTime;
          if (elapsed < 500) {
            await new Promise((r) => setTimeout(r, 500 - elapsed));
          }

          set({
            isCompiling: false,
            compileError: error instanceof Error ? error.message : String(error),
            pendingRecompile: false,
          });
        }

        // Handle pending recompile
        if (get().pendingRecompile) {
          set({ pendingRecompile: false });
          // Recompile after a short delay
          setTimeout(() => {
            const currentState = get();
            const docState = useDocumentStore.getState();
            const resolved = resolveCompileTarget(
              docState.activeFileId || "",
              docState.files,
              docState.getContent,
            );
            if (resolved && docState.projectRoot) {
              currentState.compile(docState.projectRoot, resolved.targetPath);
            }
          }, 100);
        }
      },

      setCompilerBackend: (backend) => {
        set({ compilerBackend: backend });
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
          const status = await window.electronAPI.compileDetectTexlive();
          set({ compilerStatus: status });

          // Auto-select backend based on availability
          if (!status.tectonic && status.texlive.available) {
            set({ compilerBackend: "texlive" });
          } else if (status.tectonic) {
            set({ compilerBackend: "tectonic" });
          } else if (status.texlive.available) {
            set({ compilerBackend: "texlive" });
          }
        } catch (error) {
          console.error("Failed to detect compilers:", error);
        }
      },

      toggleAutoCompile: () => {
        set((s) => ({ autoCompile: !s.autoCompile }));
        if (get().autoCompile) {
          // Just turned on — schedule a compile if there's a document
          get().scheduleAutoCompile();
        } else {
          clearAutoCompileTimer();
        }
      },

      scheduleAutoCompile: () => {
        clearAutoCompileTimer();

        if (!get().autoCompile) {
          return;
        }

        // Guard: no manuscript configured — nothing to auto-compile
        const manuscriptConfig = useWorkspaceConfigStore.getState().manuscriptConfig;
        if (!manuscriptConfig) {
          console.warn("[compile-store] scheduleAutoCompile: no manuscript configured — skipping auto-compile.");
          return;
        }

        _autoCompileTimer = setTimeout(async () => {
          const docState = useDocumentStore.getState();
          const { projectRoot, files, activeFileId } = docState;
          if (!projectRoot || files.length === 0) {
            return;
          }

          // Resolve compile target — prefer active file, fall back to manuscript config
          let targetPath: string | null = null;

          if (activeFileId) {
            const resolved = resolveCompileTarget(activeFileId, files, docState.getContent);
            if (resolved) targetPath = resolved.targetPath;
          }

          // Fallback: use the manuscriptConfig's mainTex as the preferred entry point
          if (!targetPath) {
            const mainTexRelPath = `${manuscriptConfig.dir}/${manuscriptConfig.mainTex}`;
            const mainTexFile = files.find(f => f.relativePath === mainTexRelPath);
            if (mainTexFile) {
              const resolved = resolveCompileTarget(mainTexFile.id, files, docState.getContent);
              if (resolved) targetPath = resolved.targetPath;
            }
          }

          if (targetPath) {
            // compile() already calls saveAllFiles() internally
            get().compile(projectRoot, targetPath);
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
      partialize: (state) => ({
        compilerBackend: state.compilerBackend,
        autoCompile: state.autoCompile,
      }),
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
    const resolved = resolveCompileTarget(activeFileId, files, docState.getContent);
    if (resolved) targetPath = resolved.targetPath;
  }

  // Fallback: use the manuscriptConfig's mainTex as the preferred entry point
  if (!targetPath) {
    const mainTexRelPath = `${manuscriptConfig.dir}/${manuscriptConfig.mainTex}`;
    const mainTexFile = files.find(f => f.relativePath === mainTexRelPath);
    if (mainTexFile) {
      const resolved = resolveCompileTarget(mainTexFile.id, files, docState.getContent);
      if (resolved) targetPath = resolved.targetPath;
    }
  }

  if (targetPath) {
    await compileState.compile(projectRoot, targetPath);
  }
}

// ─── AI auto-compile control ───

let _aiSessionCount = 0;
let _autoCompileBeforeAi: boolean | null = null;

export function pauseAutoCompileForAi(): void {
  if (_aiSessionCount === 0) {
    _autoCompileBeforeAi = useCompileStore.getState().autoCompile;
  }
  _aiSessionCount++;
  useCompileStore.setState({ autoCompile: false });
  clearAutoCompileTimer();
}

export function resumeAutoCompileAfterAi(): void {
  if (_aiSessionCount <= 0) return;
  _aiSessionCount--;
  if (_aiSessionCount === 0 && _autoCompileBeforeAi !== null) {
    useCompileStore.setState({ autoCompile: _autoCompileBeforeAi });
    _autoCompileBeforeAi = null;
  }
}
