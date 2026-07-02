import { getSettings } from "./settings";
import { getPaper, openLibraryDb, upsertPaperAiMetadata } from "./literature-service";
import { runAiMetadataForPaper } from "./literature-ai-metadata";
import { broadcastToRenderer } from "./literature-broadcast";
import { createLogger } from "./logger";

const log = createLogger("literature-ai-metadata-queue", "main");

const MAX_CONCURRENT = 2;
const pending: Array<{ projectRoot: string; paperId: string; force: boolean }> = [];
const queuedKeys = new Set<string>();
const runningKeys = new Set<string>();
let activeWorkers = 0;

function jobKey(projectRoot: string, paperId: string): string {
  return `${projectRoot}::${paperId}`;
}

function pumpQueue(): void {
  while (activeWorkers < MAX_CONCURRENT && pending.length > 0) {
    const job = pending.shift()!;
    const key = jobKey(job.projectRoot, job.paperId);
    queuedKeys.delete(key);
    runningKeys.add(key);
    activeWorkers += 1;
    void runJob(job).finally(() => {
      runningKeys.delete(key);
      activeWorkers -= 1;
      pumpQueue();
    });
  }
}

async function runJob(job: { projectRoot: string; paperId: string; force: boolean }): Promise<void> {
  try {
    await runAiMetadataForPaper(job.projectRoot, job.paperId, { force: job.force });
  } catch (err) {
    log.warn("AI metadata job failed", {
      paperId: job.paperId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export function enqueueAiMetadata(
  projectRoot: string,
  paperId: string,
  opts: { force?: boolean } = {},
): void {
  const key = jobKey(projectRoot, paperId);
  if (queuedKeys.has(key) || runningKeys.has(key)) return;

  upsertPaperAiMetadata(openLibraryDb(projectRoot), paperId, {
    status: "queued",
    queued_at: Date.now(),
    error: null,
  });
  broadcastToRenderer("literature:aiMetadataChanged", { projectRoot, paperId });

  pending.push({ projectRoot, paperId, force: Boolean(opts.force) });
  queuedKeys.add(key);
  pumpQueue();
}

export function maybeEnqueueAiMetadata(projectRoot: string, paperId: string): void {
  if (!getSettings().literatureAutoAiMetadata) return;
  enqueueAiMetadata(projectRoot, paperId, { force: false });
}

/** Auto-enqueue when catalog/metadata already provided abstract — no extract required. */
export function maybeEnqueueAiMetadataAfterMetadata(
  projectRoot: string,
  paperId: string,
): void {
  if (!getSettings().literatureAutoAiMetadata) return;
  const paper = getPaper(projectRoot, paperId);
  if (!paper?.abstract?.trim()) return;
  enqueueAiMetadata(projectRoot, paperId, { force: false });
}
