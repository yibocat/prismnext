/**
 * Pure filter/sort helpers for Experiments run history (Phase 3–4).
 * Kept out of the table component so behavior is unit-testable.
 */
import type {
  ExperimentRunEntry,
  ExperimentRunKind,
} from "@shared/experiments/log";

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

const SCRIPT_EXT =
  /\.(?:py|sh|bash|zsh|r|R|jl|m|ipynb|pl|rb|js|ts|tsx|mjs|cjs|go|rs|cpp|cc|c)$/i;

function clipTitle(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

function basenamePath(path: string): string {
  const clean = path.replace(/^['"]|['"]$/g, "");
  const parts = clean.split(/[/\\]/);
  return parts[parts.length - 1] || clean;
}

/**
 * Short human title from a shell command (script basename or command head).
 * Used when a run has no note.
 */
export function shortExperimentCommandTitle(command: string): string {
  const trimmed = command.trim().replace(/\s+/g, " ");
  if (!trimmed) return "—";

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  for (const tok of tokens) {
    const clean = tok.replace(/^['"]|['"]$/g, "");
    if (SCRIPT_EXT.test(clean) && !clean.includes("=")) {
      return basenamePath(clean);
    }
  }

  let i = 0;
  while (i < tokens.length && /^[A-Za-z_][\w]*=/.test(tokens[i]!)) i++;
  const rest = tokens.slice(i);
  if (rest.length === 0) return clipTitle(trimmed, 48);

  const bin = basenamePath(rest[0]!);
  if (/^python\d*(?:\.\d+)?$/i.test(bin)) {
    const arg1 = rest[1];
    if (arg1 === "-c") return clipTitle(`${bin} -c`, 48);
    if (arg1 === "-m" && rest[2]) return clipTitle(`${bin} -m ${rest[2]}`, 48);
    if (arg1) {
      const a = arg1.replace(/^['"]|['"]$/g, "");
      if (SCRIPT_EXT.test(a)) return basenamePath(a);
      return clipTitle([bin, arg1].join(" "), 48);
    }
  }

  return clipTitle(rest.slice(0, 3).join(" "), 48);
}

/** List primary title: note first line, else short command title. */
export function experimentRunListTitle(run: {
  notes?: string | null;
  command: string;
}): string {
  const note = run.notes?.trim();
  if (note) {
    const first = note.split(/\r?\n/)[0]!.trim();
    return clipTitle(first, 80);
  }
  return shortExperimentCommandTitle(run.command);
}
