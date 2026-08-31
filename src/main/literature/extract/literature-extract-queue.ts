import type {
  PaperExtractSource,
  PaperExtractState,
  PaperExtractProgress,
} from "../../../shared/literature/paper-extract";
import {
  EXTRACT_BATCH_MAX_PAPERS,
  EXTRACT_MAX_AUTO_RETRIES,
  extractRetryDelayMs,
} from "../../../shared/literature/paper-extract";
import { getHostEvents } from "../../app/event-sink";
import { createLogger } from "../../app/logger";
import { getSettings } from "../../app/settings";
import { ensurePaperPdfAbsPath, type PdfResolveProgress } from "../pdf/literature-pdf-resolve";
import { getPaper, openLibraryDb, type PaperRow, materializeZoteroPaperIfLinked } from "../facade";
import { assertExtractParserAvailable, extractPdfTextWithPdfJs } from "./literature-extract-pdfjs";
import { fetchHtmlSnapshot } from "./literature-extract-html";
import { extractWithMineru } from "./mineru-client";
import {
  getPaperExtractState,
  listExtractsDueForRetry,
  listFailedWithScheduledRetry,
  listQueuedOrExtracting,
  paperCanExtractPdf,
  resolvePublisherPageUrl,
  upsertPaperExtractState,
  writeExtractArtifacts,
} from "./paper-extract-db";
import { getZoteroMirrorByPaperId } from "../facade";
import { backfillPaperAbstractFromExtract } from "../ai-metadata/literature-ai-metadata-heuristics";
import { maybeEnqueueAiMetadata } from "../ai-metadata/literature-ai-metadata-queue";

const log = createLogger("literature-extract", "general");

interface QueueJob {
  projectRoot: string;
  paperId: string;
  source: PaperExtractSource;
  force: boolean;
  waiters: Array<{
    resolve: (state: PaperExtractState) => void;
    reject: (err: Error) => void;
    timeout?: ReturnType<typeof setTimeout>;
  }>;
}

const pendingByKey = new Map<string, QueueJob>();
const runningByKey = new Set<string>();
const retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
let workerRunning = false;

function jobKey(projectRoot: string, paperId: string, source: PaperExtractSource): string {
  return `${projectRoot}::${paperId}::${source}`;
}

function emitExtractEvent(
  channel: string,
  payload: Record<string, unknown>,
): void {
  getHostEvents().broadcast(channel, payload);
}

function broadcastState(projectRoot: string, state: PaperExtractState): void {
  emitExtractEvent("extract:statusChanged", { projectRoot, state });
  if (state.status === "ready") {
    emitExtractEvent("extract:done", { projectRoot, state });
    backfillPaperAbstractFromExtract(projectRoot, state.paperId);
    maybeEnqueueAiMetadata(projectRoot, state.paperId);
  } else if (state.status === "failed") {
    emitExtractEvent("extract:failed", { projectRoot, state });
  }
}

function mineruToken(): string | undefined {
  const settings = getSettings();
  const token = settings.mineruApiToken;
  return typeof token === "string" && token.trim() ? token.trim() : undefined;
}

function broadcastProgress(projectRoot: string, progress: PaperExtractProgress): void {
  emitExtractEvent("extract:progress", { projectRoot, progress });
}

function clearProgress(
  projectRoot: string,
  paperId: string,
  source: PaperExtractSource,
): void {
  emitExtractEvent("extract:progressClear", { projectRoot, paperId, source });
}

function queueStats(projectRoot: string): { total: number } {
  const jobs = [...pendingByKey.values()].filter((j) => j.projectRoot === projectRoot);
  return { total: jobs.length };
}

type ProgressEmit = (patch: Partial<PaperExtractProgress> & Pick<PaperExtractProgress, "phase" | "message">) => void;

function makeProgressEmitter(
  projectRoot: string,
  paperId: string,
  source: PaperExtractSource,
): ProgressEmit {
  return (patch) => {
    const stats = queueStats(projectRoot);
    broadcastProgress(projectRoot, {
      paperId,
      source,
      queueTotal: stats.total,
      ...patch,
    });
  };
}

function mapPdfResolveProgress(
  emit: ProgressEmit,
  info: PdfResolveProgress,
): void {
  if (info.phase === "resolving") {
    emit({ phase: "resolving_pdf", message: "Looking up Zotero PDF attachment…" });
  } else if (info.phase === "downloading") {
    const hasTotal = info.totalBytes != null && info.totalBytes > 0;
    const percent =
      hasTotal && info.receivedBytes != null
        ? Math.min(99, Math.round((info.receivedBytes / info.totalBytes!) * 100))
        : undefined;
    emit({
      phase: "caching_pdf",
      message: hasTotal ? "Downloading PDF from Zotero…" : "Downloading PDF from Zotero…",
      percent,
      receivedBytes: info.receivedBytes,
      totalBytes: info.totalBytes,
    });
  } else if (info.phase === "caching") {
    emit({ phase: "caching_pdf", message: "Saving PDF to local library…", percent: 100 });
  } else if (info.phase === "reading") {
    emit({ phase: "reading_pdf", message: "Reading cached PDF…" });
  }
}

async function resolvePdfForExtract(
  projectRoot: string,
  paper: PaperRow,
  emit: ProgressEmit,
): Promise<string> {
  const hadLocal = Boolean(paper.pdf_path?.trim());
  const fromZotero = Boolean(getZoteroMirrorByPaperId(projectRoot, paper.id));
  if (!hadLocal) {
    emit({
      phase: "resolving_pdf",
      message: fromZotero
        ? "Fetching PDF from Zotero (will cache locally)…"
        : "Resolving PDF…",
    });
  } else {
    emit({ phase: "reading_pdf", message: "Using cached local PDF…" });
  }
  const pdfAbs = await ensurePaperPdfAbsPath(projectRoot, paper.id, (info) =>
    mapPdfResolveProgress(emit, info),
  );
  if (!pdfAbs) {
    throw new Error(
      "No PDF available — attach a file or ensure Zotero has a PDF for this item.",
    );
  }
  if (!hadLocal) {
    emit({ phase: "caching_pdf", message: "PDF cached under the project library attachments/", percent: 100 });
    emitExtractEvent("extract:pdfCached", { projectRoot, paperId: paper.id });
  }
  return pdfAbs;
}

async function runPdfJsExtract(
  projectRoot: string,
  paper: PaperRow,
  emit: ProgressEmit,
): Promise<{ markdown: string; pageCount: number; meta: Record<string, unknown> }> {
  const pdfAbs = await resolvePdfForExtract(projectRoot, paper, emit);
  emit({ phase: "reading_pdf", message: "Extracting text with pdfjs…" });
  const result = await extractPdfTextWithPdfJs(pdfAbs);
  emit({ phase: "writing", message: "Writing Markdown cache…", percent: 100 });
  return {
    markdown: result.markdown,
    pageCount: result.pageCount,
    meta: { engine: "pdfjs", pageCount: result.pageCount, finishedAt: Date.now() },
  };
}

async function runMineruExtract(
  projectRoot: string,
  paper: PaperRow,
  emit: ProgressEmit,
): Promise<{
  markdown: string;
  pageCount: number;
  meta: Record<string, unknown>;
  remoteJobId: string;
  images?: Array<{ relPath: string; data: Buffer }>;
  blocks?: import("../../../shared/literature/paper-extract-block").PaperExtractBlock[];
  layout?: { middle?: unknown; model?: unknown };
}> {
  const pdfAbs = await resolvePdfForExtract(projectRoot, paper, emit);
  const result = await extractWithMineru(pdfAbs, mineruToken(), (info) => {
    emit({
      phase: info.stage === "upload" ? "uploading" : "cloud_extracting",
      message: info.message,
    });
  });
  emit({
    phase: "writing",
    message:
      result.images?.length
        ? `Writing Markdown and ${result.images.length} image(s)…`
        : "Writing Markdown cache…",
    percent: 100,
  });
  return {
    markdown: result.markdown,
    pageCount: result.pageCount,
    remoteJobId: result.remoteJobId,
    images: result.images?.map((img) => ({ relPath: img.relPath, data: img.data })),
    blocks: result.blocks,
    layout: result.layout,
    meta: {
      engine: "mineru",
      mode: result.mode,
      pageCount: result.pageCount,
      imageCount: result.images?.length ?? 0,
      blockCount: result.blocks?.length ?? 0,
      finishedAt: Date.now(),
    },
  };
}

async function runHtmlExtract(
  paper: PaperRow,
  emit: ProgressEmit,
): Promise<{ markdown: string; pageCount: number; meta: Record<string, unknown> }> {
  emit({ phase: "fetching_html", message: "Fetching publisher HTML snapshot…" });
  const result = await fetchHtmlSnapshot(paper);
  emit({ phase: "writing", message: "Writing Markdown cache…", percent: 100 });
  return {
    markdown: result.markdown,
    pageCount: result.pageCount,
    meta: {
      engine: "html",
      sourceUrl: result.sourceUrl,
      pageCount: result.pageCount,
      finishedAt: Date.now(),
    },
  };
}

async function executeJob(job: QueueJob): Promise<void> {
  const { projectRoot, paperId, source, force } = job;
  const key = jobKey(projectRoot, paperId, source);
  runningByKey.add(key);

  const existing = getPaperExtractState(projectRoot, paperId, source);
  if (!force && existing?.status === "ready") {
    finishWaiters(job, existing);
    runningByKey.delete(key);
    pendingByKey.delete(key);
    return;
  }

  const paper = getPaper(projectRoot, paperId);
  if (!paper) {
    failJob(job, "Paper not found.");
    return;
  }

  if (source !== "html" && !paperCanExtractPdf(projectRoot, paper)) {
    failJob(job, "No PDF available — attach a file or link a Zotero item with PDF.");
    return;
  }

  const emit = makeProgressEmitter(projectRoot, paperId, source);
  emit({ phase: "reading_pdf", message: "Starting extraction…" });

  const startedAt = Date.now();
  const extracting: PaperExtractState = {
    paperId,
    source,
    status: "extracting",
    startedAt,
    queuedAt: existing?.queuedAt ?? startedAt,
    remoteJobId: existing?.remoteJobId,
  };
  upsertPaperExtractState(projectRoot, extracting);
  broadcastState(projectRoot, extracting);

  try {
    let payload: {
      markdown: string;
      pageCount: number;
      meta: Record<string, unknown>;
      remoteJobId?: string;
      images?: Array<{ relPath: string; data: Buffer }>;
      blocks?: import("../../../shared/literature/paper-extract-block").PaperExtractBlock[];
      layout?: { middle?: unknown; model?: unknown };
    };

    if (source === "pdfjs") {
      payload = await runPdfJsExtract(projectRoot, paper, emit);
    } else if (source === "mineru") {
      payload = await runMineruExtract(projectRoot, paper, emit);
    } else {
      payload = await runHtmlExtract(paper, emit);
    }

    const written = writeExtractArtifacts(
      projectRoot,
      paperId,
      source,
      payload.markdown,
      payload.meta,
      payload.pageCount,
      source === "mineru"
        ? { images: payload.images, blocks: payload.blocks, layout: payload.layout }
        : undefined,
    );

    const ready: PaperExtractState = {
      paperId,
      source,
      status: "ready",
      mdPath: written.mdPath,
      pages: written.pages,
      remoteJobId: payload.remoteJobId ?? existing?.remoteJobId,
      queuedAt: extracting.queuedAt,
      startedAt,
      finishedAt: Date.now(),
      retryCount: 0,
      nextRetryAt: undefined,
    };
    upsertPaperExtractState(projectRoot, ready);
    broadcastState(projectRoot, ready);
    materializeZoteroPaperIfLinked(projectRoot, paperId);
    clearProgress(projectRoot, paperId, source);
    finishWaiters(job, ready);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn("extract failed", { paperId, source, error: message });
    clearProgress(projectRoot, paperId, source);
    failJob(job, message);
  } finally {
    runningByKey.delete(key);
    pendingByKey.delete(key);
    scheduleWorker();
  }
}

function clearRetryTimer(key: string): void {
  const timer = retryTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    retryTimers.delete(key);
  }
}

function scheduleAutoRetry(
  projectRoot: string,
  paperId: string,
  source: PaperExtractSource,
  state: PaperExtractState,
): void {
  if (!state.nextRetryAt) return;
  const key = jobKey(projectRoot, paperId, source);
  clearRetryTimer(key);
  const delay = Math.max(0, state.nextRetryAt - Date.now());
  retryTimers.set(
    key,
    setTimeout(() => {
      retryTimers.delete(key);
      const current = getPaperExtractState(projectRoot, paperId, source);
      if (current?.status !== "failed" || current.nextRetryAt !== state.nextRetryAt) return;
      void enqueuePaperExtract(projectRoot, paperId, source, { force: true });
    }, delay),
  );
}

function failJob(job: QueueJob, message: string): void {
  const key = jobKey(job.projectRoot, job.paperId, job.source);
  clearRetryTimer(key);
  clearProgress(job.projectRoot, job.paperId, job.source);
  const previous = getPaperExtractState(job.projectRoot, job.paperId, job.source);
  const retryCount = (previous?.retryCount ?? 0) + 1;
  const canRetry = retryCount <= EXTRACT_MAX_AUTO_RETRIES;
  const nextRetryAt = canRetry ? Date.now() + extractRetryDelayMs(retryCount) : undefined;

  const failed: PaperExtractState = {
    paperId: job.paperId,
    source: job.source,
    status: "failed",
    error: message,
    retryCount,
    nextRetryAt,
    queuedAt: previous?.queuedAt ?? Date.now(),
    finishedAt: Date.now(),
  };
  upsertPaperExtractState(job.projectRoot, failed);
  broadcastState(job.projectRoot, failed);
  if (canRetry && nextRetryAt) {
    scheduleAutoRetry(job.projectRoot, job.paperId, job.source, failed);
  }
  for (const waiter of job.waiters) {
    if (waiter.timeout) clearTimeout(waiter.timeout);
    waiter.reject(new Error(message));
  }
  job.waiters.length = 0;
}

function finishWaiters(job: QueueJob, state: PaperExtractState): void {
  for (const waiter of job.waiters) {
    if (waiter.timeout) clearTimeout(waiter.timeout);
    waiter.resolve(state);
  }
  job.waiters.length = 0;
}

function scheduleWorker(): void {
  if (workerRunning) return;
  workerRunning = true;
  void drainWorker();
}

async function drainWorker(): Promise<void> {
  try {
    while (true) {
      const next = [...pendingByKey.values()].find(
        (job) => !runningByKey.has(jobKey(job.projectRoot, job.paperId, job.source)),
      );
      if (!next) break;
      await executeJob(next);
    }
  } finally {
    workerRunning = false;
    if ([...pendingByKey.values()].some(
      (job) => !runningByKey.has(jobKey(job.projectRoot, job.paperId, job.source)),
    )) {
      scheduleWorker();
    }
  }
}

export function enqueuePaperExtract(
  projectRoot: string,
  paperId: string,
  source: PaperExtractSource,
  opts?: { force?: boolean; waitForReady?: boolean; waitTimeoutMs?: number },
): Promise<PaperExtractState | void> {
  const force = opts?.force ?? false;
  const key = jobKey(projectRoot, paperId, source);
  const existing = getPaperExtractState(projectRoot, paperId, source);

  if (!force && existing?.status === "ready") {
    return Promise.resolve(existing);
  }

  assertExtractParserAvailable(source, Boolean(mineruToken()));

  let job = pendingByKey.get(key);
  if (!job) {
    const queued: PaperExtractState = {
      paperId,
      source,
      status: "queued",
      queuedAt: Date.now(),
    };
    upsertPaperExtractState(projectRoot, queued);
    broadcastState(projectRoot, queued);
    const stats = queueStats(projectRoot);
    broadcastProgress(projectRoot, {
      paperId,
      source,
      phase: "queued",
      message:
        stats.total > 1
          ? `Queued (${stats.total} jobs in library queue)…`
          : "Queued — waiting for worker…",
      queuePosition: stats.total,
      queueTotal: stats.total,
    });
    job = { projectRoot, paperId, source, force, waiters: [] };
    pendingByKey.set(key, job);
    scheduleWorker();
  } else if (force) {
    job.force = true;
  }

  if (!opts?.waitForReady) return Promise.resolve();

  return new Promise<PaperExtractState>((resolve, reject) => {
    const waiter: QueueJob["waiters"][number] = { resolve, reject };
    if (opts.waitTimeoutMs) {
      waiter.timeout = setTimeout(() => {
        reject(new Error("Extraction timed out waiting for ready state."));
      }, opts.waitTimeoutMs);
    }
    job!.waiters.push(waiter);
  });
}

export function cancelPaperExtract(
  projectRoot: string,
  paperId: string,
  source: PaperExtractSource,
): void {
  const key = jobKey(projectRoot, paperId, source);
  pendingByKey.delete(key);
  clearRetryTimer(key);
  const idle: PaperExtractState = {
    paperId,
    source,
    status: "idle",
    retryCount: 0,
    nextRetryAt: undefined,
  };
  upsertPaperExtractState(projectRoot, idle);
  broadcastState(projectRoot, idle);
}

function paperEligibleForSource(
  projectRoot: string,
  paper: PaperRow,
  source: PaperExtractSource,
): boolean {
  if (source === "html") return Boolean(resolvePublisherPageUrl(paper));
  return paperCanExtractPdf(projectRoot, paper);
}

export function enqueueBatchPaperExtract(
  projectRoot: string,
  paperIds: string[],
  source: PaperExtractSource,
  opts?: { force?: boolean; maxPapers?: number },
): { enqueued: number; skipped: number; capped: boolean } {
  assertExtractParserAvailable(source, Boolean(mineruToken()));
  const max = Math.min(opts?.maxPapers ?? EXTRACT_BATCH_MAX_PAPERS, EXTRACT_BATCH_MAX_PAPERS);
  const capped = paperIds.length > max;
  const ids = paperIds.slice(0, max);
  let enqueued = 0;
  let skipped = 0;

  for (const paperId of ids) {
    const paper = getPaper(projectRoot, paperId);
    if (!paper || !paperEligibleForSource(projectRoot, paper, source)) {
      skipped++;
      continue;
    }
    void enqueuePaperExtract(projectRoot, paperId, source, { force: opts?.force });
    enqueued++;
  }

  return { enqueued, skipped, capped };
}

export function enqueueCollectionExtract(
  projectRoot: string,
  collectionId: string,
  source: PaperExtractSource,
  opts?: { force?: boolean; maxPapers?: number },
): { enqueued: number; skipped: number; capped: boolean } {
  const db = openLibraryDb(projectRoot);
  const rows = db
    .prepare("SELECT paper_id FROM collection_papers WHERE collection_id = ? ORDER BY added_at DESC")
    .all(collectionId) as Array<{ paper_id: string }>;
  return enqueueBatchPaperExtract(
    projectRoot,
    rows.map((r) => r.paper_id),
    source,
    opts,
  );
}

export function retryPaperExtract(
  projectRoot: string,
  paperId: string,
  source: PaperExtractSource,
): void {
  assertExtractParserAvailable(source, Boolean(mineruToken()));
  const key = jobKey(projectRoot, paperId, source);
  clearRetryTimer(key);
  upsertPaperExtractState(projectRoot, {
    paperId,
    source,
    status: "idle",
    retryCount: 0,
    nextRetryAt: undefined,
    error: undefined,
  });
  void enqueuePaperExtract(projectRoot, paperId, source, { force: true });
}

function pollDueRetries(projectRoot: string): void {
  for (const state of listExtractsDueForRetry(projectRoot)) {
    try {
      void enqueuePaperExtract(projectRoot, state.paperId, state.source, { force: true });
    } catch {
      // Parser missing — skip auto-retry until an engine is available.
    }
  }
}

export function resumeExtractQueues(projectRoot: string): void {
  const pending = listQueuedOrExtracting(projectRoot);
  for (const state of pending) {
    try {
      enqueuePaperExtract(projectRoot, state.paperId, state.source, {
        force: state.status === "extracting",
      });
    } catch {
      // Parser missing — leave queued rows; opening Literature must not throw.
    }
  }
  pollDueRetries(projectRoot);
  for (const state of listFailedWithScheduledRetry(projectRoot)) {
    if (state.nextRetryAt && state.nextRetryAt > Date.now()) {
      scheduleAutoRetry(projectRoot, state.paperId, state.source, state);
    }
  }
}

export function notifyAgentExtractRequested(payload: {
  projectRoot: string;
  paperId: string;
  bibkey: string;
  title: string;
  source: PaperExtractSource;
}): void {
  emitExtractEvent("extract:agentRequested", payload);
}
