/**
 * Experiment log — shared schema, types, and pure helpers.
 *
 * Storage model (split registry / workspace):
 *
 *   .prismnext/experiments/<id>/     ← Platform registry (agent metadata)
 *     meta.json                      — title, briefLinks, workspacePath pointer
 *     runs.jsonl                     — append-only run records
 *     artifacts/<runId>/             — frozen image copies (`artifactSnapshots`)
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
/** Sidecar for O(1) runCount / lastRunAt (list + detail Overview). */
export const EXPERIMENT_RUNS_STATS_FILENAME = "runs.stats.json";

/**
 * Project-scoped shared Python venv — one env for Experiment islands,
 * Interaction artifact generation, and other project Python packages.
 * Created lazily on first Python need (not on project open).
 */
export const PRISMNEXT_VENV_REL = ".prismnext/.venv";

/**
 * Basename of the venv directory (for filesystem walk skip lists).
 * Prefer {@link PRISMNEXT_VENV_REL} for the full project-relative path.
 */
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

/** Lifecycle status for an experiment island (Phase 4 / P2.1). Absent ⇒ active. */
export type ExperimentStatus = "active" | "archived";

/** Optional run classification (Phase 4 / P2.3). Absent ⇒ untyped (do not invent `other`). */
export type ExperimentRunKind =
  | "train"
  | "eval"
  | "plot"
  | "data"
  | "setup"
  | "other";

/** Canonical kind values — keep tool enums / UI selects in sync. */
export const EXPERIMENT_RUN_KINDS: readonly ExperimentRunKind[] = [
  "train",
  "eval",
  "plot",
  "data",
  "setup",
  "other",
] as const;

const EXPERIMENT_RUN_KIND_SET = new Set<string>(EXPERIMENT_RUN_KINDS);

/**
 * Parse an optional run kind. Unknown / empty ⇒ `undefined` (omit on write;
 * never coerce to `"other"`).
 */
export function parseExperimentRunKind(value: unknown): ExperimentRunKind | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return undefined;
  return EXPERIMENT_RUN_KIND_SET.has(trimmed)
    ? (trimmed as ExperimentRunKind)
    : undefined;
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
  description?: string;
  /** `archived` hides from human browse by default; Agent list still includes it. */
  status?: ExperimentStatus;
  /** ISO timestamp when archived; cleared on restore. */
  archivedAt?: string | null;
}

/** Normalize missing / legacy meta to an explicit status. */
export function experimentStatusOf(
  meta: Pick<ExperimentMeta, "status"> | null | undefined,
): ExperimentStatus {
  return meta?.status === "archived" ? "archived" : "active";
}

/** Reject path traversal / empty ids before touching the registry or lab. */
export function isSafeExperimentId(id: string): boolean {
  if (!id || id.includes("..") || id.includes("/") || id.includes("\\")) return false;
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id);
}

/** Best-effort runtime snapshot (optional; returned by `detect_env` / auto-filled on runs). */
export interface ExperimentEnv {
  /** Resolved python interpreter, if any (prefers `.prismnext/.venv/bin/python`). */
  python: string | null;
  pythonVersion: string | null;
  /** Resolved Rscript path, if R is available. */
  rscript: string | null;
  rVersion: string | null;
  platform: string;
  /** Short git commit hash at run time, or null if not a repo / git missing. */
  gitCommit: string | null;
  /**
   * Project-relative path to the shared project venv
   * (`.prismnext/.venv`), or null when missing.
   */
  venvPath: string | null;
  /**
   * Interpreter actually used for the run (external-interpreter lane).
   * "project" = the shared `.prismnext/.venv`; "external" = a user-declared
   * interpreter outside the project venv (e.g. a SageMath environment).
   * Absent in run records predating the lane.
   */
  interpreter?: {
    kind: "project" | "external";
    path: string | null;
    version: string | null;
  } | null;
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
  /**
   * Frozen copies of image artifacts at append time (project-relative under
   * `.prismnext/experiments/<id>/artifacts/<runId>/`). Prefer these when
   * showing "what this run produced"; `artifacts` remain the mutable working paths.
   * Optional — old JSONL lines omit it.
   */
  artifactSnapshots?: string[];
  env: ExperimentEnv;
  notes?: string;
  /**
   * True when the human cancelled the in-flight PTY before natural exit.
   * Optional — old JSONL lines omit it; readers treat absent as false.
   */
  cancelled?: boolean;
  /** OpenCode chat tab that triggered the run (optional; old lines omit it). */
  chatSessionId?: string | null;
  /** Links into `provenance.jsonl` run_recorded event (optional; old lines omit it). */
  provenanceEventId?: string | null;
  /** Optional run classification (omit when unknown — do not default to `other`). */
  kind?: ExperimentRunKind;
  /**
   * Lab-relative path to a full stdout/stderr log when the live capture exceeded
   * {@link RUN_OUTPUT_TAIL_BYTES} (e.g. `logs/<runId>.log`).
   */
  logPath?: string | null;
  /** Main-process Execution this run attached to (optional; old lines omit it). */
  executionId?: string;
  /** Absolute transcript path owned by ExecutionRegistry. */
  transcriptPath?: string;
  /** Absolute captured-stderr path owned by ExecutionRegistry, when present. */
  stderrPath?: string;
}

/** Summary entry returned by `list` (no run bodies). */
export interface ExperimentSummary {
  id: string;
  title: string;
  workspacePath: string;
  runCount: number;
  lastRunAt: string | null;
  status: ExperimentStatus;
  archivedAt: string | null;
  tags?: string[];
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
  /** See {@link ExperimentRunEntry.cancelled}. */
  cancelled?: boolean;
  kind?: ExperimentRunKind;
  logPath?: string | null;
  executionId?: string;
  transcriptPath?: string;
  stderrPath?: string;
}

/**
 * Result of one experiment-run kickoff completion.
 * Shared by executor (`onComplete` / bridge `.result.json`), IPC
 * `experiment:runComplete`, and the renderer store — do not redefine locally.
 */
export interface ExperimentRunResult {
  ok: boolean;
  /** Present when the run completed and was appended to runs.jsonl. */
  run?: ExperimentRunEntry;
  exitCode?: number;
  stdoutTail?: string;
  stderrTail?: string;
  /** Failure reason (validation, PTY error, cancelled, etc.). */
  error?: string;
}

/** Renderer / preload payload for `experiment:runComplete`. */
export interface ExperimentRunCompleteEvent {
  id: string;
  runId: string;
  result: ExperimentRunResult;
}

/** Renderer / preload payload for `experiment:runStarted` (Agent + UI kickoff). */
export interface ExperimentRunStartedEvent {
  id: string;
  runId: string;
  command: string;
  executionId?: string;
}

/** Renderer / preload payload for `experiment:runOutput`. */
export interface ExperimentRunOutputEvent {
  id: string;
  runId: string;
  chunk: string;
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
  let bytes: Uint8Array;
  if (typeof Buffer !== "undefined") {
    const buf = Buffer.from(input, "utf-8");
    if (buf.length <= maxBytes) return input;
    bytes = buf.subarray(buf.length - maxBytes);
  } else {
    const encoded = new TextEncoder().encode(input);
    if (encoded.length <= maxBytes) return input;
    bytes = encoded.subarray(encoded.length - maxBytes);
  }
  const sliced =
    typeof Buffer !== "undefined"
      ? (bytes as Buffer).toString("utf-8")
      : new TextDecoder().decode(bytes);
  const firstNl = sliced.indexOf("\n");
  return firstNl > 0 ? sliced.slice(firstNl + 1) : sliced;
}

/** Strip ANSI escape sequences (colors, cursor moves) from PTY output. */
export function stripAnsi(input: string): string {
  if (!input) return "";
  // eslint-disable-next-line no-control-regex
  return input.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "");
}

/** One row for the Environment section in the detail UI. */
export interface ExperimentEnvDisplayRow {
  label: string;
  /** Shown in the UI (may combine path + version). */
  display: string | null;
  /** Copied to clipboard when the value is copyable; null = not copyable. */
  copyText: string | null;
  placeholder: string;
}

/**
 * Rows to render for `detect_env` in the Experiments detail view.
 *
 * Schema is fixed (`ExperimentEnv`); presentation is dynamic:
 * - Platform + Python + Venv always listed (best-effort probes).
 * - R and Git appear only when detected (optional runtimes / repo).
 */
export function experimentEnvDisplayRows(
  env: ExperimentEnv | null,
): ExperimentEnvDisplayRow[] {
  if (!env) return [];

  const rows: ExperimentEnvDisplayRow[] = [
    {
      label: "Python",
      display: env.python
        ? [env.python, env.pythonVersion].filter(Boolean).join(" · ")
        : null,
      copyText: env.python,
      placeholder: "not detected",
    },
    {
      label: "Platform",
      display: env.platform || null,
      copyText: env.platform || null,
      placeholder: "unknown",
    },
    {
      label: "Venv",
      display: env.venvPath,
      copyText: env.venvPath,
      placeholder: "no .venv",
    },
  ];

  if (env.rscript) {
    rows.push({
      label: "R",
      display: [env.rscript, env.rVersion].filter(Boolean).join(" · "),
      copyText: env.rscript,
      placeholder: "",
    });
  }

  if (env.gitCommit) {
    rows.push({
      label: "Git",
      display: env.gitCommit,
      copyText: env.gitCommit,
      placeholder: "",
    });
  }

  return rows;
}

/**
 * Whether a shell command looks like it invokes Python / pip / uv for package or script work.
 * Used to hard-gate execution inside the Workspace Experiment folder.
 */
export function isPythonRelatedCommand(command: string): boolean {
  const raw = (command || "").trim();
  if (!raw) return false;
  if (/\buv\s+(pip|run|sync|add|remove|lock|venv|python|tree)\b/i.test(raw)) return true;
  const segments = raw.split(/(?:&&|\|\||;|\n)/);
  for (const segment of segments) {
    const s = normalizeCommandSegment(segment);
    if (!s) continue;
    if (/^(?:[\w.+@/-]*\/)?python(?:\d+(?:\.\d+)*)?(?:\s|$)/i.test(s)) return true;
    if (/^(?:[\w.+@/-]*\/)?pip(?:\d+)?(?:\s|$)/i.test(s)) return true;
  }
  return false;
}

/**
 * Command names that execute Python(-like) code through an interpreter living
 * OUTSIDE the project venv — currently SageMath's `sage` (`sage -python x.py`,
 * `sage x.sage`, `sage -c …`). Deliberately kept OUT of
 * `isPythonRelatedCommand`: the experiment-run gate must not ensure/inject the
 * project venv for these (that is what `interpreter: "external"` is for).
 * Used to close the bash-lane bypass — inside the Experiment workspace such
 * commands must go through `experiment-run` like any other script run.
 */
const EXTERNAL_INTERPRETER_HEADS = ["sage"] as const;

export function isExternalInterpreterCommand(command: string): boolean {
  const raw = (command || "").trim();
  if (!raw) return false;
  const segments = raw.split(/(?:&&|\|\||;|\n)/);
  for (const segment of segments) {
    const s = normalizeCommandSegment(segment);
    if (!s) continue;
    for (const name of EXTERNAL_INTERPRETER_HEADS) {
      if (new RegExp(`^(?:[\\w.+@/-]*\\/)?${name}(?:\\s|$)`, "i").test(s)) return true;
    }
  }
  return false;
}

/**
 * Extract an absolute-path Python interpreter from a command, when the
 * command leads with one (e.g. `/opt/conda/envs/sage/bin/python x.py`).
 * Returns null for bare `python` / `python3` (PATH-resolved) and for
 * non-Python commands. Used to detect *undeclared* external interpreters
 * so the gate can nudge callers toward `interpreter: "external"`.
 */
export function extractAbsolutePythonPath(command: string): string | null {
  const raw = (command || "").trim();
  if (!raw) return null;
  const segments = raw.split(/(?:&&|\|\||;|\n)/);
  for (const segment of segments) {
    const s = normalizeCommandSegment(segment);
    if (!s) continue;
    const m = /^((?:[\w.+@:-]*[\\/])+\.?python(?:\d+(?:\.\d+)*)?)(?:\s|$)/i.exec(s);
    if (m && m[1] && /^(?:\/|[A-Za-z]:[\\/])/.test(m[1])) return m[1];
  }
  return null;
}

/** Installs that would target the host/system interpreter — always forbidden via bash. */
export function isForbiddenSystemPythonInstall(command: string): boolean {
  const raw = (command || "").trim();
  if (!raw) return false;
  if (/\buv\s+pip\b[\s\S]*--system\b/i.test(raw)) return true;
  // Bare pip / pip3 / python -m pip → host/system site-packages (prismnext forbids this).
  if (isBarePipInstallCommand(raw)) return true;
  return false;
}

/**
 * `pip install` / `pip3 install` / `python -m pip install` (not `uv pip`).
 * These almost always hit the system interpreter when run from project root.
 */
export function isBarePipInstallCommand(command: string): boolean {
  const segments = (command || "").split(/(?:&&|\|\||;|\n|\|)/);
  for (const segment of segments) {
    const s = normalizeCommandSegment(segment);
    if (!s) continue;
    // Explicitly allow only when the segment starts with `uv pip`
    if (/^uv\s+pip\b/i.test(s)) continue;
    if (/^(?:[\w.+@/-]*\/)?pip(?:\d+)?\s+install\b/i.test(s)) return true;
    if (/^(?:[\w.+@/-]*\/)?python(?:\d+(?:\.\d+)*)?\s+-m\s+pip\s+install\b/i.test(s)) {
      return true;
    }
  }
  return false;
}

function stripLeadingEnvAssignments(segment: string): string {
  return segment.replace(/^(?:\w+=(?:'[^']*'|"[^"]*"|\S+)\s+)+/, "").trim();
}

/**
 * Reduce a command segment to the real tool being invoked: strip leading env
 * assignments and common wrappers (`sudo`, `env`, `time`, `nohup`, `nice`,
 * `stdbuf`, `timeout`, `exec`, `command`, `builtin`), and unwrap one level of
 * `sh|bash|zsh -c '…'`. Without this, `sudo pip install x` or
 * `bash -c 'python x.py'` would slip past every Python detector below and
 * hit the system interpreter.
 */
function normalizeCommandSegment(segment: string, depth = 0): string {
  let s = stripLeadingEnvAssignments(segment);
  for (let i = 0; i < 6; i++) {
    const before = s;
    // nice first: its `-n N` value must be consumed together with the flag.
    s = s.replace(/^nice\s+(?:(?:-n\s*\S+|--adjustment=\S+)\s+)?/i, "");
    s = s.replace(
      /^(?:(?:sudo|command|builtin|exec|time|nohup|stdbuf|env)(?:\s+--?\S+)*|timeout(?:\s+--?\S+)*\s+\S+)\s+/i,
      "",
    );
    s = stripLeadingEnvAssignments(s);
    if (s === before) break;
  }
  if (depth < 2) {
    const m = s.match(
      /^(?:[\w.+@/-]*\/)?(?:bash|sh|zsh|dash|ksh)\s+(?:(?:-[a-zA-Z]+)\s+)*-c\s+(["'])([\s\S]*)\1\s*$/i,
    );
    if (m) return normalizeCommandSegment(m[2], depth + 1);
  }
  return s;
}

/** Package/venv setup segments allowed via bash inside Experiment islands. */
function isPythonSetupSegment(segment: string): boolean {
  const s = normalizeCommandSegment(segment);
  if (!s) return false;
  // Only uv pip / uv venv — never bare pip3 (system Python).
  if (/^uv\s+pip\s+(install|sync|uninstall|list|show|freeze)\b/i.test(s)) return true;
  if (/^uv\s+(venv|add|remove|lock|tree)\b/i.test(s)) return true;
  if (/^(?:[\w.+@/-]*\/)?python(?:\d+(?:\.\d+)*)?\s+-m\s+venv\b/i.test(s)) return true;
  return false;
}

function isPythonScriptSegment(segment: string): boolean {
  const s = normalizeCommandSegment(segment);
  if (!s) return false;
  if (/^uv\s+run\b/i.test(s)) return true;
  if (/^uv\s+python\b/i.test(s)) return true;
  // External interpreters (`sage -python …`) run code outside the project
  // venv — they count as script runs so a mixed `uv pip install … && sage …`
  // command cannot slip through as "setup-only".
  if (isExternalInterpreterCommand(s)) return true;
  // python / python3 … but not `python -m venv`
  if (/^(?:[\w.+@/-]*\/)?python(?:\d+(?:\.\d+)*)?(?:\s|$)/i.test(s)) {
    if (/\s+-m\s+venv\b/i.test(s)) return false;
    return true;
  }
  return false;
}

/**
 * True when the command only sets up the shared Experiment workspace env
 * (uv pip / venv), with no script execution.
 * `cd labs && uv pip install matplotlib` → true.
 */
export function isExperimentPythonSetupCommand(command: string): boolean {
  if (!isPythonRelatedCommand(command)) return false;
  const segments = (command || "").split(/(?:&&|\|\||;|\n)/);
  let sawSetup = false;
  for (const segment of segments) {
    const s = normalizeCommandSegment(segment);
    if (!s) continue;
    if (isPythonSetupSegment(s)) {
      sawSetup = true;
      continue;
    }
    if (isPythonScriptSegment(s) || /^(?:[\w.+@/-]*\/)?pip(?:\d+)?(?:\s|$)/i.test(s)) {
      // bare pip without install verb, or script — not setup-only
      if (isPythonScriptSegment(s)) return false;
      if (/^(?:[\w.+@/-]*\/)?pip(?:\d+)?\s+/i.test(s) && !isPythonSetupSegment(s)) {
        return false;
      }
    }
  }
  return sawSetup;
}

/**
 * True when the command runs Python / uv run (not just env setup) — including
 * external interpreters (`sage -python …`), which execute Python outside the
 * project venv. These must use experiment-run inside Experiment islands —
 * bash is blocked.
 */
export function isExperimentPythonScriptCommand(command: string): boolean {
  return (
    (isPythonRelatedCommand(command) || isExternalInterpreterCommand(command)) &&
    !isExperimentPythonSetupCommand(command)
  );
}
