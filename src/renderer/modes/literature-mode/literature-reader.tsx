import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AnnotationsStoreProvider,
  useAnnotations,
  usePdf,
  usePdfJump,
} from "@anaralabs/lector";
import type { ColoredHighlight } from "@anaralabs/lector";
import { useLiteratureStore } from "@/stores/literature-store";
import { useLiteratureReaderStore } from "@/stores/literature-reader-store";
import { useLiteratureExtractStore } from "@/stores/literature-extract-store";
import { dbAnnotationToLector, coloredHighlightToDb } from "@/lib/literature/highlight-sync";
import { PdfDocumentView } from "@/components/modules/preview";
import { Progress } from "@/components/ui/progress";
import { i18n } from "@/lib/i18n";
import type { LiteraturePaper } from "@/types/electron.d";
import type { PaperExtractBlock } from "../../../shared/paper-extract-block";
import { paperHasReadablePdf } from "./literature-format";
import { LiteratureBlockProvider } from "./literature-block-context";
import { LiteratureBlockPageOverlay } from "./literature-block-overlay";
import { LiteratureBlockPointerCapture } from "./literature-block-pointer";
import { LiteratureBlockPickToggle } from "./literature-block-toolbar";
import { LiteratureColoredHighlightsLayer } from "./literature-colored-highlights-layer";
import { LiteraturePdfActionMenu } from "./literature-pdf-action-menu";

interface LiteratureReaderProps {
  projectRoot: string;
  paper: LiteraturePaper;
}

type PdfLoadState = "loading" | "ready" | "empty" | "error";

function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Persist highlight deletions from the PDF UI to library.db. */
function HighlightDeleteSync({ projectRoot, paperId }: { projectRoot: string; paperId: string }) {
  const coloredHighlights = usePdf((s) => s.coloredHighlights);
  const deleteAnnotation = useLiteratureStore((s) => s.deleteAnnotation);
  const { deleteAnnotation: deleteLectorAnnotation } = useAnnotations();
  const prevIdsRef = useRef<string[]>([]);

  useEffect(() => {
    prevIdsRef.current = [];
  }, [paperId]);

  useEffect(() => {
    const currentIds = coloredHighlights.map((h) => h.uuid);
    const prevIds = prevIdsRef.current;
    if (prevIds.length > 0) {
      for (const id of prevIds) {
        if (!currentIds.includes(id)) {
          void deleteAnnotation(projectRoot, id);
          deleteLectorAnnotation(id);
        }
      }
    }
    prevIdsRef.current = currentIds;
  }, [coloredHighlights, projectRoot, paperId, deleteAnnotation, deleteLectorAnnotation]);

  return null;
}

/** Apply sidebar-initiated annotation deletes to the in-memory PDF layer. */
function AnnotationDeleteListener() {
  const deleteNonce = useLiteratureReaderStore((s) => s.annotationDeleteNonce);
  const deleteId = useLiteratureReaderStore((s) => s.annotationDeleteId);
  const deleteColoredHighlight = usePdf((s) => s.deleteColoredHighlight);
  const { deleteAnnotation: deleteLectorAnnotation } = useAnnotations();
  const lastNonceRef = useRef(0);

  useEffect(() => {
    if (!deleteId || deleteNonce === lastNonceRef.current) return;
    lastNonceRef.current = deleteNonce;
    deleteColoredHighlight(deleteId);
    deleteLectorAnnotation(deleteId);
  }, [deleteNonce, deleteId, deleteColoredHighlight, deleteLectorAnnotation]);

  return null;
}

function ReaderPageLayers({ projectRoot, paper }: LiteratureReaderProps) {
  const loadAnnotations = useLiteratureStore((s) => s.loadAnnotations);
  const { setAnnotations } = useAnnotations();
  const addColoredHighlight = usePdf((s) => s.addColoredHighlight);

  useEffect(() => {
    void loadAnnotations(projectRoot, paper.id).then((rows) => {
      setAnnotations(rows.map(dbAnnotationToLector));
      for (const row of rows) {
        const ann = dbAnnotationToLector(row);
        addColoredHighlight({
          uuid: ann.id,
          color: ann.color,
          pageNumber: ann.pageNumber,
          text: row.quoted_text ?? "",
          rectangles: ann.highlights.map((h) => ({
            pageNumber: h.pageNumber,
            top: h.top,
            left: h.left,
            width: h.width,
            height: h.height,
          })),
        });
      }
    });
  }, [projectRoot, paper.id, loadAnnotations, setAnnotations, addColoredHighlight]);

  return (
    <>
      <LiteratureColoredHighlightsLayer />
      <LiteratureBlockPageOverlay />
      <HighlightDeleteSync projectRoot={projectRoot} paperId={paper.id} />
      <AnnotationDeleteListener />
    </>
  );
}

/** Document-level layers: block pick + unified selection menu (needs usePdf + annotations). */
function ReaderDocumentLayers({ projectRoot, paper }: LiteratureReaderProps) {
  const saveAnnotation = useLiteratureStore((s) => s.saveAnnotation);

  const handleHighlight = useCallback(
    async (highlight: ColoredHighlight) => {
      await saveAnnotation(projectRoot, coloredHighlightToDb(paper.id, highlight));
      const quotedText = highlight.text?.trim() ?? "";
      if (quotedText) {
        useLiteratureStore.getState().setReaderExcerpt({
          paperId: paper.id,
          bibkey: paper.bibkey ?? paper.id,
          title: paper.title,
          page: highlight.pageNumber,
          quotedText,
        });
      }
    },
    [projectRoot, paper.id, paper.bibkey, paper.title, saveAnnotation],
  );

  return (
    <>
      <LiteratureBlockPointerCapture paper={paper} />
      <LiteraturePdfActionMenu paper={paper} onHighlight={(h) => void handleHighlight(h)} />
      <ReaderPageFocusListener />
    </>
  );
}

/** Jump PDF to a page when the sidebar annotations list requests it. */
function ReaderPageFocusListener() {
  const focusNonce = useLiteratureReaderStore((s) => s.readerFocusPageNonce);
  const focusPage = useLiteratureReaderStore((s) => s.readerFocusPage);
  const { jumpToPage } = usePdfJump();
  const lastNonceRef = useRef(0);

  useEffect(() => {
    if (!focusPage || focusNonce === lastNonceRef.current) return;
    lastNonceRef.current = focusNonce;
    jumpToPage(focusPage, { align: "start", behavior: "smooth" });
  }, [focusNonce, focusPage, jumpToPage]);

  return null;
}

export function LiteratureReader({ projectRoot, paper }: LiteratureReaderProps) {
  const { t } = useTranslation();
  const [pdfSource, setPdfSource] = useState<string | Uint8Array | null>(null);
  const [loadState, setLoadState] = useState<PdfLoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingHint, setLoadingHint] = useState(() => i18n.t("literature.reader.loadingPdf"));
  const [extractBlocks, setExtractBlocks] = useState<PaperExtractBlock[]>([]);
  const [blocksHint, setBlocksHint] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{
    receivedBytes: number;
    totalBytes: number | null;
  } | null>(null);

  const mineruState = useLiteratureExtractStore((s) => s.statesByPaper[paper.id]?.mineru);
  const mineruReady = mineruState?.status === "ready";

  useEffect(() => {
    if (!mineruReady) {
      setExtractBlocks([]);
      setBlocksHint(null);
      return;
    }
    let cancelled = false;
    void window.electronAPI.extractGetBlocks(projectRoot, paper.id, "mineru").then(({ blocks }) => {
      if (cancelled) return;
      setExtractBlocks(blocks ?? []);
      setBlocksHint(
        blocks?.length
          ? null
          : "Re-extract with MinerU for block-aligned PDF reading (Shift+Click a paragraph).",
      );
    });
    return () => {
      cancelled = true;
    };
  }, [projectRoot, paper.id, mineruReady, mineruState?.finishedAt]);

  useEffect(() => {
    let cancelled = false;

    if (!paperHasReadablePdf(paper)) {
      setPdfSource(null);
      setLoadState("empty");
      setLoadError(null);
      return () => {
        cancelled = true;
      };
    }

    setLoadState("loading");
    setLoadError(null);
    setPdfSource(null);
    setDownloadProgress(null);
    setLoadingHint(i18n.t("literature.reader.loadingPdf"));

    const unsubscribeProgress = window.electronAPI.onLiteraturePdfDownloadProgress((data) => {
      if (cancelled || data.paperId !== paper.id) return;
      if (data.phase === "resolving") {
        setLoadingHint(i18n.t("literature.reader.connectingZotero"));
      } else if (data.phase === "downloading" && data.receivedBytes != null) {
        setDownloadProgress((prev) => {
          const receivedBytes = Math.max(prev?.receivedBytes ?? 0, data.receivedBytes ?? 0);
          const incomingTotal =
            data.totalBytes != null && data.totalBytes > 0 ? data.totalBytes : null;
          const totalBytes =
            incomingTotal != null
              ? Math.max(prev?.totalBytes ?? 0, incomingTotal)
              : (prev?.totalBytes ?? null);
          return { receivedBytes, totalBytes };
        });
        setLoadingHint(i18n.t("literature.reader.downloadingZotero"));
      } else if (data.phase === "caching") {
        setLoadingHint(i18n.t("literature.reader.savingPdf"));
        setDownloadProgress(null);
      } else if (data.phase === "opening" || data.phase === "reading") {
        setLoadingHint(i18n.t("literature.reader.openingPdf"));
        setDownloadProgress(null);
      }
    });

    void (async () => {
      try {
        const { pdfUrl } = await window.electronAPI.literatureEnsurePaperPdf(projectRoot, paper.id);
        if (cancelled) return;
        if (!pdfUrl) {
          setLoadState("error");
          setLoadError(
            paper.zotero_key
              ? "Could not load PDF from Zotero. The file may not be stored online (linked files need Zotero desktop), or the API key lacks file access."
              : i18n.t("literature.reader.noPdf"),
          );
          return;
        }

        setPdfSource(pdfUrl);
        setLoadState("ready");
        useLiteratureStore.getState().markPaperPdfCached(paper.id);
      } catch (err) {
        if (cancelled) return;
        setLoadState("error");
        setLoadError(err instanceof Error ? err.message : "Failed to load PDF");
      }
    })();

    return () => {
      cancelled = true;
      unsubscribeProgress();
    };
  }, [projectRoot, paper.id, paper.pdf_path, paper.zotero_key]);

  if (loadState === "loading") {
    const hasTotal =
      downloadProgress?.totalBytes != null && downloadProgress.totalBytes > 0;
    const progressPercent = hasTotal
      ? Math.min(100, (downloadProgress.receivedBytes / downloadProgress.totalBytes!) * 100)
      : undefined;

    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
        <p className="text-muted-foreground text-sm">{loadingHint}</p>
        {downloadProgress && downloadProgress.receivedBytes > 0 ? (
          <div className="w-full max-w-xs space-y-2">
            {hasTotal ? (
              <Progress
                value={progressPercent}
                className="h-1.5 [&_[data-slot=progress-indicator]]:transition-none"
              />
            ) : (
              <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-primary/20">
                <div
                  className="h-full w-1/3 rounded-full bg-primary animate-[loading-bar_1.2s_ease-in-out_infinite]"
                />
              </div>
            )}
            <p className="text-[length:var(--font-size-11)] text-muted-foreground/80 tabular-nums">
              {formatByteSize(downloadProgress.receivedBytes)}
              {hasTotal
                ? ` / ${formatByteSize(downloadProgress.totalBytes!)}`
                : ` ${t("literature.reader.downloaded")}`}
            </p>
          </div>
        ) : null}
      </div>
    );
  }

  if (loadState === "empty" || loadState === "error") {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-muted-foreground text-sm">
        {loadError ?? t("literature.reader.noPdf")}
      </div>
    );
  }

  if (!pdfSource) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        {t("literature.reader.loadingPdf")}
      </div>
    );
  }

  const persistKey = `${projectRoot}::literature::${paper.id}`;

  return (
    <AnnotationsStoreProvider>
      <LiteratureBlockProvider blocks={extractBlocks}>
        <div className="flex h-full min-h-0 flex-col">
          {blocksHint ? (
            <p className="shrink-0 border-b border-border bg-muted/30 px-3 py-1.5 text-[length:var(--font-size-11)] text-muted-foreground">
              {blocksHint}
            </p>
          ) : null}
          <PdfDocumentView
            source={pdfSource}
            persistKey={persistKey}
            className="literature-pdf-reader min-h-0 flex-1"
            toolbarExtra={<LiteratureBlockPickToggle />}
            pageLayers={<ReaderPageLayers projectRoot={projectRoot} paper={paper} />}
            documentLayers={<ReaderDocumentLayers projectRoot={projectRoot} paper={paper} />}
          />
        </div>
      </LiteratureBlockProvider>
    </AnnotationsStoreProvider>
  );
}
