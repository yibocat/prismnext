import { useEffect, useState, useCallback, useRef } from "react";
import {
  PlayIcon,
  RefreshCwIcon,
  LoaderIcon,
  AlertCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ZoomInIcon,
  ZoomOutIcon,
  DownloadIcon,
  ZapIcon,
  ZapOffIcon,
} from "lucide-react";
import { PdfViewer } from "./pdf-viewer";
import { useCompileStore, getPdfBytes } from "@/stores/compile-store";
import { useDocumentStore } from "@/stores/document-store";
import { resolveCompileTarget } from "@/lib/resolve-tex-root";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Zoom presets
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
  const { projectRoot, files, activeFileId, setActiveFile, requestJumpToPosition, getContent } =
    useDocumentStore();
  const {
    isCompiling,
    compileError,
    pdfRevision,
    compilerBackend,
    compilerStatus,
    autoCompile,
    compile,
    setCompilerBackend,
    toggleAutoCompile,
    detectCompilers,
  } = useCompileStore();

  const [scale, setScale] = useState(1);
  const [fitMode, setFitMode] = useState<"fit-width" | "fit-height" | null>("fit-width");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const gestureStartScaleRef = useRef(1);

  // Detect compilers on mount
  useEffect(() => {
    detectCompilers();
  }, [detectCompilers]);

  // Pinch-to-zoom gesture support (macOS trackpad)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        // Use deltaY magnitude so fast scroll = fast zoom, slow scroll = slow zoom
        // Clamp to avoid extreme jumps from high-res trackpads
        const normalized = Math.min(Math.abs(e.deltaY), 300);
        const direction = e.deltaY > 0 ? -1 : 1;
        // Exponential zoom: symmetric zoom-in/zoom-out, proportional to scroll speed
        const factor = Math.exp(direction * normalized * 0.008);
        setScale((s) => Math.max(0.25, Math.min(4, s * factor)));
        setFitMode(null);
      }
    };

    const handleGestureStart = () => {
      gestureStartScaleRef.current = scale;
    };
    const handleGesture = (e: Event) => {
      const gestureEvent = e as any;
      if (gestureEvent.scale !== undefined) {
        e.preventDefault();
        const newScale = gestureStartScaleRef.current * gestureEvent.scale;
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

  // Get PDF bytes from cache
  const pdfBytes = projectRoot ? getPdfBytes(projectRoot) : null;
  const hasPdf = pdfBytes !== null && pdfBytes !== undefined;

  // Handle compile
  const handleCompile = useCallback(async () => {
    if (!projectRoot || !activeFileId) return;

    const resolved = resolveCompileTarget(activeFileId, files, getContent);
    if (resolved) {
      await compile(projectRoot, resolved.targetPath);
    }
  }, [projectRoot, activeFileId, files, compile, getContent]);

  // Handle page change
  const handlePageChange = useCallback((page: number, total: number) => {
    setCurrentPage(page);
    setTotalPages(total);
  }, []);

  // Handle zoom
  const handleZoomIn = useCallback(() => {
    setFitMode(null);
    setScale((s) => Math.min(s * 1.25, 4));
  }, []);

  const handleZoomOut = useCallback(() => {
    setFitMode(null);
    setScale((s) => Math.max(s / 1.25, 0.25));
  }, []);

  const handleZoomPreset = useCallback((value: string) => {
    if (value === "fit-width") {
      setFitMode("fit-width");
      setScale(1);
    } else if (value === "fit-height") {
      setFitMode("fit-height");
      setScale(1);
    } else {
      setFitMode(null);
      // Value is now "50%", "75%", etc.
      const percent = parseFloat(value.replace("%", ""));
      setScale(percent / 100);
    }
  }, []);

  // Handle page navigation
  const handlePrevPage = useCallback(() => {
    setCurrentPage((p) => Math.max(1, p - 1));
  }, []);

  const handleNextPage = useCallback(() => {
    setCurrentPage((p) => Math.min(totalPages, p + 1));
  }, []);

  // Handle external link
  const handleExternalLink = useCallback((href: string) => {
    // Open external link in system browser
    window.electronAPI.dialogOpenFolder; // Placeholder - need shell API
    // For now, just log
    console.log("[pdf-preview] External link:", href);
  }, []);

  // Handle SyncTeX click
  const handleSynctexClick = useCallback(
    async (page: number, x: number, y: number) => {
      if (!projectRoot) return;

      try {
        const result = await window.electronAPI.compileSynctex(
          projectRoot,
          page,
          x,
          y,
        );

        if (!result) return;

        // Find target file
        const targetFile = files.find(
          (f) =>
            f.relativePath === result.file ||
            f.relativePath.endsWith("/" + result.file) ||
            f.relativePath.endsWith("\\" + result.file),
        );

        if (!targetFile) return;

        // Switch file if needed
        if (targetFile.id !== activeFileId) {
          setActiveFile(targetFile.id);
        }

        // Compute offset from line
        const content = getContent(targetFile.id);
        const lines = content.split("\n");
        let offset = 0;
        for (let i = 0; i < Math.min(result.line - 1, lines.length); i++) {
          offset += lines[i].length + 1;
        }

        requestJumpToPosition(offset);
      } catch (error) {
        console.error("[pdf-preview] SyncTeX error:", error);
      }
    },
    [projectRoot, files, activeFileId, setActiveFile, requestJumpToPosition, getContent],
  );

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Toolbar header */}
      <div className="drag-region flex h-[calc(36px+var(--titlebar-height))] shrink-0 items-center gap-2 border-border border-b bg-muted/30 px-3 pt-[var(--titlebar-height)]">
        {/* Compiler selector */}
        <Select
          value={compilerBackend}
          onValueChange={(v) => setCompilerBackend(v as "tectonic" | "texlive")}
        >
          <SelectTrigger className="h-7 w-28 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tectonic" disabled={!compilerStatus?.tectonic}>
              Tectonic
            </SelectItem>
            <SelectItem value="texlive" disabled={!compilerStatus?.texlive?.available}>
              TeX Live
            </SelectItem>
          </SelectContent>
        </Select>

        {/* Compile button */}
        <Button
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={handleCompile}
          disabled={isCompiling || !activeFileId}
        >
          {isCompiling ? (
            <LoaderIcon className="size-3 animate-spin" />
          ) : hasPdf ? (
            <RefreshCwIcon className="size-3" />
          ) : (
            <PlayIcon className="size-3" />
          )}
          {isCompiling ? "Compiling..." : hasPdf ? "Recompile" : "Compile"}
        </Button>

        {/* Auto-compile toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={toggleAutoCompile}
          title={autoCompile ? "Auto-compile: ON (2s delay)" : "Auto-compile: OFF"}
        >
          {autoCompile ? (
            <ZapIcon className="size-3 text-yellow-500" />
          ) : (
            <ZapOffIcon className="size-3" />
          )}
        </Button>

        {/* Error indicator */}
        {compileError && (
          <div className="flex items-center gap-1 text-destructive text-xs">
            <AlertCircleIcon className="size-3" />
            <span>Error</span>
          </div>
        )}

        <div className="flex-1" />

        {/* Page navigation */}
        {hasPdf && totalPages > 0 && (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={handlePrevPage}
              disabled={currentPage <= 1}
            >
              <ChevronLeftIcon className="size-3" />
            </Button>
            <span className="text-xs">
              {currentPage} / {totalPages}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={handleNextPage}
              disabled={currentPage >= totalPages}
            >
              <ChevronRightIcon className="size-3" />
            </Button>
          </div>
        )}

        {/* Zoom controls */}
        {hasPdf && (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={handleZoomOut}
            >
              <ZoomOutIcon className="size-3" />
            </Button>
            <Select
              value={fitMode || `${Math.round(scale * 100)}%`}
              onValueChange={handleZoomPreset}
            >
              <SelectTrigger className="h-7 w-20 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ZOOM_PRESETS.map((preset) => (
                  <SelectItem key={preset.value} value={preset.value}>
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={handleZoomIn}
            >
              <ZoomInIcon className="size-3" />
            </Button>
          </div>
        )}

        {/* Download button */}
        {hasPdf && (
          <Button variant="ghost" size="icon" className="size-7" title="Export PDF">
            <DownloadIcon className="size-3" />
          </Button>
        )}
      </div>

      {/* Content area */}
      <div ref={containerRef} className="flex-1 overflow-hidden">
        {!hasPdf && !compileError && (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <div className="text-center">
              <p className="font-medium text-muted-foreground text-sm">PDF Preview</p>
              <p className="text-muted-foreground/60 text-xs">
                Press Cmd+Enter to compile
              </p>
            </div>
            <Button size="sm" onClick={handleCompile} disabled={!activeFileId || isCompiling}>
              {isCompiling ? (
                <LoaderIcon className="mr-2 size-4 animate-spin" />
              ) : (
                <PlayIcon className="mr-2 size-4" />
              )}
              Compile
            </Button>
          </div>
        )}

        {compileError && !hasPdf && (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-4">
            <div className="max-w-md text-center">
              <AlertCircleIcon className="mx-auto mb-2 size-8 text-destructive" />
              <p className="font-medium text-sm">Compilation Failed</p>
              <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-muted p-3 text-left text-xs">
                {compileError}
              </pre>
            </div>
            <Button size="sm" onClick={handleCompile} disabled={isCompiling}>
              <RefreshCwIcon className="mr-2 size-4" />
              Retry
            </Button>
          </div>
        )}

        {hasPdf && pdfBytes && (
          <PdfViewer
            key={pdfRevision}
            data={pdfBytes}
            scale={scale}
            onSynctexClick={handleSynctexClick}
            onExternalLink={handleExternalLink}
            onPageChange={handlePageChange}
          />
        )}
      </div>
    </div>
  );
}
