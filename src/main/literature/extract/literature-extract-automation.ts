import type { PaperExtractSource } from "../../../shared/literature/paper-extract";
import { getSettings } from "../../app/settings";
import { getPaper, type PaperRow } from "../facade";
import {
  paperCanExtractPdf,
  paperHasExtractablePdf,
  resolvePublisherPageUrl,
  invalidatePaperExtracts,
} from "./paper-extract-db";
import { enqueuePaperExtract } from "./literature-extract-queue";

export type ExtractAutoTrigger = "import" | "replace" | "download";

function defaultExtractSource(projectRoot: string, paper: PaperRow): PaperExtractSource | null {
  if (paperCanExtractPdf(projectRoot, paper)) {
    const pref = getSettings().literatureExtractEngineDefault;
    return pref === "mineru" ? "mineru" : "pdfjs";
  }
  if (resolvePublisherPageUrl(paper)) return "html";
  return null;
}

/** Queue extraction when Settings → Auto-extract on import is enabled. */
export function maybeAutoEnqueueExtract(
  projectRoot: string,
  paperId: string,
  trigger: ExtractAutoTrigger,
): void {
  const settings = getSettings();
  if (!settings.literatureAutoExtractOnImport) return;

  const paper = getPaper(projectRoot, paperId);
  if (!paper) return;

  const source = defaultExtractSource(projectRoot, paper);
  if (!source) return;

  void enqueuePaperExtract(projectRoot, paperId, source, {
    force: trigger === "replace",
  });
}

/** Invalidate cached extracts and optionally auto-enqueue after PDF content changes. */
export function onPaperPdfChanged(
  projectRoot: string,
  paperId: string,
  trigger: ExtractAutoTrigger,
): void {
  invalidatePaperExtracts(projectRoot, paperId, ["mineru", "pdfjs"]);
  maybeAutoEnqueueExtract(projectRoot, paperId, trigger);
}

/** Call after any import path attaches a PDF for the first time. */
export function onPaperPdfAttached(
  projectRoot: string,
  paperId: string,
  trigger: ExtractAutoTrigger = "import",
): void {
  maybeAutoEnqueueExtract(projectRoot, paperId, trigger);
}
