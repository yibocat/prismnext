import { create } from "zustand";
import { persist } from "zustand/middleware";
import { AUTO_COMPILE_DEBOUNCE } from "@/styles/constants";
import { useDocumentStore } from "./document-store";
import { resolveCompileTarget } from "@/lib/resolve-tex-root";

// ─── PDF Bytes Cache (outside Zustand state) ───

const _pdfBytesCache = new Map<string, Uint8Array>();
let _currentPdfRootId: string | null = null;

export function getPdfBytes(rootFileId: string): Uint8Array | undefined {
  return _pdfBytesCache.get(rootFileId);
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

export function getCurrentPdfBytes(): Uint8Array | null {
  if (!_currentPdfRootId) return null;
  return _pdfBytesCache.get(_currentPdfRootId) || null;
}

export function clearPdfBytesCache(): void {
  _pdfBytesCache.clear();
  _currentPdfRootId = null;
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

interface CompileState {
  isCompiling: boolean;
  compileError: string | null;
  pdfRevision: number;
  compilerBackend: "tectonic" | "texlive";
  compilerStatus: CompilerStatus | null;
  pendingRecompile: boolean;
  lastCompiledRootId: string | null;
  autoCompile: boolean;

  compile: (projectDir: string, mainFile: string) => Promise<void>;
  setCompilerBackend: (backend: "tectonic" | "texlive") => void;
  setPdfData: (data: Uint8Array | null, rootFileId?: string) => void;
  setCompileError: (error: string | null) => void;
  detectCompilers: () => Promise<void>;
  clearCompileState: () => void;
  toggleAutoCompile: () => void;
  scheduleAutoCompile: () => void;
}

// ─── Store ───

export const useCompileStore = create<CompileState>()(
  persist(
    (set, get) => ({
      isCompiling: false,
      compileError: null,
      pdfRevision: 0,
      compilerBackend: "tectonic",
      compilerStatus: null,
      pendingRecompile: false,
      lastCompiledRootId: null,
      autoCompile: true,

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
            const pdfData = new Uint8Array(result.pdfBytes);
            // Use projectDir as key (consistent with getPdfBytes in pdf-preview.tsx)
            _pdfBytesCache.set(projectDir, pdfData);
            _currentPdfRootId = projectDir;
            set({
              isCompiling: false,
              compileError: null,
              pdfRevision: get().pdfRevision + 1,
              lastCompiledRootId: projectDir,
              pendingRecompile: false,
            });
          } else {
            set({
              isCompiling: false,
              compileError: result.error,
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
          _pdfBytesCache.set(rootFileId, data);
          _currentPdfRootId = rootFileId;
          set({ pdfRevision: get().pdfRevision + 1, lastCompiledRootId: rootFileId });
        } else if (rootFileId) {
          _pdfBytesCache.delete(rootFileId);
          if (_currentPdfRootId === rootFileId) {
            _currentPdfRootId = null;
          }
        } else {
          clearPdfBytesCache();
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

        _autoCompileTimer = setTimeout(async () => {
          const docState = useDocumentStore.getState();
          const { projectRoot, files, activeFileId } = docState;
          if (!projectRoot || !activeFileId || files.length === 0) {
            return;
          }

          const resolved = resolveCompileTarget(activeFileId, files, docState.getContent);
          if (resolved) {
            // compile() already calls saveAllFiles() internally
            get().compile(projectRoot, resolved.targetPath);
          }
        }, AUTO_COMPILE_DEBOUNCE);
      },

      clearCompileState: () => {
        clearAutoCompileTimer();
        clearPdfBytesCache();
        set({
          isCompiling: false,
          compileError: null,
          pdfRevision: 0,
          lastCompiledRootId: null,
          pendingRecompile: false,
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

  if (!projectRoot || !activeFileId || files.length === 0) {
    return;
  }

  const resolved = resolveCompileTarget(activeFileId, files, docState.getContent);

  if (resolved) {
    await compileState.compile(projectRoot, resolved.targetPath);
  }
}

/**
 * Compile on save: always triggers, regardless of autoCompile setting.
 * Cmd+S → save → compile.
 */
export async function compileOnSave(): Promise<void> {
  await compileCurrentDocument();
}

// ─── AI auto-compile control ───

let _autoCompileBeforeAi: boolean | null = null;

export function pauseAutoCompileForAi(): void {
  if (_autoCompileBeforeAi === null) {
    _autoCompileBeforeAi = useCompileStore.getState().autoCompile;
  }
  useCompileStore.setState({ autoCompile: false });
  clearAutoCompileTimer();
}

export function resumeAutoCompileAfterAi(): void {
  if (_autoCompileBeforeAi !== null) {
    useCompileStore.setState({ autoCompile: _autoCompileBeforeAi });
    _autoCompileBeforeAi = null;
  }
}
