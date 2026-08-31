export type CompileSource = "ui" | "agent";
export type CompileRoute = "manuscript" | "standalone";
export type CompileEngineId = "tectonic-bundled" | "tectonic-system" | "texlive";

/** Dirty buffers flushed to disk before Typst watch / compile / export. Not a LaTeX live pass. */
export interface CompileFlushOptions {
  dirtyFiles?: Array<{ relPath: string; content: string }>;
  source?: CompileSource;
}

export interface CompileLatexOptions extends CompileFlushOptions {
  /** Project-relative paths changed since the last compile (incremental sync). */
  dirtyRelPaths?: string[];
  /** When true, omit pdfBytes — renderer reads from pdfPath on disk. */
  pdfOnDisk?: boolean;
  /** Skip SyncTeX (always on for now — SyncTeX UI is disabled). */
  skipSynctex?: boolean;
  /**
   * Live typing preview: prefer latency over full aux/bib convergence.
   * Tectonic: one TeX pass (`-r 0`); TeX Live: single latex, no bib.
   * Skips the strict “citations unresolved” failure gate (PDF still returned).
   * Typst PDF ignores this — it is always one `typst compile`.
   */
  fast?: boolean;
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
