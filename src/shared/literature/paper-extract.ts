export type PaperExtractSource = "mineru" | "pdfjs" | "html";

/** Host or laptop has neither a MinerU token nor a loadable pdfjs worker. */
export const EXTRACT_PARSER_UNAVAILABLE = "extract_parser_unavailable";

export class ExtractParserUnavailableError extends Error {
  readonly code = EXTRACT_PARSER_UNAVAILABLE;

  constructor(
    message = "No extract engine available (MinerU token missing or PDF parser unavailable).",
  ) {
    super(message);
    this.name = "ExtractParserUnavailableError";
  }
}

export type PaperExtractStatus =
  | "idle"
  | "queued"
  | "extracting"
  | "ready"
  | "failed";

export interface PaperExtractState {
  paperId: string;
  source: PaperExtractSource;
  status: PaperExtractStatus;
  queuedAt?: number;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
  /** Relative to the project library extract dir (`library/extract/`). */
  mdPath?: string;
  pages?: number;
  remoteJobId?: string;
  /** Failed attempts — used for auto-retry backoff. */
  retryCount?: number;
  /** Epoch ms — auto-retry scheduled after this time. */
  nextRetryAt?: number;
}

/** Max papers enqueued per batch/collection action. */
export const EXTRACT_BATCH_MAX_PAPERS = 30;

/** Auto-retry failed extractions up to this many times. */
export const EXTRACT_MAX_AUTO_RETRIES = 3;

/** Base delay for exponential backoff (30s → 60s → 120s). */
export const EXTRACT_RETRY_BASE_MS = 30_000;

/** Primary action: convert PDF/HTML to Markdown (Literature panel button). */
export const PAPER_EXTRACT_ACTION_LABEL = "Extract text";

/** Shown when an action requires completed extraction first. */
export const PAPER_EXTRACT_ACTION_HINT_FIRST = "Extract text first";

/** Metadata row label in Literature entry panel. */
export const PAPER_EXTRACT_METADATA_LABEL = "Extracted text";

/** Agent-facing hint — keep in sync with UI action label. */
export const PAPER_EXTRACT_AGENT_UI_HINT = `**${PAPER_EXTRACT_ACTION_LABEL}** in the Literature panel`;

export function extractRetryDelayMs(retryCount: number): number {
  return EXTRACT_RETRY_BASE_MS * 2 ** Math.max(0, retryCount - 1);
}

/** Live phase while a job is queued or running (IPC `extract:progress`). */
export type ExtractProgressPhase =
  | "queued"
  | "resolving_pdf"
  | "caching_pdf"
  | "reading_pdf"
  | "uploading"
  | "cloud_extracting"
  | "fetching_html"
  | "writing";

export interface PaperExtractProgress {
  paperId: string;
  source: PaperExtractSource;
  phase: ExtractProgressPhase;
  message: string;
  /** 0–100 when known; omit for indeterminate */
  percent?: number;
  receivedBytes?: number;
  totalBytes?: number | null;
  queuePosition?: number;
  queueTotal?: number;
}

export function extractProgressLabel(progress: PaperExtractProgress): string {
  return progress.message;
}

export type PaperExtractStatesByPaper = Record<
  string,
  Partial<Record<PaperExtractSource, PaperExtractState>>
>;

export type PaperExtractSourcePreference = "auto" | PaperExtractSource;

/** Source priority when `auto` is requested (best → fallback). */
export const EXTRACT_SOURCE_PRIORITY: PaperExtractSource[] = [
  "mineru",
  "html",
  "pdfjs",
];

export function pickBestReadySource(
  states: Partial<Record<PaperExtractSource, PaperExtractState>> | undefined,
  preference: PaperExtractSourcePreference = "auto",
): PaperExtractSource | null {
  if (!states) return null;
  if (preference !== "auto") {
    const s = states[preference];
    return s?.status === "ready" ? preference : null;
  }
  for (const source of EXTRACT_SOURCE_PRIORITY) {
    if (states[source]?.status === "ready") return source;
  }
  return null;
}

export function extractBadgeLabel(
  states: Partial<Record<PaperExtractSource, PaperExtractState>> | undefined,
): { label: string; tone: "md" | "html" | "pdf" | "busy" | "failed" } | null {
  if (!states) return null;
  const anyFailed = EXTRACT_SOURCE_PRIORITY.some((s) => states[s]?.status === "failed");
  const anyBusy = EXTRACT_SOURCE_PRIORITY.some((s) =>
    ["queued", "extracting"].includes(states[s]?.status ?? ""),
  );
  if (anyBusy) return { label: "…", tone: "busy" };
  const best = pickBestReadySource(states, "auto");
  if (best === "mineru") return { label: "MD", tone: "md" };
  if (best === "html") return { label: "HTML", tone: "html" };
  if (best === "pdfjs") return { label: "PDF", tone: "pdf" };
  if (anyFailed) return { label: "!", tone: "failed" };
  return null;
}
