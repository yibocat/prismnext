import { useCallback, useEffect, useRef, useState, type DragEventHandler } from "react";
import { toast } from "sonner";
import { useDocumentStore } from "@/stores/document-store";
import { useLiteratureStore } from "@/stores/literature-store";
import { formatPdfDownloadFailure } from "../../../shared/pdf-download-messages";
import {
  formatIdentifierBrief,
  normalizeLiteratureIdentifiers,
} from "../../../shared/literature-pdf-identity";
import type {
  LiteratureAttachLocalPdfConflict,
  LiteratureAttachLocalPdfResult,
  LiteraturePaper,
} from "@/types/electron.d";

function isPdfFileName(name: string): boolean {
  return name.toLowerCase().endsWith(".pdf");
}

export function hasPdfFileDrag(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false;
  return Array.from(dataTransfer.types).includes("Files");
}

export type LiteraturePdfAttachHandle = ReturnType<typeof useLiteraturePdfAttach>;

export function useLiteraturePdfAttach(targetPaperId: string) {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const attachLocalPdf = useLiteratureStore((s) => s.attachLocalPdf);
  const selectPaper = useLiteratureStore((s) => s.selectPaper);
  const [dragActive, setDragActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<LiteratureAttachLocalPdfConflict | null>(null);
  const pendingPathRef = useRef<string | null>(null);
  const dragDepthRef = useRef(0);

  const finishAttach = useCallback(
    (result: LiteratureAttachLocalPdfResult) => {
      if (result.attachError) {
        const { title, description } = formatPdfDownloadFailure(result.attachError);
        toast.error(title, description ? { description } : undefined);
        return;
      }
      if (result.attached) {
        toast.success(result.replaced ? "PDF replaced" : "PDF attached");
        selectPaper(result.paper.id);
      } else if (result.replaced === false && result.paper.pdf_path) {
        toast.info("PDF unchanged");
      }
    },
    [selectPaper],
  );

  const attachPdfPath = useCallback(
    async (
      pdfPath: string,
      opts?: { ignoreIdentifierConflict?: boolean; paperId?: string },
    ) => {
      if (!projectRoot) return;
      setBusy(true);
      try {
        const result = await attachLocalPdf(projectRoot, opts?.paperId ?? targetPaperId, pdfPath, {
          ignoreIdentifierConflict: opts?.ignoreIdentifierConflict,
        });
        if (result.conflict) {
          pendingPathRef.current = pdfPath;
          setConflict(result.conflict);
          return;
        }
        finishAttach(result);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not attach PDF");
      } finally {
        setBusy(false);
      }
    },
    [attachLocalPdf, finishAttach, projectRoot, targetPaperId],
  );

  const pickAndAttach = useCallback(async () => {
    const { path } = await window.electronAPI.literaturePickPdf();
    if (!path) return;
    await attachPdfPath(path);
  }, [attachPdfPath]);

  const resetDrag = useCallback(() => {
    dragDepthRef.current = 0;
    setDragActive(false);
  }, []);

  const onDragEnter: DragEventHandler<HTMLElement> = useCallback(
    (e) => {
      if (!projectRoot || !hasPdfFileDrag(e.dataTransfer)) return;
      e.preventDefault();
      e.stopPropagation();
      dragDepthRef.current += 1;
      setDragActive(true);
    },
    [projectRoot],
  );

  const onDragLeave: DragEventHandler<HTMLElement> = useCallback((e) => {
    if (!hasPdfFileDrag(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragActive(false);
  }, []);

  const onDragOver: DragEventHandler<HTMLElement> = useCallback(
    (e) => {
      if (!projectRoot || !hasPdfFileDrag(e.dataTransfer)) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "copy";
    },
    [projectRoot],
  );

  const onDrop: DragEventHandler<HTMLElement> = useCallback(
    (e) => {
      if (!projectRoot || !hasPdfFileDrag(e.dataTransfer)) return;
      e.preventDefault();
      e.stopPropagation();
      resetDrag();
      const file = Array.from(e.dataTransfer.files).find((f) => isPdfFileName(f.name));
      if (!file) {
        toast.info("Drop a PDF file");
        return;
      }
      void attachPdfPath(window.electronAPI.getPathForFile(file));
    },
    [attachPdfPath, projectRoot, resetDrag],
  );

  const clearConflict = useCallback(() => {
    setConflict(null);
    pendingPathRef.current = null;
  }, []);

  const handleOpenOther = useCallback(() => {
    if (!conflict || !("otherPaper" in conflict)) return;
    selectPaper(conflict.otherPaper.id);
    clearConflict();
  }, [clearConflict, conflict, selectPaper]);

  const handleAttachToOther = useCallback(async () => {
    const pdfPath = pendingPathRef.current;
    if (!pdfPath || !conflict || conflict.kind !== "identifier_duplicate") return;
    clearConflict();
    await attachPdfPath(pdfPath, { paperId: conflict.otherPaper.id });
  }, [attachPdfPath, clearConflict, conflict]);

  const handleAttachAnyway = useCallback(async () => {
    const pdfPath = pendingPathRef.current;
    if (!pdfPath) return;
    clearConflict();
    await attachPdfPath(pdfPath, { ignoreIdentifierConflict: true });
  }, [attachPdfPath, clearConflict]);

  return {
    busy,
    dragActive,
    conflict,
    clearConflict,
    pickAndAttach,
    attachPdfPath,
    dropHandlers: { onDragEnter, onDragLeave, onDragOver, onDrop },
    conflictActions: {
      handleOpenOther,
      handleAttachToOther,
      handleAttachAnyway,
    },
  };
}

export function identifierLabel(
  conflict: Extract<LiteratureAttachLocalPdfConflict, { kind: "identifier_duplicate" }>,
): string {
  if (conflict.doi) return `DOI ${conflict.doi}`;
  if (conflict.arxivId) return `arXiv ${conflict.arxivId}`;
  return "the same identifier";
}

export function targetMismatchDescription(
  conflict: Extract<LiteratureAttachLocalPdfConflict, { kind: "target_mismatch" }>,
): string {
  const entry = formatIdentifierBrief(
    normalizeLiteratureIdentifiers({
      doi: conflict.entryDoi,
      arxivId: conflict.entryArxivId,
    }),
  );
  const pdf = formatIdentifierBrief(
    normalizeLiteratureIdentifiers({
      doi: conflict.pdfDoi,
      arxivId: conflict.pdfArxivId,
    }),
  );
  return `This entry is ${entry}, but the PDF looks like ${pdf}. You may have picked the wrong file.`;
}

export function targetUnverifiedDescription(
  conflict: Extract<LiteratureAttachLocalPdfConflict, { kind: "target_unverified" }>,
): string {
  const entry = formatIdentifierBrief(
    normalizeLiteratureIdentifiers({
      doi: conflict.entryDoi,
      arxivId: conflict.entryArxivId,
    }),
  );
  return `This entry has ${entry}, but the PDF contains no matching DOI or arXiv ID. Double-check before attaching.`;
}

export const LITERATURE_ROW_PDF_ATTACH_DWELL_MS = 450;

export type LiteratureRowPdfDropPhase = "idle" | "pending" | "ready";

export type LiteratureRowPdfDropSession = {
  targetPaperId: string | null;
  phase: LiteratureRowPdfDropPhase;
  armRow: (paperId: string) => void;
  disarmRow: (paperId: string) => void;
  reset: () => void;
  isTarget: (paperId: string) => boolean;
  isReady: (paperId: string) => boolean;
};

/** One active row target while dragging a PDF over the library list. */
export function useLiteratureRowPdfDropSession(): LiteratureRowPdfDropSession {
  const [targetPaperId, setTargetPaperId] = useState<string | null>(null);
  const [phase, setPhase] = useState<LiteratureRowPdfDropPhase>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const targetPaperIdRef = useRef<string | null>(null);
  const phaseRef = useRef(phase);
  targetPaperIdRef.current = targetPaperId;
  phaseRef.current = phase;

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    clearTimer();
    setTargetPaperId(null);
    setPhase("idle");
  }, [clearTimer]);

  const armRow = useCallback(
    (paperId: string) => {
      if (targetPaperIdRef.current === paperId && phaseRef.current !== "idle") return;
      clearTimer();
      setTargetPaperId(paperId);
      setPhase("pending");
      timerRef.current = setTimeout(() => {
        setPhase("ready");
      }, LITERATURE_ROW_PDF_ATTACH_DWELL_MS);
    },
    [clearTimer],
  );

  const disarmRow = useCallback(
    (paperId: string) => {
      if (targetPaperIdRef.current !== paperId) return;
      reset();
    },
    [reset],
  );

  // dragend always fires after drop/cancel — safe to reset without racing row onDrop.
  // Do NOT listen to drop in capture: that runs before the row handler and clears
  // isReady, so the row skips attach and the library zone ingests the PDF instead.
  useEffect(() => {
    const onEnd = () => reset();
    const opts: AddEventListenerOptions = { capture: true };
    document.addEventListener("dragend", onEnd, opts);
    return () => {
      document.removeEventListener("dragend", onEnd, opts);
    };
  }, [reset]);

  const isTarget = useCallback((paperId: string) => targetPaperId === paperId, [targetPaperId]);
  const isReady = useCallback(
    (paperId: string) => phase === "ready" && targetPaperId === paperId,
    [phase, targetPaperId],
  );

  return { targetPaperId, phase, armRow, disarmRow, reset, isTarget, isReady };
}

/** Per-row handlers wired to a shared library drag session. */
export function useLiteratureRowPdfDropTarget(
  paper: LiteraturePaper,
  session: LiteratureRowPdfDropSession,
  attachPdfPath: (pdfPath: string) => Promise<void>,
) {
  const onDragEnter: DragEventHandler<HTMLElement> = useCallback(
    (e) => {
      if (!hasPdfFileDrag(e.dataTransfer)) return;
      e.preventDefault();
      const from = e.relatedTarget as Node | null;
      if (from && e.currentTarget.contains(from)) return;
      session.armRow(paper.id);
    },
    [paper.id, session],
  );

  const onDragLeave: DragEventHandler<HTMLElement> = useCallback(
    (e) => {
      if (!hasPdfFileDrag(e.dataTransfer)) return;
      const next = e.relatedTarget as Node | null;
      if (next && e.currentTarget.contains(next)) return;
      session.disarmRow(paper.id);
    },
    [paper.id, session],
  );

  const onDragOver: DragEventHandler<HTMLElement> = useCallback(
    (e) => {
      if (!hasPdfFileDrag(e.dataTransfer)) return;
      e.preventDefault();
      // dragover fires continuously — reliable for adjacent rows (enter/leave often skips).
      session.armRow(paper.id);
      e.dataTransfer.dropEffect = session.isReady(paper.id) ? "copy" : "none";
    },
    [paper.id, session],
  );

  const onDrop: DragEventHandler<HTMLElement> = useCallback(
    (e) => {
      if (!hasPdfFileDrag(e.dataTransfer)) return;
      const ready = session.isReady(paper.id);
      session.reset();
      if (!ready) return;
      e.preventDefault();
      e.stopPropagation();
      const file = Array.from(e.dataTransfer.files).find((f) => isPdfFileName(f.name));
      if (!file) {
        toast.info("Drop a PDF file");
        return;
      }
      void attachPdfPath(window.electronAPI.getPathForFile(file));
    },
    [attachPdfPath, paper.id, session],
  );

  const isTarget = session.isTarget(paper.id);
  const phase = isTarget ? session.phase : ("idle" as const);

  return {
    phase,
    rowDropHandlers: { onDragEnter, onDragLeave, onDragOver, onDrop },
  };
}
