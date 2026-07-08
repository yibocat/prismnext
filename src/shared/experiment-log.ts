/**
 * Experiment log — shared schema, types, and pure helpers.
 *
 * Storage model (split registry / workspace):
 *
 *   .prismnext/experiments/<id>/     ← Platform registry (agent metadata)
 *     meta.json                      — title, briefLinks, workspacePath pointer
 *     runs.jsonl                     — append-only run records
 *
 *   <workspace-experiment-dir>/<id>/ ← User-facing lab (Workspace function: experiment)
 *     (empty at create — agent chooses layout, tooling, and artifacts)
 *
 * `meta.workspacePath` is project-relative (e.g. `experiment/exp-20260707-lr-a3f2`).
 *
 * This module is renderer-safe (no node:crypto / Date / fs). Slug/run-id
 * generators that need randomness or time live in the main-process service.
 */

/** Project-relative registry root for experiment metadata. */
export const EXPERIMENT_REGISTRY_REL = ".prismnext/experiments";

/** Filenames inside a registry entry directory. */
export const EXPERIMENT_META_FILENAME = "meta.json";
export const EXPERIMENT_RUNS_FILENAME = "runs.jsonl";

/** Conventional Python venv dir name — used only by optional `detect_env` probe, not enforced. */
export const EXPERIMENT_VENV_DIR = ".venv";

/** Max characters kept from stdout / stderr when recording a run. */
export const RUN_OUTPUT_TAIL_BYTES = 4 * 1024;

/** Links from an experiment back to the research brief (optional, set at create). */
export interface ExperimentBriefLinks {
  /** Canonical brief section names this experiment relates to. */
  sections?: string[];
  /** Short excerpt of the hypothesis being tested. */
  hypothesisExcerpt?: string;
  /** Short excerpt of the research question being addressed. */
  researchQuestionExcerpt?: string;
}

/** Experiment-level metadata — `meta.json` body (lives under `.prismnext/experiments/<id>/`). */
export interface ExperimentMeta {
  id: string;
  title: string;
  createdAt: string;
  /** Project-relative path to the workspace experiment folder (agent-owned layout inside). */
  workspacePath: string;
  briefLinks?: ExperimentBriefLinks;
  tags?: string[];
}

/** Best-effort runtime snapshot (optional; returned by `detect_env` / auto-filled on runs). */
export interface ExperimentEnv {
  /** Resolved python interpreter, if any (prefers island `.venv/bin/python` when present). */
  python: string | null;
  pythonVersion: string | null;
  /** Resolved Rscript path, if R is available. */
  rscript: string | null;
  rVersion: string | null;
  platform: string;
  /** Short git commit hash at run time, or null if not a repo / git missing. */
  gitCommit: string | null;
  /** Relative venv dir if a `.venv/` exists in the workspace folder, else null. */
  venvPath: string | null;
}

/** One run record — a single line in `runs.jsonl`. */
export interface ExperimentRunEntry {
  runId: string;
  startedAt: string;
  finishedAt: string;
  command: string;
  cwd: string;
  exitCode: number;
  stdoutTail: string;
  stderrTail: string;
  artifacts: string[];
  env: ExperimentEnv;
  notes?: string;
}

/** Summary entry returned by `list` (no run bodies). */
export interface ExperimentSummary {
  id: string;
  title: string;
  workspacePath: string;
  runCount: number;
  lastRunAt: string | null;
}

/** Input shape for `append_run` (server fills runId / timestamps / env when omitted). */
export interface ExperimentRunInput {
  runId?: string;
  startedAt?: string;
  finishedAt?: string;
  command: string;
  cwd?: string;
  exitCode?: number;
  stdoutTail?: string;
  stderrTail?: string;
  artifacts?: string[];
  env?: ExperimentEnv;
  notes?: string;
}

/**
 * Derive the kebab-case slug base from a title (max 24 chars, `[a-z0-9-]`).
 * Pure / renderer-safe. The full slug (`exp-YYYYMMDD-<base>-<shortid>`) is
 * assembled in the service where Date + randomness are available.
 */
export function slugBaseFromTitle(title: string): string {
  const base = (title || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24)
    .replace(/-+$/g, "");
  return base || "experiment";
}

/** Truncate a string to its last `maxBytes` bytes (UTF-8 safe, tail-biased). */
export function tailBytes(input: string, maxBytes: number): string {
  if (!input) return "";
  const buf = Buffer.from(input, "utf-8");
  if (buf.length <= maxBytes) return input;
  const sliced = buf.subarray(buf.length - maxBytes).toString("utf-8");
  const firstNl = sliced.indexOf("\n");
  return firstNl > 0 ? sliced.slice(firstNl + 1) : sliced;
}

/** Strip ANSI escape sequences (colors, cursor moves) from PTY output. */
export function stripAnsi(input: string): string {
  if (!input) return "";
  // eslint-disable-next-line no-control-regex
  return input.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "");
}
