/**
 * Pure filter/sort helpers for Experiments run history (Phase 3–4).
 * Kept out of the table component so behavior is unit-testable.
 */
import type {
  ExperimentRunEntry,
  ExperimentRunKind,
} from "../../../shared/experiment-log";

export type RunsStatusFilter = "all" | "success" | "failed" | "cancelled";
export type RunsSortOrder = "newest" | "oldest";
/** `untagged` = runs with no `kind` field (legacy / omitted). */
export type RunsKindFilter = "all" | ExperimentRunKind | "untagged";

export interface RunsQuery {
  status: RunsStatusFilter;
  /** Case-insensitive match on command / notes / runId. */
  text: string;
  sort: RunsSortOrder;
  kind: RunsKindFilter;
}

export const DEFAULT_RUNS_QUERY: RunsQuery = {
  status: "all",
  text: "",
  sort: "newest",
  kind: "all",
};

function matchesStatus(run: ExperimentRunEntry, status: RunsStatusFilter): boolean {
  if (status === "all") return true;
  if (status === "cancelled") return Boolean(run.cancelled);
  if (status === "success") return run.exitCode === 0 && !run.cancelled;
  // Failed = non-zero exit that was not a user cancel (Bug #21).
  return run.exitCode !== 0 && !run.cancelled;
}

function matchesKind(run: ExperimentRunEntry, kind: RunsKindFilter): boolean {
  if (kind === "all") return true;
  if (kind === "untagged") return !run.kind;
  return run.kind === kind;
}

function matchesText(run: ExperimentRunEntry, text: string): boolean {
  const q = text.trim().toLowerCase();
  if (!q) return true;
  const hay = `${run.command}\n${run.notes ?? ""}\n${run.runId}\n${run.kind ?? ""}`.toLowerCase();
  return hay.includes(q);
}

function finishedMs(run: ExperimentRunEntry): number {
  const t = Date.parse(run.finishedAt || run.startedAt || "");
  return Number.isNaN(t) ? 0 : t;
}

/** Filter then sort. Does not mutate `runs`. */
export function queryExperimentRuns(
  runs: ExperimentRunEntry[],
  query: RunsQuery,
): ExperimentRunEntry[] {
  const filtered = runs.filter(
    (r) =>
      matchesStatus(r, query.status) &&
      matchesKind(r, query.kind) &&
      matchesText(r, query.text),
  );
  const sorted = [...filtered].sort((a, b) => {
    const diff = finishedMs(b) - finishedMs(a);
    if (diff !== 0) return query.sort === "newest" ? diff : -diff;
    return a.runId.localeCompare(b.runId);
  });
  return sorted;
}

/**
 * Move focus index within a list (keyboard nav).
 * Returns the clamped next index.
 */
export function stepFocusIndex(
  current: number,
  delta: number,
  length: number,
): number {
  if (length <= 0) return -1;
  if (current < 0) return delta > 0 ? 0 : length - 1;
  return Math.max(0, Math.min(length - 1, current + delta));
}
