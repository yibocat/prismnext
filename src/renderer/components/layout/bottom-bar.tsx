import { useEffect, useRef } from "react";
import {
  GlobeIcon,
  FileTextIcon,
  ZapIcon,
  ZapOffIcon,
  Loader2Icon,
  XCircleIcon,
  GitBranchIcon,
} from "lucide-react";
import { useLayoutStore } from "@/stores/layout-store";
import { useCompileStore } from "@/stores/compile-store";

export function BottomBar() {
  const {
    isCompiling,
    compileError,
    pdfRevision,
    compilerBackend,
    compilerStatus,
    autoCompile,
    setCompilerBackend,
    toggleAutoCompile,
    detectCompilers,
  } = useCompileStore();

  useEffect(() => {
    detectCompilers();
  }, [detectCompilers]);

  const createPdfTab = useLayoutStore((s) => s.createPdfTab);
  const compileSuccess = !isCompiling && !compileError && pdfRevision > 0;

  // Auto-create PDF tab on compile success
  const lastRevision = useRef(pdfRevision);
  useEffect(() => {
    if (pdfRevision > 0 && pdfRevision !== lastRevision.current) {
      lastRevision.current = pdfRevision;
      createPdfTab("PDF Preview");
    }
  }, [pdfRevision, createPdfTab]);

  return (
    <div className="flex h-6 shrink-0 items-center border-t border-border bg-card px-3 text-[11px] text-muted-foreground select-none">
      {/* Compile status (display only) */}
      <span className="flex items-center gap-1 rounded-md px-1.5 py-0.5">
        {isCompiling ? (
          <>
            <Loader2Icon className="size-3 animate-spin text-yellow-500" />
            <span className="text-yellow-500">Compiling...</span>
          </>
        ) : compileError ? (
          <>
            <XCircleIcon className="size-3 text-red-500" />
            <span className="text-red-500">Error</span>
          </>
        ) : compileSuccess ? (
          <>
            <ZapIcon className="size-3 text-green-500" />
            <span className="text-green-500">Compiled</span>
          </>
        ) : (
          <>
            <ZapIcon className="size-3" />
            Ready
          </>
        )}
      </span>

      <div className="mx-1 h-3 w-px bg-border/60" />

      {/* Auto-compile toggle */}
      <button
        type="button"
        className="flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-muted hover:text-foreground transition-colors"
        onClick={toggleAutoCompile}
        title={autoCompile ? "Auto-compile: ON" : "Auto-compile: OFF"}
      >
        {autoCompile ? (
          <ZapIcon className="size-3 text-yellow-500" />
        ) : (
          <ZapOffIcon className="size-3" />
        )}
      </button>

      <div className="mx-1 h-3 w-px bg-border/60" />

      {/* Compiler selector */}
      <select
        className="h-5 rounded-md border border-border bg-card px-1 text-[11px] text-muted-foreground focus:outline-none"
        value={compilerBackend}
        onChange={(e) => setCompilerBackend(e.target.value as "tectonic" | "texlive")}
      >
        <option value="tectonic" disabled={!compilerStatus?.tectonic}>Tectonic</option>
        <option value="texlive" disabled={!compilerStatus?.texlive?.available}>TeX Live</option>
      </select>

      <span className="flex-1" />

      {/* Git branch */}
      <span className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground">
        <GitBranchIcon className="size-3" />
        main
      </span>

      <div className="mx-1 h-3 w-px bg-border/60" />

      {/* Cursor position */}
      <button
        type="button"
        className="rounded-md px-1.5 py-0.5 hover:bg-muted hover:text-foreground transition-colors"
      >
        Ln 42, Col 8
      </button>

      <div className="mx-1 h-3 w-px bg-border/60" />

      {/* Encoding */}
      <button
        type="button"
        className="flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-muted hover:text-foreground transition-colors"
      >
        <GlobeIcon className="size-3" />
        UTF-8
      </button>

      <div className="mx-1 h-3 w-px bg-border/60" />

      {/* Language mode */}
      <button
        type="button"
        className="flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-muted hover:text-foreground transition-colors"
      >
        <FileTextIcon className="size-3" />
        LaTeX
      </button>
    </div>
  );
}
