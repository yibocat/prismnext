/**
 * Native Experiment Tools for PrismNext Pi Agent Host.
 *
 * 4 tools covering experiment logging, island command execution,
 * results scanning, and provenance tracking.
 */

import { Type } from "@earendil-works/pi-ai";
import { fileToolOutcome } from "../../../shared/agent/runtime";
import { TOOL_NAMES } from "../../../shared/agent/tool-names";
import {
  isExperimentCtxError,
  resolveExperimentCtx,
} from "../../experiment/facade";
import { parseExperimentRunKind, EXPERIMENT_REGISTRY_REL } from "../../../shared/experiments/log";
import {
  dispatchExperimentLog,
  dispatchProvenanceQuery,
  dispatchResultsSnapshot,
  type ExperimentToolRequest,
} from "../../experiment/experiment-tool-dispatch";
import type { NativeToolDefinition } from "./types";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export const experimentLogTool: NativeToolDefinition = {
  name: TOOL_NAMES.experimentLog,
  label: "Manage Experiment Log",
  description:
    "Manage experiment islands in the workspace registry — list, create, read run history, append run entries, " +
    "capture environment (`detect_env`), or open an island in the UI (`open`). Does not execute shell commands.",
  promptGuidelines: [
    "Start with `list` when the island slug is unknown; `read` returns meta plus a recent run window (`runsLimit`, optional stdout/stderr tails via `includeOutput`).",
    "`create` when starting a new empirical line — optional `briefLinks` back to `.brief.md` (alignment only, not a run gate).",
    "After `create` (or when toolchain/hardware profile matters), run `detect_env` so later runs compare fairly.",
    "`append_run` records a run entry manually; live execution and logging → experiment-run.",
    "Research story / RQ debate → Research design module — this tool is island registry and run history only.",
    "Does not execute commands — use experiment-run.",
  ],
  parameters: Type.Object({
    action: Type.String({ minLength: 1, description: "Operation: list | create | read | append_run | detect_env | open" }),
    title: Type.Optional(Type.String({ description: "create only — experiment title" })),
    id: Type.Optional(Type.String({ description: "read / append_run / detect_env / open — experiment slug" })),
    runsLimit: Type.Optional(Type.Number({ description: "read only — max recent runs in the window (default 20)" })),
    includeOutput: Type.Optional(Type.Boolean({ description: "read only — include stdoutTail/stderrTail" })),
    briefLinks: Type.Optional(Type.Any({ description: "create only — links back to research brief" })),
    tags: Type.Optional(Type.Array(Type.String(), { description: "create only — free-form tags" })),
    run: Type.Optional(Type.Any({ description: "append_run only — run entry object" })),
  }),
  permission: {
    category: "safe_write",
    extractPath: () => EXPERIMENT_REGISTRY_REL,
  },
  async execute(args, ctx) {
    const action = str(args.action);
    if (!action) return { ok: false, error: "missing_action" };

    const ctxResult = resolveExperimentCtx(ctx.projectRoot);
    if (isExperimentCtxError(ctxResult)) {
      return { ok: false, error: ctxResult.error, hint: ctxResult.hint };
    }

    const req: ExperimentToolRequest = {
      tool: "experiment-log",
      action,
      sessionId: ctx.runtimeSessionId,
      projectRoot: ctx.projectRoot,
      title: str(args.title) || undefined,
      id: str(args.id) || undefined,
      runsLimit: typeof args.runsLimit === "number" ? args.runsLimit : undefined,
      includeOutput: args.includeOutput === true,
      briefLinks: args.briefLinks,
      tags: Array.isArray(args.tags) ? args.tags.filter((t): t is string => typeof t === "string") : undefined,
      run: args.run,
    };

    return dispatchExperimentLog(req, ctxResult);
  },
};

export const experimentRunTool: NativeToolDefinition = {
  name: TOOL_NAMES.experimentRun,
  label: "Run Experiment",
  description:
    "Run a shell command in an existing experiment island. Starts in the background, streams to the Job Monitor, " +
    "and records the run in the island log and provenance trail.",
  promptGuidelines: [
    "Requires an existing island `id` — `create` with experiment-log first when starting a new line of work.",
    "Set `kind` (train/eval/plot/data/setup/other) and `artifacts` (project-relative paths the command should produce) before long runs.",
    "Python: default `interpreter=project` uses `.workbench/.venv` — never system Python; use `interpreter=external` + `pythonPath` when pinned elsewhere.",
    "Runs under PermissionGate like bash; output streams live while chat continues — check Job Monitor and experiment-log `read` for tails.",
    "Prefer this over one-off bash when the work should stay in the island registry (Experiments module).",
    "Runs expected to cost more than a few minutes — confirm with the user (`question` tool) before starting.",
  ],
  parameters: Type.Object({
    id: Type.String({ minLength: 1, description: "Target experiment slug (e.g. exp-20260707-...)" }),
    command: Type.String({ minLength: 1, description: "Shell command to run in the island" }),
    artifacts: Type.Optional(Type.Array(Type.String(), { description: "Expected artifact file paths" })),
    notes: Type.Optional(Type.String({ description: "Optional notes for this run" })),
    kind: Type.Optional(Type.String({ description: "Run kind: train, eval, plot, data, setup, other" })),
    interpreter: Type.Optional(Type.String({ description: 'Interpreter lane: "project" or "external"' })),
    pythonPath: Type.Optional(Type.String({ description: "External interpreter command/path if interpreter=external" })),
  }),
  permission: {
    category: "shell_exec",
    extractBash: (args, projectRoot) => ({
      command: str(args.command),
      cwd: projectRoot,
    }),
  },
  async execute(args, ctx) {
    const id = str(args.id);
    const command = str(args.command);
    if (!id || !command) return { ok: false, error: "missing_id_or_command" };

    const ctxResult = resolveExperimentCtx(ctx.projectRoot);
    if (isExperimentCtxError(ctxResult)) {
      return { ok: false, error: ctxResult.error, hint: ctxResult.hint };
    }

    const kind = parseExperimentRunKind(args.kind);
    const artifacts = Array.isArray(args.artifacts)
      ? args.artifacts.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [];
    const { kickoffExperimentRun } = await import("../../experiment/experiment-run-executor");
    const started = await kickoffExperimentRun({
      ctx: ctxResult,
      id,
      command,
      artifacts: artifacts.length ? artifacts : undefined,
      notes: str(args.notes) || undefined,
      kind,
      chatSessionId: ctx.toolCallId,
      interpreter: args.interpreter === "external" ? "external" : undefined,
      pythonPath: str(args.pythonPath) || undefined,
    });

    if (!started) {
      return { ok: false, error: "experiment_not_found" };
    }

    const outcome = artifacts.length
      ? {
          resources: artifacts.map((path) => fileToolOutcome(path).resources[0]!),
        }
      : undefined;

    return {
      ok: true,
      started: true,
      runId: started.runId,
      executionId: started.executionId,
      hint: "Experiment run started in background. Output streams to the Job Monitor.",
      outcome,
    };
  },
};

export const resultsSnapshotTool: NativeToolDefinition = {
  name: TOOL_NAMES.resultsSnapshot,
  label: "Snapshot Experiment Results",
  description:
    "Scan an experiment island for output figures, tables, and metrics (read-only) — for Methods, chat summaries, or the next design iteration.",
  promptGuidelines: [
    "Call after runs when you need a structured picture of figures, CSV tables, or JSON metrics on disk.",
    "Does not modify the registry — complement experiment-log `read` (run tails) and provenance-query (command behind a file).",
    "Use `scanDirs` / `metricsFiles` on large islands; unparsed files are still listed for manual `read`.",
    "Summarize outputs in your reply — tie metrics to the claim under test (Experiments module); story-level rethink → Research design.",
  ],
  parameters: Type.Object({
    id: Type.String({ minLength: 1, description: "Experiment slug to inspect" }),
    scanDirs: Type.Optional(Type.Array(Type.String(), { description: "Optional subdirectories to scan" })),
    metricsFiles: Type.Optional(Type.Array(Type.String(), { description: "Optional explicit metrics files" })),
    maxFiles: Type.Optional(Type.Number({ description: "Max files to return" })),
  }),
  permission: {
    category: "read_only",
  },
  async execute(args, ctx) {
    const id = str(args.id);
    if (!id) return { ok: false, error: "missing_id" };

    const ctxResult = resolveExperimentCtx(ctx.projectRoot);
    if (isExperimentCtxError(ctxResult)) {
      return { ok: false, error: ctxResult.error, hint: ctxResult.hint };
    }

    const req: ExperimentToolRequest = {
      tool: "results-snapshot",
      action: "snapshot",
      id,
      sessionId: ctx.runtimeSessionId,
      projectRoot: ctx.projectRoot,
      scanDirs: Array.isArray(args.scanDirs) ? args.scanDirs.filter((d): d is string => typeof d === "string") : undefined,
      metricsFiles: Array.isArray(args.metricsFiles) ? args.metricsFiles.filter((m): m is string => typeof m === "string") : undefined,
      maxFiles: typeof args.maxFiles === "number" ? args.maxFiles : undefined,
    };

    return dispatchResultsSnapshot(req, ctxResult);
  },
};

export const provenanceQueryTool: NativeToolDefinition = {
  name: TOOL_NAMES.provenanceQuery,
  label: "Query Provenance",
  description:
    "Query `.workbench/provenance.jsonl` — resolve which run produced an artifact, fetch a run by id, or list recent provenance events.",
  promptGuidelines: [
    "`resolve_artifact` + project-relative `artifactPath` — command, env, exit code, and chat context for that file.",
    "`resolve_run` / `list_recent` for run-centric history windows (`limit` on list).",
    "Empty/null means nothing is recorded yet — report that honestly; do not invent provenance.",
    "Use when writing Methods, reproducing a figure, or debugging which experiment-run produced a path.",
  ],
  parameters: Type.Object({
    action: Type.String({ minLength: 1, description: "Operation: resolve_artifact | resolve_run | list_recent" }),
    artifactPath: Type.Optional(Type.String({ description: "Project-relative path of the artifact to resolve" })),
    runId: Type.Optional(Type.String({ description: "Exact run ID to resolve" })),
    limit: Type.Optional(Type.Number({ description: "Max recent events to return" })),
  }),
  permission: {
    category: "read_only",
  },
  async execute(args, ctx) {
    const action = str(args.action);
    if (!action) return { ok: false, error: "missing_action" };

    const req: ExperimentToolRequest = {
      tool: "provenance-query",
      action,
      sessionId: ctx.runtimeSessionId,
      projectRoot: ctx.projectRoot,
      artifactPath: str(args.artifactPath) || undefined,
      runId: str(args.runId) || undefined,
      limit: typeof args.limit === "number" ? args.limit : undefined,
    };

    return dispatchProvenanceQuery(req, ctx.projectRoot);
  },
};

export const EXPERIMENT_TOOLS: NativeToolDefinition[] = [
  experimentLogTool,
  experimentRunTool,
  resultsSnapshotTool,
  provenanceQueryTool,
];
