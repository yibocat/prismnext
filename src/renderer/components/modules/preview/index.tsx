import { useState, useEffect, useMemo, useCallback, useRef, useContext, type ReactNode } from "react";
import {
  Root,
  Pages,
  Page,
  CanvasLayer,
  TextLayer,
  AnnotationLayer,
  HighlightLayer,
  Outline,
  OutlineItem,
  OutlineChildItems,
  Search,
  Thumbnails,
  Thumbnail,
  useSearch,
  usePdfJump,
  usePdf,
  usePDFLinkService,
  calculateHighlightRects,
} from "@anaralabs/lector";
import type { SearchResult } from "@anaralabs/lector";
import "pdfjs-dist/web/pdf_viewer.css";
import {
  PDFJS_DOCUMENT_OPTIONS,
  PDF_PAGES_CLASS,
  PDF_PAGES_STYLE,
  PDF_PAGE_CLASS,
  PDF_PAGE_DARK_FILTER,
  PDF_PAGE_INVERTED_CLASS,
  copyPdfSourceForViewer,
} from "./pdf-config";
import { PdfScrollClamp } from "./pdf-scroll-clamp";
import { cn } from "@/lib/utils";
import { Hint } from "@/components/ui/hint";
import { applyPdfZoomMode, PDF_ZOOM_MODE_LABELS, type PdfZoomMode } from "./pdf-zoom";
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
  AppMenu,
  AppMenuCheckItem,
  AppMenuContent,
  AppMenuTrigger,
} from "@/components/ui/app-menu";
import { useCompileStore, getPdfBytes, ensureCompilePdfFromDisk } from "@/stores/compile-store";
import { useDocumentStore } from "@/stores/document-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useSettingsStore } from "@/stores/settings-store";
import { saveViewerPosition, loadViewerPosition } from "@/lib/editor/viewer-position";
import { TabContext } from "@/lib/workspace/tab-context";
import { isBrowsableUrl, normalizeBrowserUrl, openUrlInBrowser } from "@/lib/browser-link";
import { useTranslation } from "react-i18next";

type SidePanel = "outline" | "search" | "thumbnails" | null;

const ZOOM_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
const FIT_ZOOM_MODES: PdfZoomMode[] = ["fit-width", "fit-height", "fit-page", "actual-size"];

const outlineItemClass =
  "cursor-pointer text-muted-foreground hover:text-foreground transition-colors [&_a]:block [&_a]:truncate [&_a]:py-0.5 [&_a]:px-2 [&_a[data-level='0']]:pl-2 [&_a[data-level='1']]:pl-5 [&_a[data-level='2']]:pl-8 [&_a[data-level='3']]:pl-11 [&_a[data-level='4']]:pl-14";

/** Wire Lector LinkService page jumps to the active PDF viewport. */
function PdfLinkNavigationBridge() {
  const linkService = usePDFLinkService();
  const { jumpToPage } = usePdfJump();

  useEffect(() => {
    linkService.registerPageNavigationCallback((pageNumber: number) => {
      jumpToPage(pageNumber, { align: "start", behavior: "auto" });
    });
    return () => linkService.unregisterPageNavigationCallback();
  }, [linkService, jumpToPage]);

  return null;
}

/** Consume forward SyncTeX requests from the TeX editor (⌘⇧F). */
function SynctexForwardBridge() {
  const target = useCompileStore((s) => s.synctexForwardTarget);
  const { jumpToHighlightRects } = usePdfJump();
  const getPdfPageProxy = usePdf((s) => s.getPdfPageProxy);

  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    void (async () => {
      try {
        const pageProxy = getPdfPageProxy(target.page);
        const viewport = pageProxy.getViewport({ scale: 1 });
        // SyncTeX y is from page bottom; Lector/PDF.js highlights use top-left.
        const top = viewport.height - target.y - target.height;
        if (cancelled) return;
        jumpToHighlightRects(
          [
            {
              pageNumber: target.page,
              left: target.x,
              top: Math.max(0, top),
              width: target.width,
              height: target.height,
              type: "pixels",
            },
          ],
          "pixels",
        );
      } catch {
        /* page not ready yet */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [target, getPdfPageProxy, jumpToHighlightRects]);

  return null;
}

/** Route PDF links: external → in-app browser; internal → in-document jump. */
function PdfLinkCapture() {
  const viewportRef = usePdf((s) => s.viewportRef);
  const pdfDocumentProxy = usePdf((s) => s.pdfDocumentProxy);
  const linkService = usePDFLinkService();
  const { jumpToPage } = usePdfJump();

  useEffect(() => {
    const root = viewportRef.current;
    if (!root || !pdfDocumentProxy) return;

    const resolveExternalUrl = (anchor: HTMLAnchorElement): string | null => {
      const href = anchor.getAttribute("href")?.trim() ?? "";
      if (!href || href === "#" || href.startsWith("#")) return null;
      const normalized = normalizeBrowserUrl(href);
      return isBrowsableUrl(normalized) ? normalized : null;
    };

    const handleLinkActivate = async (e: MouseEvent, newTab: boolean) => {
      const target = e.target;
      if (!target || !(target instanceof Element)) return;
      const anchor = target.closest("a");
      if (!anchor?.closest(".annotationLayer, .textLayer")) return;

      const href = anchor.getAttribute("href")?.trim() ?? "";
      if (!href || href === "#") return;

      const external = resolveExternalUrl(anchor);
      if (external) {
        e.preventDefault();
        e.stopPropagation();
        openUrlInBrowser(external, { newTab });
        return;
      }

      if (!href.startsWith("#")) return;

      e.preventDefault();
      e.stopPropagation();

      if (href.startsWith("#page=")) {
        const page = Number.parseInt(href.slice("#page=".length), 10);
        if (!Number.isNaN(page)) {
          jumpToPage(page, { align: "start", behavior: "auto" });
        }
        return;
      }

      const dest = href.slice(1);
      if (dest) {
        await linkService.goToDestination(dest);
      }
    };

    const onClickCapture = (e: MouseEvent) => {
      if (e.button !== 0) return;
      void handleLinkActivate(e, e.metaKey || e.ctrlKey);
    };

    const onAuxClickCapture = (e: MouseEvent) => {
      if (e.button !== 1) return;
      void handleLinkActivate(e, true);
    };

    root.addEventListener("click", onClickCapture, true);
    root.addEventListener("auxclick", onAuxClickCapture, true);
    return () => {
      root.removeEventListener("click", onClickCapture, true);
      root.removeEventListener("auxclick", onAuxClickCapture, true);
    };
  }, [viewportRef, pdfDocumentProxy, jumpToPage, linkService]);

  return null;
}

// ─── Side Panel Sub-Components (rendered inside <Root>) ───

function OutlinePanel({ onJump }: { onJump?: () => void }) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex h-[var(--height-preview-thin-toolbar)] shrink-0 items-center border-b border-border px-2">
        <span className="text-[length:var(--font-toolbar-label)] font-medium text-muted-foreground">Outline</span>
      </div>
      <div
        className="flex-1 overflow-auto"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a[role='button']")) onJump?.();
        }}
      >
        <Outline className="text-[length:var(--font-toolbar-label)] p-1">
          <OutlineItem className={outlineItemClass}>
            <OutlineChildItems className="list-none pl-0" />
          </OutlineItem>
        </Outline>
      </div>
    </div>
  );
}

function SearchResultItem({
  result,
  searchText,
}: {
  result: SearchResult;
  searchText: string;
}) {
  const { jumpToHighlightRects } = usePdfJump();
  const getPdfPageProxy = usePdf((s) => s.getPdfPageProxy);

  const handleClick = async () => {
    const pageProxy = getPdfPageProxy(result.pageNumber);
    const rects = await calculateHighlightRects(pageProxy, {
      pageNumber: result.pageNumber,
      text: result.text,
      matchIndex: result.matchIndex,
      searchText,
    });
    jumpToHighlightRects(rects, "pixels");
  };

  return (
    <button
      type="button"
      className="w-full text-left px-2 py-1.5 text-[length:var(--font-toolbar-label)] hover:bg-muted transition-colors border-b border-border/50"
      onClick={() => void handleClick()}
    >
      <span className="text-muted-foreground">p.{result.pageNumber}</span>{" "}
      <span className="text-foreground truncate block">{result.text.trim() || searchText}</span>
    </button>
  );
}

function SearchPanel() {
  const { search, searchResults } = useSearch();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!debouncedQuery) return;
    void search(debouncedQuery, { limit: 50 });
  }, [debouncedQuery, search]);

  const hasQuery = debouncedQuery.length > 0;
  const allMatches = hasQuery
    ? [
        ...searchResults.exactMatches.map((m) => ({ ...m, kind: "exact" as const })),
        ...searchResults.fuzzyMatches.map((m) => ({ ...m, kind: "fuzzy" as const })),
      ]
    : [];

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
        {hasQuery && allMatches.length === 0 && (
          <p className="px-2 py-4 text-[length:var(--font-toolbar-label)] text-muted-foreground text-center">No results</p>
        )}
        {!hasQuery && (
          <p className="px-2 py-4 text-[length:var(--font-toolbar-label)] text-muted-foreground text-center">Type to search</p>
        )}
        {allMatches.map((m, i) => (
          <SearchResultItem
            key={`${m.pageNumber}-${m.matchIndex}-${m.kind}-${i}`}
            result={m}
            searchText={debouncedQuery}
          />
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

export interface PdfViewerInnerProps {
  isPdfFile: boolean;
  isCompiling: boolean;
  compileError: string | null;
  /** Key used to persist/restore page position across sessions. */
  persistKey?: string;
  /** Extra toolbar controls (must use PDF context hooks — rendered inside Root). */
  toolbarExtra?: ReactNode;
  /** Custom page layers; defaults to sync-highlight layer for TeX preview. */
  pageLayers?: ReactNode;
  /** Layers rendered once per document (inside Root, outside virtualized Pages). */
  documentLayers?: ReactNode;
  /** Chat / lightbox: pages only, no outline/zoom/page chrome. */
  hideToolbar?: boolean;
}

export function PdfViewerInner({
  isPdfFile,
  isCompiling,
  compileError,
  persistKey,
  toolbarExtra,
  pageLayers,
  documentLayers,
  hideToolbar = false,
}: PdfViewerInnerProps) {
  const { t } = useTranslation();
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

  const panelOpen = sidePanel !== null;
  const zoom = usePdf((s) => s.zoom);
  const updateZoom = usePdf((s) => s.updateZoom);
  const zoomFitWidth = usePdf((s) => s.zoomFitWidth);
  const isZoomFitWidth = usePdf((s) => s.isZoomFitWidth);
  const isPinching = usePdf((s) => s.isPinching);
  const viewportRef = usePdf((s) => s.viewportRef);
  const viewports = usePdf((s) => s.viewports);
  const zoomOptions = usePdf((s) => s.zoomOptions);
  const totalPages = usePdf((s) => s.pdfDocumentProxy?.numPages ?? 0);
  const [zoomMode, setZoomMode] = useState<PdfZoomMode>("fit-width");
  const zoomModeRef = useRef<PdfZoomMode>("fit-width");

  // Page memory:
  // - View/swap: TexWorkspaceMain keeps this tree mounted (do not unmount).
  // - Collapse to 0px still wipes Lector scroll → re-apply when size returns.
  // - Recompile creates a new pdfDocumentProxy → re-apply once per document.
  const currentPageRef = useRef(currentPage);
  currentPageRef.current = currentPage;
  const restoredDocRef = useRef<unknown>(null);

  const applySavedPdfPosition = useCallback(() => {
    if (!persistKey || !pdfDocumentProxy) return;
    const el = viewportRef.current;
    if (!el || el.clientWidth < 8 || el.clientHeight < 8) return;
    const saved = loadViewerPosition(persistKey);
    const page = saved?.pdfPage;
    if (
      page == null ||
      page < 1 ||
      page > (pdfDocumentProxy.numPages ?? Infinity)
    ) {
      return;
    }
    jumpToPage(page, { align: "start", behavior: "auto" });
    if (saved.pdfScrollOffset != null && saved.pdfScrollOffset > 0) {
      requestAnimationFrame(() => {
        const vp = viewportRef.current;
        if (vp) vp.scrollTop = saved.pdfScrollOffset!;
      });
    }
  }, [persistKey, pdfDocumentProxy, jumpToPage, viewportRef]);

  useEffect(() => {
    restoredDocRef.current = null;
  }, [persistKey]);

  useEffect(() => {
    if (!persistKey || !pdfDocumentProxy) return;
    if (restoredDocRef.current === pdfDocumentProxy) return;
    restoredDocRef.current = pdfDocumentProxy;
    applySavedPdfPosition();
  }, [persistKey, pdfDocumentProxy, applySavedPdfPosition]);

  useEffect(() => {
    if (!persistKey) return;
    const saveNow = () => {
      if (currentPageRef.current <= 0) return;
      const el = viewportRef.current;
      if (!el || el.clientWidth < 8 || el.clientHeight < 8) return;
      saveViewerPosition(persistKey, {
        pdfPage: currentPageRef.current,
        pdfScrollOffset: el.scrollTop,
      });
    };
    const onScroll = () => saveNow();
    let el: HTMLElement | null = null;
    let wasTiny = true;
    let ro: ResizeObserver | null = null;

    const tryBind = () => {
      const next = viewportRef.current;
      if (!next || next === el) return;
      el?.removeEventListener("scroll", onScroll);
      ro?.disconnect();
      el = next;
      el.addEventListener("scroll", onScroll, { passive: true });
      wasTiny = el.clientWidth < 8 || el.clientHeight < 8;
      ro = new ResizeObserver(() => {
        const node = viewportRef.current;
        if (!node) return;
        const tiny = node.clientWidth < 8 || node.clientHeight < 8;
        if (wasTiny && !tiny) {
          // Panel expanded after tex/pdf-only — put the page back.
          applySavedPdfPosition();
        }
        wasTiny = tiny;
      });
      ro.observe(el);
      if (!wasTiny) applySavedPdfPosition();
    };

    tryBind();
    const interval = setInterval(() => {
      tryBind();
      saveNow();
    }, 2000);
    return () => {
      el?.removeEventListener("scroll", onScroll);
      ro?.disconnect();
      clearInterval(interval);
      saveNow();
    };
  }, [persistKey, pdfDocumentProxy, viewportRef, applySavedPdfPosition]);

  const zoomStore = useMemo(
    () => ({ viewportRef, viewports, zoomOptions, currentPage, updateZoom, zoomFitWidth }),
    [viewportRef, viewports, zoomOptions, currentPage, updateZoom, zoomFitWidth],
  );

  /** Leave fit-* lock so manual zoom / pinch is not overwritten by Lector fit-width resize. */
  const exitFitLock = useCallback(() => {
    zoomModeRef.current = "custom";
    setZoomMode("custom");
    updateZoom((z) => z, false);
  }, [updateZoom]);

  const applyZoomMode = useCallback(
    (mode: PdfZoomMode) => {
      zoomModeRef.current = mode;
      setZoomMode(mode);
      applyPdfZoomMode(mode, zoomStore);
    },
    [zoomStore],
  );

  // Pinch zoom must clear isZoomFitWidth or Lector snaps back on the next layout pass.
  useEffect(() => {
    if (isPinching) exitFitLock();
  }, [isPinching, exitFitLock]);

  const zoomLabel =
    zoomMode === "custom"
      ? `${Math.round(zoom * 100)}%`
      : zoomMode === "fit-width" && isZoomFitWidth
        ? PDF_ZOOM_MODE_LABELS["fit-width"]
        : PDF_ZOOM_MODE_LABELS[zoomMode];

  const handleZoomIn = useCallback(() => {
    exitFitLock();
    updateZoom((z: number) => Math.round((z + 0.1) * 10) / 10, false);
  }, [exitFitLock, updateZoom]);
  const handleZoomOut = useCallback(() => {
    exitFitLock();
    updateZoom((z: number) => Math.round((z - 0.1) * 10) / 10, false);
  }, [exitFitLock, updateZoom]);
  const handlePrevPage = useCallback(() => {
    if (currentPage > 1) jumpToPage(currentPage - 1, { align: "start", behavior: "auto" });
  }, [currentPage, jumpToPage]);
  const handleNextPage = useCallback(() => {
    if (currentPage < totalPages) jumpToPage(currentPage + 1, { align: "start", behavior: "auto" });
  }, [currentPage, totalPages, jumpToPage]);

  return (
    <>
      {/* Index PDF text once on load (Search unmounts if only tied to the side panel). */}
      <Search loading={null}>
        <span className="hidden" aria-hidden />
      </Search>
      <PdfScrollClamp />
      <PdfLinkNavigationBridge />
      <PdfLinkCapture />
      {/* Toolbar — omitted for chat lightbox / compact peeks */}
      {!hideToolbar ? (
        <div data-surface="content" className="flex h-[var(--height-right-area-subtoolbar)] shrink-0 items-center gap-0.5 border-b border-[var(--toolbar-edge-line)] bg-background px-2 text-[length:var(--font-toolbar-label)]">
          {/* Left: side panel toggles */}
          <div className="flex items-center gap-0.5">
            {PANEL_TOGGLES.map((t) => (
              <Hint key={t.id} label={t.label}>
                <button
                  type="button"
                  className={`flex size-6 items-center justify-center rounded transition-colors ${
                    sidePanel === t.id
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  }`}
                  onClick={() => setSidePanel(sidePanel === t.id ? null : t.id)}
                >
                  {t.icon}
                </button>
              </Hint>
            ))}
          </div>

          {toolbarExtra}

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
            <Hint label={t("modes.texworkspace.zoomOut")}>
              <Button
                variant="ghost" size="icon" className="size-6 rounded-r-none"
                onClick={handleZoomOut}
              >
                <MinusIcon className="size-3.5" />
              </Button>
            </Hint>
            <AppMenu>
              <Hint label={t("modes.texworkspace.zoom")}>
                <AppMenuTrigger asChild>
                  <button
                    className="h-6 min-w-[4.5rem] px-1 tabular-nums text-muted-foreground hover:text-foreground rounded transition-colors cursor-pointer select-none text-center"
                  >
                    {zoomLabel}
                  </button>
                </AppMenuTrigger>
              </Hint>
              <AppMenuContent align="center" className="min-w-[8.5rem]">
                {FIT_ZOOM_MODES.map((mode) => (
                  <AppMenuCheckItem
                    key={mode}
                    selected={zoomMode === mode}
                    onClick={() => applyZoomMode(mode)}
                  >
                    {PDF_ZOOM_MODE_LABELS[mode]}
                  </AppMenuCheckItem>
                ))}
                <div className="my-1 h-px bg-border" />
                {ZOOM_PRESETS.map((preset) => (
                  <AppMenuCheckItem
                    key={preset}
                    selected={zoomMode === "custom" && Math.abs(zoom - preset) < 0.01}
                    onClick={() => {
                      zoomModeRef.current = "custom";
                      setZoomMode("custom");
                      updateZoom(preset, false);
                    }}
                  >
                    {Math.round(preset * 100)}%
                  </AppMenuCheckItem>
                ))}
              </AppMenuContent>
            </AppMenu>
            <Hint label={t("modes.texworkspace.zoomIn")}>
              <Button
                variant="ghost" size="icon" className="size-6 rounded-l-none"
                onClick={handleZoomIn}
              >
                <PlusIcon className="size-3.5" />
              </Button>
            </Hint>
          </div>

          <span className="mx-0.5 h-3 w-px bg-border shrink-0" />

          {/* Page navigation */}
          <div className="flex items-center">
            <Hint label={t("modes.texworkspace.prevPage")}>
              <Button
                variant="ghost" size="icon" className="size-6 rounded-r-none"
                disabled={currentPage <= 1}
                onClick={handlePrevPage}
              >
                <ChevronLeftIcon className="size-3.5" />
              </Button>
            </Hint>
            <span className="inline-flex items-center h-6 px-0.5 tabular-nums text-muted-foreground select-none min-w-[3rem] justify-center">
              {currentPage}<span className="text-border mx-px">/</span>{totalPages}
            </span>
            <Hint label={t("modes.texworkspace.nextPage")}>
              <Button
                variant="ghost" size="icon" className="size-6 rounded-l-none"
                disabled={currentPage >= totalPages}
                onClick={handleNextPage}
              >
                <ChevronRightIcon className="size-3.5" />
              </Button>
            </Hint>
          </div>

          <span className="mx-0.5 h-3 w-px bg-border shrink-0" />

          {/* PDF dark mode toggle */}
          <Hint label={pdfDark === "on" ? t("modes.texworkspace.lightMode") : pdfDark === "follow" ? t("modes.texworkspace.followTheme") : t("modes.texworkspace.darkMode")}>
            <button
              type="button"
              className={`flex size-6 items-center justify-center rounded transition-colors ${
                pdfDark !== "off" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={cyclePdfDark}
            >
              {pdfDark === "on" ? <MoonIcon className="size-3.5" /> : pdfDark === "follow" ? <MonitorIcon className="size-3.5" /> : <SunIcon className="size-3.5" />}
            </button>
          </Hint>
        </div>
      ) : null}

      {/* Body: Side Panel + Pages */}
      <div className="relative flex flex-1 min-h-0">
        {!hideToolbar && panelOpen && (
          <div data-surface="sidebar" className="shrink-0 border-r border-[var(--sidebar-edge-line)] bg-sidebar overflow-hidden" style={{ width: PANEL_WIDTH }}>
            {sidePanel === "outline" && <OutlinePanel onJump={() => setSidePanel(null)} />}
            {sidePanel === "search" && <SearchPanel />}
            {sidePanel === "thumbnails" && <ThumbnailsPanel />}
          </div>
        )}

        {/* PDF Pages — Pages component provides its own virtualized scroll container.
            We pass scroll + click props directly to Pages rather than wrapping in
            an extra div, which would interfere with the virtualizer's height calc. */}
        <Pages
          className={PDF_PAGES_CLASS}
          style={PDF_PAGES_STYLE}
          gap={16}
        >
          <Page
            className={`${PDF_PAGE_CLASS}${pdfDarkActive ? ` ${PDF_PAGE_INVERTED_CLASS}${PDF_PAGE_DARK_FILTER}` : ""}`}
          >
            <CanvasLayer />
            <TextLayer />
            <AnnotationLayer />
            {pageLayers ?? (
              <HighlightLayer className="bg-[color-mix(in_srgb,var(--warning)_40%,transparent)]" />
            )}
          </Page>
        </Pages>
        {documentLayers}
      </div>
    </>
  );
}

// ─── Shared document shell (TeX preview, literature reader, etc.) ───

export interface PdfDocumentViewProps {
  source: string | Uint8Array;
  persistKey?: string;
  isPdfFile?: boolean;
  isCompiling?: boolean;
  compileError?: string | null;
  toolbarExtra?: ReactNode;
  pageLayers?: ReactNode;
  documentLayers?: ReactNode;
  className?: string;
  /** Hide outline/zoom/page toolbar (chat PDF lightbox). */
  hideToolbar?: boolean;
}

export function PdfDocumentView({
  source,
  persistKey,
  isPdfFile = false,
  isCompiling = false,
  compileError = null,
  toolbarExtra,
  pageLayers,
  documentLayers,
  className,
  hideToolbar = false,
}: PdfDocumentViewProps) {
  // Fresh TypedArray per mount/source identity — pdf.js detaches buffers it loads.
  const pdfSource = useMemo(() => copyPdfSourceForViewer(source), [source]);

  return (
    <div className={cn("flex h-full flex-col bg-background", className)}>
      <div className="flex-1 overflow-hidden bg-background">
        <Root
          source={pdfSource}
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
            toolbarExtra={toolbarExtra}
            pageLayers={pageLayers}
            documentLayers={documentLayers}
            hideToolbar={hideToolbar}
          />
        </Root>
      </div>
    </div>
  );
}

// ─── TeX / standalone .pdf tab preview ───

export type PdfPreviewSourceMode = "auto" | "compile";

export interface PdfPreviewProps {
  /**
   * `compile` — always show the project compile cache (TeX workspace preview).
   * Never follows the active tab, even when a `.pdf` asset is selected.
   * `auto` — Files / standalone tabs: show the open `.pdf` file, else compile cache.
   */
  sourceMode?: PdfPreviewSourceMode;
}

/** Whether PdfPreview should load a standalone project `.pdf` asset (not compile output). */
export function resolvePdfPreviewIsAssetFile(
  sourceMode: PdfPreviewSourceMode,
  filePath: string | undefined,
): boolean {
  if (sourceMode === "compile") return false;
  return filePath?.toLowerCase().endsWith(".pdf") ?? false;
}

export function resolvePdfPreviewPersistKey(
  sourceMode: PdfPreviewSourceMode,
  projectRoot: string | null | undefined,
  fileId: string | undefined,
): string | undefined {
  if (!projectRoot) return undefined;
  if (sourceMode === "compile") return `${projectRoot}::compile-preview`;
  if (!fileId) return undefined;
  return `${projectRoot}::${fileId}`;
}

export function PdfPreview({ sourceMode = "auto" }: PdfPreviewProps) {
  const { t } = useTranslation();
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const { isCompiling, compileError, pdfRevision } = useCompileStore();
  const fileMetadata = useDocumentStore((s) => s.fileMetadata);
  const storeTabs = useRightPanelStore((s) => s.tabs);
  const storeActiveTabId = useRightPanelStore((s) => s.activeTabId);
  const tabCtx = useContext(TabContext);

  // Prefer per-tab context (when rendered inside PaneContent); fall back to
  // global active tab (when rendered directly by RightMainArea for compiled PDFs).
  const activeTab = tabCtx?.tab ?? storeTabs.find((t) => t.id === storeActiveTabId);
  const isPdfFile = resolvePdfPreviewIsAssetFile(sourceMode, activeTab?.filePath);
  const fileId = activeTab?.fileId ?? null;
  const absolutePath = fileId
    ? (fileMetadata.get(fileId)?.absolutePath ?? null)
    : null;

  /** Standalone Files PDF — same Uint8Array path as compile preview (not data URL). */
  const [filePdfBytes, setFilePdfBytes] = useState<Uint8Array | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** Hydrating compile preview from `.prismnext/compile/` when memory cache is empty. */
  const [diskHydrating, setDiskHydrating] = useState(false);

  const compilePdfBytes = useMemo(() => {
    if (isPdfFile) return null;
    if (projectRoot) return getPdfBytes(projectRoot) ?? null;
    return null;
  }, [isPdfFile, projectRoot, pdfRevision]);

  useEffect(() => {
    if (isPdfFile || !projectRoot) {
      setDiskHydrating(false);
      return;
    }
    if (getPdfBytes(projectRoot)) {
      setDiskHydrating(false);
      return;
    }
    let cancelled = false;
    setDiskHydrating(true);
    void ensureCompilePdfFromDisk(projectRoot).finally(() => {
      if (!cancelled) setDiskHydrating(false);
    });
    return () => {
      cancelled = true;
    };
  }, [isPdfFile, projectRoot, pdfRevision]);

  useEffect(() => {
    if (!isPdfFile || !fileId) {
      setFilePdfBytes(null);
      setLoadError(null);
      return;
    }
    if (!absolutePath) {
      setFilePdfBytes(null);
      setLoadError("PDF path not found in project metadata.");
      return;
    }
    let cancelled = false;
    setLoadError(null);
    setFilePdfBytes(null);
    (async () => {
      try {
        const { bytes } = await window.electronAPI.fsReadBytes(absolutePath);
        if (!cancelled) setFilePdfBytes(new Uint8Array(bytes));
      } catch (err) {
        if (!cancelled) {
          setFilePdfBytes(null);
          setLoadError(err instanceof Error ? err.message : "Failed to load PDF");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [isPdfFile, fileId, absolutePath]);

  // Stable reference until bytes identity changes (pdfRevision / file load).
  // A new .slice() every render would reload Lector and jump to page 1.
  const source: string | Uint8Array | null = useMemo(() => {
    if (filePdfBytes) return filePdfBytes.slice();
    if (compilePdfBytes) return compilePdfBytes.slice();
    return null;
  }, [filePdfBytes, compilePdfBytes]);

  const persistKey = useMemo(
    () => resolvePdfPreviewPersistKey(sourceMode, projectRoot, activeTab?.fileId),
    [projectRoot, sourceMode, activeTab?.fileId],
  );

  if (loadError && isPdfFile) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col items-center justify-center gap-2 bg-background text-[length:var(--font-size-12)] text-muted-foreground px-4 text-center">
        <AlertCircleIcon className="size-5 text-destructive" />
        <span>{loadError}</span>
      </div>
    );
  }

  if (!source) {
    const loadingLabel = isPdfFile
      ? "Loading PDF…"
      : t("modes.texworkspace.loadingPdfPreview");
    if (isPdfFile || diskHydrating || isCompiling) {
      return (
        <div className="flex h-full min-h-0 w-full flex-col items-center justify-center gap-2 bg-background text-[length:var(--font-size-12)] text-muted-foreground">
          <LoaderIcon className="size-5 animate-spin" />
          <span>{loadingLabel}</span>
        </div>
      );
    }
    // Never-compiled project: keep a full-height pane so split layout stays stable.
    return (
      <div className="flex h-full min-h-0 w-full flex-col items-center justify-center gap-2 bg-background px-4 text-center text-[length:var(--font-size-12)] text-muted-foreground">
        <span>{t("modes.texworkspace.noPdfPreview")}</span>
      </div>
    );
  }

  return (
    <PdfDocumentView
      source={source}
      persistKey={persistKey}
      isPdfFile={isPdfFile}
      isCompiling={isCompiling}
      compileError={compileError}
      documentLayers={isPdfFile ? undefined : <SynctexForwardBridge />}
    />
  );
}
