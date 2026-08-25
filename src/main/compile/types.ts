export type CompileSource = "ui" | "agent";
export type CompileRoute = "manuscript" | "standalone";
export type CompileEngineId = "tectonic-bundled" | "tectonic-system" | "texlive";

export interface CompileLatexOptions {
  /** Project-relative paths changed since the last compile (incremental sync). */
  dirtyRelPaths?: string[];
  /** In-memory dirty sources — flushed to project tree before sync (skips renderer save). */
  dirtyFiles?: Array<{ relPath: string; content: string }>;
  /** When true, omit pdfBytes — renderer reads from pdfPath on disk. */
  pdfOnDisk?: boolean;
  /** Skip SyncTeX (always on for now — SyncTeX UI is disabled). */
  skipSynctex?: boolean;
  /**
   * Live typing preview: prefer latency over full aux/bib convergence.
   * Tectonic: one TeX pass (`-r 0`); TeX Live: single latex, no bib.
   * Skips the strict “citations unresolved” failure gate (PDF still returned).
   */
  fast?: boolean;
  /** Who kicked off this job. Defaults to ui. Agent compiles must pass "agent". */
  source?: CompileSource;
}

export interface StandaloneCompileResult {
  success: boolean;
  /** Project-relative PDF path (next to the source file). */
  pdfPath?: string;
  logContent?: string;
  error?: string;
}

export interface StandaloneCompileOptions {
  source?: CompileSource;
}
