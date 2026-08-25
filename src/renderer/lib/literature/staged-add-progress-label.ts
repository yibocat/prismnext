import type { StagedAddProgressEvent } from "../../../shared/literature/citation-staging";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** User-facing label for staged citation add-to-library progress. */
export function stagedAddProgressLabel(progress: StagedAddProgressEvent): string {
  const batchPrefix =
    progress.batchIndex != null && progress.batchTotal != null
      ? `${progress.batchIndex}/${progress.batchTotal} · `
      : "";

  switch (progress.phase) {
    case "writing":
      return `${batchPrefix}Adding to library…`;
    case "downloading-pdf": {
      if (
        progress.receivedBytes != null &&
        progress.totalBytes != null &&
        progress.totalBytes > 0
      ) {
        const pct = Math.min(100, Math.round((progress.receivedBytes / progress.totalBytes) * 100));
        return `${batchPrefix}Downloading PDF · ${pct}% (${formatBytes(progress.receivedBytes)})`;
      }
      if (progress.receivedBytes != null && progress.receivedBytes > 0) {
        return `${batchPrefix}Downloading PDF · ${formatBytes(progress.receivedBytes)}`;
      }
      return `${batchPrefix}Downloading PDF…`;
    }
    case "done":
      if (progress.pdfAttached) return `${batchPrefix}Added with PDF`;
      if (progress.pdfSkipped) return `${batchPrefix}Added (no open PDF)`;
      return `${batchPrefix}Added`;
    default:
      return `${batchPrefix}Adding…`;
  }
}
