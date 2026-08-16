/**
 * ToolHost wrappers for experiment tools:
 * - experiment-log (list/create/read/append_run/detect_env/open)
 * - results-snapshot
 * - provenance-query
 * (experiment-run is in representative-tools).
 */

import { TOOL_NAMES } from "../../shared/tool-names";
import { BUILTIN_TOOLS } from "../tools/index";
import { buildOpencodeToolDescription } from "../tools/tool-description";
import type { ExperimentLogBridgeRequest } from "../services/experiment-log-bridge";
import type { NativeToolDefinition, ToolExecuteContext } from "./tool-host";

export type ExperimentActionFn = (
  req: ExperimentLogBridgeRequest,
) => Record<string, unknown> | null | Promise<Record<string, unknown> | null>;

function str(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  return typeof v === "string" ? v.trim() : "";
}

function descriptionFor(name: string): string {
  const meta = BUILTIN_TOOLS.find((tool) => tool.name === name);
  return meta ? buildOpencodeToolDescription(meta) : name;
}

export function createExperimentNativeTools(deps?: {
  executeExperimentAction?: ExperimentActionFn;
}): NativeToolDefinition[] {
  const run = deps?.executeExperimentAction ?? (async (req) => {
    const { executeExperimentAction } = await import("../services/experiment-log-bridge");
    return executeExperimentAction(req);
  });

  return [
    {
      name: TOOL_NAMES.experimentLog,
      description: descriptionFor(TOOL_NAMES.experimentLog),
      async execute(args, ctx: ToolExecuteContext) {
        const action = str(args, "action");
        if (!action) return { ok: false, error: "missing_action" };

        const req: ExperimentLogBridgeRequest = {
          tool: "experiment-log",
          action,
          projectRoot: ctx.projectRoot,
          sessionId: ctx.runtimeSessionId,
        };

        const title = str(args, "title");
        if (title) req.title = title;
        const id = str(args, "id");
        if (id) req.id = id;

        if (typeof args.runsLimit === "number") req.runsLimit = args.runsLimit;
        if (args.includeOutput === true) req.includeOutput = true;
        if (args.briefLinks && typeof args.briefLinks === "object") {
          req.briefLinks = args.briefLinks as ExperimentLogBridgeRequest["briefLinks"];
        }
        if (Array.isArray(args.tags)) {
          req.tags = args.tags.filter((t): t is string => typeof t === "string");
        }
        if (args.run && typeof args.run === "object") {
          req.run = args.run as ExperimentLogBridgeRequest["run"];
        }

        const result = await run(req);
        return result ?? { ok: false, error: "no_result" };
      },
    },
    {
      name: TOOL_NAMES.resultsSnapshot,
      description: descriptionFor(TOOL_NAMES.resultsSnapshot),
      async execute(args, ctx: ToolExecuteContext) {
        const id = str(args, "id");
        if (!id) return { ok: false, error: "missing_id" };

        const req: ExperimentLogBridgeRequest = {
          tool: "results-snapshot",
          action: "snapshot",
          id,
          projectRoot: ctx.projectRoot,
          sessionId: ctx.runtimeSessionId,
        };

        if (Array.isArray(args.scanDirs)) {
          req.scanDirs = args.scanDirs.filter((d): d is string => typeof d === "string");
        }
        if (Array.isArray(args.metricsFiles)) {
          req.metricsFiles = args.metricsFiles.filter((m): m is string => typeof m === "string");
        }
        if (typeof args.maxFiles === "number") req.maxFiles = args.maxFiles;

        const result = await run(req);
        return result ?? { ok: false, error: "no_result" };
      },
    },
    {
      name: TOOL_NAMES.provenanceQuery,
      description: descriptionFor(TOOL_NAMES.provenanceQuery),
      async execute(args, ctx: ToolExecuteContext) {
        const action = str(args, "action");
        if (!action) return { ok: false, error: "missing_action" };

        const req: ExperimentLogBridgeRequest = {
          tool: "provenance-query",
          action,
          projectRoot: ctx.projectRoot,
          sessionId: ctx.runtimeSessionId,
        };

        const artifactPath = str(args, "artifactPath");
        if (artifactPath) req.artifactPath = artifactPath;
        const runId = str(args, "runId");
        if (runId) req.runId = runId;
        if (typeof args.limit === "number") req.limit = args.limit;

        const result = await run(req);
        return result ?? { ok: false, error: "no_result" };
      },
    },
  ];
}
