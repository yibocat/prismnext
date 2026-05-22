import { useState, useRef, useCallback, useEffect } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ZoomInIcon,
  ZoomOutIcon,
  LoaderIcon,
  AlertCircleIcon,
  DownloadIcon,
} from "lucide-react";
import { PdfViewer } from "./viewer";
import { useCompileStore, getPdfBytes } from "@/stores/compile-store";
import { useDocumentStore } from "@/stores/document-store";

const ZOOM_PRESETS = [
  { label: "Fit Width", value: "fit-width" },
  { label: "Fit Height", value: "fit-height" },
  { label: "50%", value: "50%" },
  { label: "75%", value: "75%" },
  { label: "100%", value: "100%" },
  { label: "125%", value: "125%" },
  { label: "150%", value: "150%" },
  { label: "200%", value: "200%" },
];

export function PdfPreview() {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const files = useDocumentStore((s) => s.files);
  const activeFileId = useDocumentStore((s) => s.activeFileId);
  const setActiveFile = useDocumentStore((s) => s.setActiveFile);
  const getContent = useDocumentStore((s) => s.getContent);
  const requestJumpToPosition = useDocumentStore((s) => s.requestJumpToPosition);
  const { isCompiling, compileError, pdfRevision } = useCompileStore();

  const [scale, setScale] = useState(1);
  const [fitMode, setFitMode] = useState<"fit-width" | "fit-height" | null>("fit-width");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const gestureStartScaleRef = useRef(1);

  const pdfBytes = projectRoot ? getPdfBytes(projectRoot) : null;
  const hasPdf = pdfBytes !== null && pdfBytes !== undefined;

  // ─── Pinch-to-zoom (trackpad) ───
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const normalized = Math.min(Math.abs(e.deltaY), 300);
        const direction = e.deltaY > 0 ? -1 : 1;
        const factor = Math.exp(direction * normalized * 0.008);
        setScale((s) => Math.max(0.25, Math.min(4, s * factor)));
        setFitMode(null);
      }
    };

    const handleGestureStart = () => {
      gestureStartScaleRef.current = scale;
    };
    const handleGesture = (e: Event) => {
      const ge = e as any;
      if (ge.scale !== undefined) {
        e.preventDefault();
        const newScale = gestureStartScaleRef.current * ge.scale;
        setScale(Math.max(0.25, Math.min(4, newScale)));
        setFitMode(null);
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    container.addEventListener("gesturestart", handleGestureStart);
    container.addEventListener("gesturechange", handleGesture);

    return () => {
      container.removeEventListener("wheel", handleWheel);
      container.removeEventListener("gesturestart", handleGestureStart);
      container.removeEventListener("gesturechange", handleGesture);
    };
  }, [scale]);

  // ─── SyncTeX click → jump to source ───
  const handleSynctexClick = useCallback(
    async (page: number, x: number, y: number) => {
      if (!projectRoot) return;
      try {
        const result = await window.electronAPI.compileSynctex(projectRoot, page, x, y);
        if (!result) return;

        const targetFile = files.find(
          (f) => f.relativePath === result.file || f.relativePath.endsWith("/" + result.file),
        );
        if (!targetFile) return;

        if (targetFile.id !== activeFileId) {
          setActiveFile(targetFile.id);
        }

        const content = getContent(targetFile.id);
        const lines = content.split("\n");
        let offset = 0;
        for (let i = 0; i < Math.min(result.line - 1, lines.length); i++) {
          offset += lines[i].length + 1;
        }
        requestJumpToPosition(offset);
      } catch (err) {
        console.error("[pdf-preview] SyncTeX error:", err);
      }
    },
    [projectRoot, files, activeFileId, setActiveFile, getContent, requestJumpToPosition],
  );

  // ─── Handlers ───
  const handleZoomIn = () => { setFitMode(null); setScale((s) => Math.min(s * 1.25, 4)); };
  const handleZoomOut = () => { setFitMode(null); setScale((s) => Math.max(s / 1.25, 0.25)); };
  const handlePrevPage = () => setCurrentPage((p) => Math.max(1, p - 1));
  const handleNextPage = () => setCurrentPage((p) => Math.min(totalPages, p + 1));
  const handlePageChange = useCallback((page: number, total: number) => {
    setCurrentPage(page);
    setTotalPages(total);
  }, []);

  const handleZoomPreset = (value: string) => {
    if (value === "fit-width") { setFitMode("fit-width"); setScale(1); }
    else if (value === "fit-height") { setFitMode("fit-height"); setScale(1); }
    else { setFitMode(null); setScale(parseFloat(value.replace("%", "")) / 100); }
  };

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Toolbar */}
      <div className="flex h-[var(--height-preview-thin-toolbar)] shrink-0 items-center gap-1 border-b border-border bg-card px-2">
        {isCompiling && (
          <span className="flex items-center gap-1 text-[length:var(--font-toolbar-label)] text-yellow-500">
            <LoaderIcon className="size-3 animate-spin" />
          </span>
        )}
        {compileError && (
          <span className="flex items-center gap-1 text-[length:var(--font-toolbar-label)] text-red-500">
            <AlertCircleIcon className="size-3" />
          </span>
        )}

        <div className="flex-1" />

        {hasPdf && totalPages > 0 && (
          <>
            <button type="button" className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" onClick={handlePrevPage} disabled={currentPage <= 1}>
              <ChevronLeftIcon className="size-3.5" />
            </button>
            <span className="min-w-[54px] text-center text-[length:var(--font-page-number)]">{currentPage}/{totalPages}</span>
            <button type="button" className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" onClick={handleNextPage} disabled={currentPage >= totalPages}>
              <ChevronRightIcon className="size-3.5" />
            </button>

            <div className="mx-1 h-4 w-px bg-border/60" />

            <button type="button" className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" onClick={handleZoomOut}>
              <ZoomOutIcon className="size-3.5" />
            </button>

            {/* Zoom preset dropdown */}
            <select
              className="h-6 rounded-md border border-border bg-card px-1 text-[length:var(--font-select)] text-muted-foreground focus:outline-none"
              value={fitMode || `${Math.round(scale * 100)}%`}
              onChange={(e) => handleZoomPreset(e.target.value)}
            >
              {ZOOM_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>

            <button type="button" className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" onClick={handleZoomIn}>
              <ZoomInIcon className="size-3.5" />
            </button>

            <div className="mx-1 h-4 w-px bg-border/60" />

            {/* Export PDF */}
            <button type="button" className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" title="Export PDF">
              <DownloadIcon className="size-3.5" />
            </button>
          </>
        )}
      </div>

      {/* Content */}
      <div ref={containerRef} className="flex-1 overflow-hidden">
        {!hasPdf && !compileError && !isCompiling && (
          <div className="flex h-full items-center justify-center text-[length:var(--font-empty-state)] text-muted-foreground">
            Compile to preview PDF
          </div>
        )}
        {compileError && !hasPdf && (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-4">
            <AlertCircleIcon className="size-6 text-red-500" />
            <p className="text-[length:var(--font-error)] text-red-500">Compilation Failed</p>
            <pre className="max-h-32 max-w-md overflow-auto rounded-md bg-muted p-2 text-[length:var(--font-select)]">
              {compileError}
            </pre>
          </div>
        )}
        {hasPdf && pdfBytes && (
          <PdfViewer
            key={pdfRevision}
            data={pdfBytes}
            scale={scale}
            onSynctexClick={handleSynctexClick}
            onPageChange={handlePageChange}
          />
        )}
      </div>
    </div>
  );
}
