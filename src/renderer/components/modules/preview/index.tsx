import { useState, useEffect, useMemo, useCallback, useRef, useContext } from "react";
import {
  Root,
  Pages,
  Page,
  CanvasLayer,
  TextLayer,
  AnnotationLayer,
  ColoredHighlightLayer,
  Outline,
  OutlineItem,
  OutlineChildItems,
  Search,
  Thumbnails,
  Thumbnail,
  useSearch,
  usePdfJump,
  usePdf,
} from "@anaralabs/lector";
import type { SearchResult, ColoredHighlight } from "@anaralabs/lector";
import "pdfjs-dist/web/pdf_viewer.css";
// Import GlobalWorkerOptions from the same legacy build that Lector uses
// internally (pdfjs-dist/legacy/build/pdf.mjs). If we import from the
// standard "pdfjs-dist" entry, we get a DIFFERENT GlobalWorkerOptions
// instance — and Lector's getDocument() won't see our workerSrc setting.
//
// Likewise, we must use the LEGACY worker — the legacy main library and
// standard worker have incompatible internal APIs (e.g. toHex differences).
import { GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfjsWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import {
  LoaderIcon,
  AlertCircleIcon,
  ListIcon,
  SearchIcon,
  LayoutPanelLeftIcon,
  XIcon,
  PlusIcon,
  MinusIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  SunIcon,
  MoonIcon,
  MonitorIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCompileStore, getPdfBytes } from "@/stores/compile-store";
import { useDocumentStore } from "@/stores/document-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useSyncTex } from "@/hooks/use-synctex";
import { saveViewerPosition, loadViewerPosition } from "@/lib/viewer-position";
import { TabContext } from "@/lib/tab-context";

GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

const PDFJS_DOCUMENT_OPTIONS = {
  cMapUrl: "./pdfjs-dist/cmaps/",
  standardFontDataUrl: "./pdfjs-dist/standard_fonts/",
  wasmUrl: "./pdfjs-dist/wasm/",
  iccUrl: "./pdfjs-dist/iccs/",
} as const;

type SidePanel = "outline" | "search" | "thumbnails" | null;

// ─── Side Panel Sub-Components (rendered inside <Root>) ───

function OutlinePanel({ onJump }: { onJump?: () => void }) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex h-[var(--height-preview-thin-toolbar)] shrink-0 items-center border-b border-border px-2">
        <span className="text-[length:var(--font-toolbar-label)] font-medium text-muted-foreground">Outline</span>
      </div>
      <div className="flex-1 overflow-auto">
        <Outline className="text-[length:var(--font-toolbar-label)]">
          <OutlineItem
            className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors [&>[data-level]]:block [&>[data-level]]:truncate [&>[data-level]]:py-0.5 [&>[data-level]]:px-2 [&>[data-level='0']]:pl-2 [&>[data-level='1']]:pl-5 [&>[data-level='2']]:pl-8 [&>[data-level='3']]:pl-11"
            onClick={onJump}
          >
            <OutlineChildItems
              children={
                [<OutlineItem
                  key="nested"
                  className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors [&>[data-level]]:block [&>[data-level]]:truncate [&>[data-level]]:py-0.5 [&>[data-level]]:px-2"
                  onClick={onJump}
                />] as any
              }
            />
          </OutlineItem>
        </Outline>
      </div>
    </div>
  );
}

function SearchPanel() {
  const { search } = useSearch();
  const { jumpToPage } = usePdfJump();
  const [query, setQuery] = useState("");

  const results = query.trim()
    ? search(query, { limit: 50 })
    : { exactMatches: [], fuzzyMatches: [], hasMoreResults: false };

  const allMatches = [
    ...results.exactMatches.map((m: SearchResult) => ({ ...m, label: "exact" as const })),
    ...results.fuzzyMatches.map((m: SearchResult) => ({ ...m, label: "fuzzy" as const })),
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex h-[var(--height-preview-thin-toolbar)] shrink-0 items-center gap-1 border-b border-border px-2">
        <SearchIcon className="size-3 text-muted-foreground shrink-0" />
        <input
          type="text" value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search PDF…"
          className="flex-1 bg-transparent text-[length:var(--font-toolbar-label)] text-foreground placeholder:text-muted-foreground outline-none"
        />
        {query && (
          <button type="button" className="p-0.5 rounded text-muted-foreground hover:text-foreground" onClick={() => setQuery("")}>
            <XIcon className="size-3" />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-auto">
        {query.trim() && allMatches.length === 0 && (
          <p className="px-2 py-4 text-[length:var(--font-toolbar-label)] text-muted-foreground text-center">No results</p>
        )}
        {allMatches.map((m, i) => (
          <button
            key={`${m.pageNumber}-${m.matchIndex}-${i}`}
            type="button"
            className="w-full text-left px-2 py-1.5 text-[length:var(--font-toolbar-label)] hover:bg-muted transition-colors border-b border-border/50"
            onClick={() => jumpToPage(m.pageNumber, { align: "start", behavior: "auto" })}
          >
            <span className="text-muted-foreground">p.{m.pageNumber}</span>{" "}
            <span className="text-muted-foreground/70 truncate block">
              {m.text.slice(Math.max(0, m.matchIndex - 20), m.matchIndex + 80)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ThumbnailsPanel() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex h-[var(--height-preview-thin-toolbar)] shrink-0 items-center border-b border-border px-2">
        <span className="text-[length:var(--font-toolbar-label)] font-medium text-muted-foreground">Pages</span>
      </div>
      <div className="flex-1 overflow-auto p-2">
        <Thumbnails className="flex flex-col items-center gap-2">
          <Thumbnail className="max-w-full rounded shadow-sm border border-border cursor-pointer hover:shadow-md transition-shadow" />
        </Thumbnails>
      </div>
    </div>
  );
}

// ─── Toolbar toggle config ───

const PANEL_WIDTH = 220;

interface PanelToggle {
  id: SidePanel;
  label: string;
  icon: React.ReactNode;
}

const PANEL_TOGGLES: PanelToggle[] = [
  { id: "outline", label: "Outline", icon: <ListIcon className="size-3.5" /> },
  { id: "search", label: "Search", icon: <SearchIcon className="size-3.5" /> },
  { id: "thumbnails", label: "Pages", icon: <LayoutPanelLeftIcon className="size-3.5" /> },
];

// ─── Inner Component (renders inside <Root> — safe to use PDF context hooks) ───

interface PdfViewerInnerProps {
  isPdfFile: boolean;
  isCompiling: boolean;
  compileError: string | null;
  /** Key used to persist/restore page position across sessions. */
  persistKey?: string;
}

function PdfViewerInner({ isPdfFile, isCompiling, compileError, persistKey }: PdfViewerInnerProps) {
  const [sidePanel, setSidePanel] = useState<SidePanel>(null);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const pdfDarkFromSettings = useSettingsStore((s) => s.settings.pdfDarkMode);
  const [pdfDark, setPdfDark] = useState<"off" | "on" | "follow">(pdfDarkFromSettings ?? "off");
  // Sync local state when settings load asynchronously
  useEffect(() => {
    if (pdfDarkFromSettings) setPdfDark(pdfDarkFromSettings);
  }, [pdfDarkFromSettings]);
  const { resolvedTheme } = useTheme();
  const pdfDarkActive = pdfDark === "on" || (pdfDark === "follow" && resolvedTheme === "dark");

  const cyclePdfDark = () => {
    setPdfDark((prev) => {
      const next = prev === "off" ? "on" : prev === "on" ? "follow" : "off";
      updateSettings({ pdfDarkMode: next });
      return next;
    });
  };

  // ─── Hooks that require Root context (must be called unconditionally) ───
  const currentPage = usePdf((s) => s.currentPage);
  const pdfDocumentProxy = usePdf((s) => s.pdfDocumentProxy);
  const { jumpToPage } = usePdfJump();

  // ─── Cross-session page position persistence ───
  const pageRestoredRef = useRef(false);
  const currentPageRef = useRef(currentPage);
  currentPageRef.current = currentPage;

  // Restore saved page position once the PDF has loaded
  useEffect(() => {
    if (!pdfDocumentProxy || !persistKey || pageRestoredRef.current) return;
    pageRestoredRef.current = true;
    const saved = loadViewerPosition(persistKey);
    if (saved?.pdfPage && saved.pdfPage > 0 && saved.pdfPage <= (pdfDocumentProxy.numPages ?? Infinity)) {
      jumpToPage(saved.pdfPage, { align: "start", behavior: "auto" });
    }
  }, [pdfDocumentProxy, persistKey]);

  // Save current page position periodically, and on unmount
  useEffect(() => {
    if (!persistKey) return;
    const timer = setInterval(() => {
      if (currentPageRef.current > 0) {
        saveViewerPosition(persistKey, { pdfPage: currentPageRef.current });
      }
    }, 3000);
    return () => {
      clearInterval(timer);
      // Save immediately on unmount (tab close / view switch) so we don't
      // lose the last position if the interval hasn't fired yet
      if (currentPageRef.current > 0) {
        saveViewerPosition(persistKey, { pdfPage: currentPageRef.current });
      }
    };
  }, [persistKey]);

  // ─── SyncTeX (TeX mode only) ───
  const { forwardSearch, reverseSearch } = useSyncTex();
  const addColoredHighlight = usePdf((s) => s.addColoredHighlight);
  const deleteColoredHighlight = usePdf((s) => s.deleteColoredHighlight);
  const synctexHighlightRef = useRef<string | null>(null);

  const handleForwardSearch = useCallback(
    async (line: number) => {
      const pos = await forwardSearch(line);
      if (!pos) return;

      if (synctexHighlightRef.current) {
        deleteColoredHighlight(synctexHighlightRef.current);
      }

      const uuid = `synctex-${Date.now()}`;
      synctexHighlightRef.current = uuid;
      addColoredHighlight({
        color: "color-mix(in srgb, var(--warning) 40%, transparent)",
        rectangles: [{
          pageNumber: pos.page, top: pos.y, left: pos.x,
          height: pos.height, width: pos.width, type: "pixels",
        }],
        pageNumber: pos.page,
        text: "",
        uuid,
      });

      jumpToPage(pos.page - 1, { align: "start", behavior: "smooth" });
    },
    [forwardSearch, addColoredHighlight, deleteColoredHighlight, jumpToPage],
  );

  const handlePageClick = useCallback(
    (e: React.MouseEvent) => {
      if (!e.metaKey && !e.ctrlKey) return;
      if (isPdfFile) return;
      e.preventDefault();

      const pageEl = (e.target as HTMLElement).closest("[data-page-number]") as HTMLElement | null;
      if (!pageEl) return;

      const pageNumber = parseInt(pageEl.dataset.pageNumber || "0", 10);
      if (!pageNumber) return;

      const pageRect = pageEl.getBoundingClientRect();
      const zoom = parseFloat(
        pageEl.style.transform?.match(/scale3?\(([\d.]+)/)?.[1] || "1",
      );
      const x = (e.clientX - pageRect.left) / zoom;
      const y = (e.clientY - pageRect.top) / zoom;

      reverseSearch(pageNumber, x, y);
    },
    [isPdfFile, reverseSearch],
  );

  // Keyboard shortcut: Cmd+Shift+F = forward search
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "f") {
        e.preventDefault();
        if (isPdfFile) return;
        const editorView = (window as any).__cmEditorView;
        if (editorView) {
          const line = editorView.state.doc.lineAt(editorView.state.selection.main.head);
          handleForwardSearch(line.number);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isPdfFile, handleForwardSearch]);

  const panelOpen = sidePanel !== null;
  const zoom = usePdf((s) => s.zoom);
  const updateZoom = usePdf((s) => s.updateZoom);
  const totalPages = usePdf((s) => s.pdfDocumentProxy?.numPages ?? 0);

  const handleZoomIn = useCallback(() => updateZoom((z: number) => Math.round((z + 0.1) * 10) / 10), [updateZoom]);
  const handleZoomOut = useCallback(() => updateZoom((z: number) => Math.round((z - 0.1) * 10) / 10), [updateZoom]);
  const handlePrevPage = useCallback(() => {
    if (currentPage > 1) jumpToPage(currentPage - 1, { align: "start", behavior: "auto" });
  }, [currentPage, jumpToPage]);
  const handleNextPage = useCallback(() => {
    if (currentPage < totalPages) jumpToPage(currentPage + 1, { align: "start", behavior: "auto" });
  }, [currentPage, totalPages, jumpToPage]);

  return (
    <>
      {/* Toolbar */}
      <div className="flex h-8 shrink-0 items-center gap-0.5 border-b border-border bg-card px-2 text-[length:var(--font-toolbar-label)]">
        {/* Left: side panel toggles */}
        <div className="flex items-center gap-0.5">
          {PANEL_TOGGLES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`flex size-6 items-center justify-center rounded transition-colors ${
                sidePanel === t.id
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              }`}
              title={t.label}
              onClick={() => setSidePanel(sidePanel === t.id ? null : t.id)}
            >
              {t.icon}
            </button>
          ))}
        </div>

        {/* Compile status (TeX mode only) */}
        <div className="flex items-center gap-1.5">
          {!isPdfFile && isCompiling && (
            <span className="flex items-center gap-1 text-warning">
              <LoaderIcon className="size-3 animate-spin" /> Compiling…
            </span>
          )}
          {!isPdfFile && compileError && (
            <span className="flex items-center gap-1 text-destructive">
              <AlertCircleIcon className="size-3" /> Error
            </span>
          )}
        </div>

        <div className="flex-1" />

        <span className="mx-0.5 h-3 w-px bg-border shrink-0" />

        {/* Zoom controls */}
        <div className="flex items-center">
          <Button
            variant="ghost" size="icon" className="size-6 rounded-r-none"
            title="Zoom out" onClick={handleZoomOut}
          >
            <MinusIcon className="size-3.5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="h-6 min-w-[3rem] px-0.5 tabular-nums text-muted-foreground hover:text-foreground rounded transition-colors cursor-pointer select-none"
                title="Zoom presets"
              >
                {Math.round(zoom * 100)}%
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="min-w-[6rem]">
              <DropdownMenuItem onClick={() => updateZoom(0.5)}>50%</DropdownMenuItem>
              <DropdownMenuItem onClick={() => updateZoom(0.75)}>75%</DropdownMenuItem>
              <DropdownMenuItem onClick={() => updateZoom(1)}>100%</DropdownMenuItem>
              <DropdownMenuItem onClick={() => updateZoom(1.25)}>125%</DropdownMenuItem>
              <DropdownMenuItem onClick={() => updateZoom(1.5)}>150%</DropdownMenuItem>
              <DropdownMenuItem onClick={() => updateZoom(2)}>200%</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost" size="icon" className="size-6 rounded-l-none"
            title="Zoom in" onClick={handleZoomIn}
          >
            <PlusIcon className="size-3.5" />
          </Button>
        </div>

        <span className="mx-0.5 h-3 w-px bg-border shrink-0" />

        {/* Page navigation */}
        <div className="flex items-center">
          <Button
            variant="ghost" size="icon" className="size-6 rounded-r-none"
            title="Previous page" disabled={currentPage <= 1}
            onClick={handlePrevPage}
          >
            <ChevronLeftIcon className="size-3.5" />
          </Button>
          <span className="inline-flex items-center h-6 px-0.5 tabular-nums text-muted-foreground select-none min-w-[3rem] justify-center">
            {currentPage}<span className="text-border mx-px">/</span>{totalPages}
          </span>
          <Button
            variant="ghost" size="icon" className="size-6 rounded-l-none"
            title="Next page" disabled={currentPage >= totalPages}
            onClick={handleNextPage}
          >
            <ChevronRightIcon className="size-3.5" />
          </Button>
        </div>

        <span className="mx-0.5 h-3 w-px bg-border shrink-0" />

        {/* PDF dark mode toggle */}
        <button
          type="button"
          className={`flex size-6 items-center justify-center rounded transition-colors ${
            pdfDark !== "off" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
          title={pdfDark === "on" ? "Light mode" : pdfDark === "follow" ? "Following app theme" : "Dark mode"}
          onClick={cyclePdfDark}
        >
          {pdfDark === "on" ? <MoonIcon className="size-3.5" /> : pdfDark === "follow" ? <MonitorIcon className="size-3.5" /> : <SunIcon className="size-3.5" />}
        </button>
      </div>

      {/* Body: Side Panel + Pages */}
      <div className="flex flex-1 min-h-0">
        {panelOpen && (
          <div className="shrink-0 border-r border-border bg-card overflow-hidden" style={{ width: PANEL_WIDTH }}>
            {sidePanel === "outline" && <OutlinePanel onJump={() => setSidePanel(null)} />}
            {sidePanel === "search" && (
              <Search loading={<span className="flex justify-center pt-10 text-muted-foreground text-[length:var(--font-placeholder)]">Indexing…</span>}>
                <SearchPanel />
              </Search>
            )}
            {sidePanel === "thumbnails" && <ThumbnailsPanel />}
          </div>
        )}

        {/* PDF Pages — Pages component provides its own virtualized scroll container.
            We pass scroll + click props directly to Pages rather than wrapping in
            an extra div, which would interfere with the virtualizer's height calc. */}
        <Pages
          className={`flex-1 min-w-0 overflow-auto overscroll-contain p-4 select-text${pdfDarkActive ? " [filter:invert(87%)_hue-rotate(180deg)]" : ""}`}
          gap={16}
          onClick={handlePageClick}
        >
          <Page className="bg-white shadow-md">
            <CanvasLayer />
            <TextLayer />
            <AnnotationLayer />
            {!isPdfFile && <ColoredHighlightLayer />}
          </Page>
        </Pages>
      </div>
    </>
  );
}

// ─── Outer Component (handles file loading, source computation) ───

export function PdfPreview() {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const { isCompiling, compileError, pdfRevision } = useCompileStore();
  const files = useDocumentStore((s) => s.files);
  const storeTabs = useRightPanelStore((s) => s.tabs);
  const storeActiveTabId = useRightPanelStore((s) => s.activeTabId);
  const tabCtx = useContext(TabContext);

  // Prefer per-tab context (when rendered inside PaneContent); fall back to
  // global active tab (when rendered directly by RightMainArea for compiled PDFs).
  const activeTab = tabCtx?.tab ?? storeTabs.find((t) => t.id === storeActiveTabId);
  const isPdfFile = activeTab?.filePath?.toLowerCase().endsWith(".pdf") ?? false;

  const [fileDataUrl, setFileDataUrl] = useState<string | null>(null);

  const pdfBytes = useMemo(() => {
    if (isPdfFile) return null;
    if (projectRoot) return getPdfBytes(projectRoot) ?? null;
    return null;
  }, [isPdfFile, projectRoot, pdfRevision]);

  useEffect(() => {
    if (!isPdfFile || !activeTab?.fileId) {
      setFileDataUrl(null);
      return;
    }
    const file = files.find((f) => f.id === activeTab.fileId);
    if (!file?.absolutePath) return;
    let cancelled = false;
    (async () => {
      try {
        const { dataUrl } = await window.electronAPI.fsReadImage(file.absolutePath);
        if (!cancelled) setFileDataUrl(dataUrl);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [isPdfFile, activeTab?.fileId, files]);

  const source: string | Uint8Array | null = useMemo(() => {
    if (fileDataUrl) return fileDataUrl;
    // CRITICAL: pdfBytes.slice() creates a fresh copy. PDF.js transfers
    // (not copies) the ArrayBuffer to its web worker via postMessage.
    // Without this, React Strict Mode double-invocation detaches the buffer.
    if (pdfBytes) return pdfBytes.slice();
    return null;
  }, [fileDataUrl, pdfBytes]);

  // Persistence key: unique identifier for this PDF view.
  // For compiled PDFs we key on the .tex source file; for standalone .pdf
  // files we key on the .pdf file itself.
  const persistKey = useMemo(() => {
    if (!projectRoot || !activeTab?.fileId) return undefined;
    return `${projectRoot}::${activeTab.fileId}`;
  }, [projectRoot, activeTab?.fileId]);

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex-1 overflow-hidden bg-muted/30">
        {source ? (
          <Root
            source={source}
            documentOptions={PDFJS_DOCUMENT_OPTIONS}
            isZoomFitWidth
            className="h-full flex flex-col"
            loader={
              <span className="flex justify-center pt-20 text-muted-foreground text-[length:var(--font-placeholder)]">
                Loading…
              </span>
            }
          >
            <PdfViewerInner
              isPdfFile={isPdfFile}
              isCompiling={isCompiling}
              compileError={compileError}
              persistKey={persistKey}
            />
          </Root>
        ) : !isCompiling && !source ? (
          <span className="flex justify-center pt-20 text-muted-foreground text-[length:var(--font-placeholder)]">
            Compile to preview PDF
          </span>
        ) : null}
      </div>
    </div>
  );
}
