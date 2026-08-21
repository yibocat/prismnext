/**
 * Native Experiment Tools for PrismNext Pi Agent Host.
 *
 * 4 tools covering experiment logging, island command execution,
 * results scanning, and provenance tracking.
 */

import { Type } from "@earendil-works/pi-ai";
import { fileToolOutcome } from "../../../shared/agent-runtime";
import { TOOL_NAMES } from "../../../shared/tool-names";
import {
  isExperimentCtxError,
  resolveExperimentCtx,
} from "../../services/experiment-log-service";
import { parseExperimentRunKind, EXPERIMENT_REGISTRY_REL } from "../../../shared/experiment-log";
import { kickoffExperimentRun } from "../../services/experiment-run-executor";
import {
  dispatchExperimentLog,
  dispatchProvenanceQuery,
  dispatchResultsSnapshot,
  type ExperimentToolRequest,
} from "../../services/experiment-tool-dispatch";
import type { NativeToolDefinition } from "./types";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export const experimentLogTool: NativeToolDefinition = {
  name: TOOL_NAMES.experimentLog,
  label: "Manage Experiment Log",
  description: "List, create, read, or append runs to experiment islands in the workspace registry.",
  promptGuidelines: [
    "This records and reads experiment provenance — use `detect_env` after creating an island to capture the environment, and `append_run` for each executed run.",
    "Use `list` / `read` to inspect islands and their run windows before deciding what to analyze.",
    "This tool does not execute commands; to run a command in an island use experiment-run.",
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
  description: "Run a shell command in an existing experiment island and record its execution in the Job Monitor.",
  promptGuidelines: [
    "Target an existing island slug (`id`) — create one with experiment-log first if needed.",
    "The command runs under PermissionGate like bash; output is streamed live to the Job Monitor and recorded in the island's run log.",
    "Declare `artifacts` (relative paths the command produces) and a `kind` (train/eval/plot/data/setup/other) so the run is properly catalogued.",
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
  description: "Scan an experiment island for output figures, tables, and metrics without writing to registry.",
  promptGuidelines: [
    "Use after a run to summarize what an experiment produced — figures, CSV tables, JSON metrics — for Methods or a reply.",
    "Complements experiment-log (run history); this tool scans output files and does not modify the registry.",
    "Files it cannot parse are still listed, so you can read them yourself.",
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
  description: "Query provenance history (.workbench/provenance.jsonl) to resolve which run produced an artifact or list recent runs.",
  promptGuidelines: [
    "Use `resolve_artifact` to answer \"which run produced this file\" (command/env/exit/chat), and `resolve_run` for a run by id.",
    "An empty/null result is honest — nothing is recorded yet; report that rather than inventing a provenance.",
    "Valuable when writing Methods (cite the real command that produced a figure) or reproducing a result.",
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
