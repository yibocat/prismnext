/**
 * experiment-log — Experiment island CRUD + run reading (single tool, multi-action).
 *
 * Actions: list | create | read | append_run | detect_env.
 * Writes a request to the experiment-log bridge and polls for the result.
 */
import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";
import { experimentLogBridgeRoot } from "./bridge-paths";

const BRIDGE_ROOT = experimentLogBridgeRoot();
const TIMEOUT_MS = 30_000;
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function toolOutput(data: Record<string, unknown>): { output: string } {
  return { output: JSON.stringify(data, null, 2) };
}

function sessionIdFrom(context: Record<string, unknown>): string {
  const c = context as { sessionID?: string; sessionId?: string };
  return c.sessionID || c.sessionId || "unknown";
}

function requestIdFrom(context: Record<string, unknown>): string {
  const c = context as { toolCallId?: string; tool_call_id?: string; callID?: string };
  for (const v of [c.toolCallId, c.tool_call_id, c.callID]) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return `exp-log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function bridgeCall(
  context: Record<string, unknown>,
  payload: Record<string, unknown>,
): Promise<{ output: string }> {
  const sessionId = sessionIdFrom(context);
  const requestId = requestIdFrom(context);
  const dir = path.join(BRIDGE_ROOT, sessionId);
  fs.mkdirSync(dir, { recursive: true });
  const reqPath = path.join(dir, `${requestId}.request.json`);
  const resPath = path.join(dir, `${requestId}.result.json`);

  const directory = (context as { directory?: string }).directory;
  fs.writeFileSync(
    reqPath,
    JSON.stringify({
      ...payload,
      tool: "experiment-log",
      sessionId,
      projectRoot: typeof directory === "string" ? directory : process.cwd(),
    }),
    "utf-8",
  );

  const abort = (context as { abort?: AbortSignal }).abort;
  const deadline = Date.now() + TIMEOUT_MS;
  while (!abort?.aborted && Date.now() < deadline) {
    await delay(50);
    if (!fs.existsSync(resPath)) continue;
    try {
      const result = JSON.parse(fs.readFileSync(resPath, "utf-8")) as Record<string, unknown>;
      try { fs.unlinkSync(resPath); } catch {}
      try { fs.unlinkSync(reqPath); } catch {}
      return toolOutput(result);
    } catch (err) {
      return toolOutput({ error: err instanceof Error ? err.message : String(err) });
    }
  }
  try { fs.unlinkSync(reqPath); } catch {}
  return toolOutput({ error: "Experiment log bridge timed out. Restart Prism Next and try a new chat tab." });
}

export default tool({
  description:
    "Experiment log — create experiment islands, list/read experiments, append run records, detect env, and open the Experiments UI. " +
    "Registry: `.prismnext/experiments/<id>/` (meta.json + runs.jsonl). " +
    "Workspace lab: `<experiment-dir>/<id>/` (clean folder — agent-owned layout). " +
    "Use `action` to select an operation. Do NOT use generic read/write/edit on registry files — use this tool only.",
  args: {
    action: tool.schema
      .enum(["list", "create", "read", "append_run", "detect_env", "open"])
      .describe(
        "Operation: list, create, read meta+runs, append a run, detect env, or open the Experiments panel on an island.",
      ),
    title: tool.schema
      .string()
      .describe("create only — experiment title (drives the auto-slug).")
      .optional(),
    id: tool.schema
      .string()
      .describe("read / append_run / detect_env / open — experiment slug (e.g. exp-20260707-lr-ablation-a3f2).")
      .optional(),
    runsLimit: tool.schema
      .number()
      .describe("read only — max recent runs to return (default 20).")
      .optional(),
    briefLinks: tool.schema
      .object({
        sections: tool.schema.array(tool.schema.string()).optional(),
        hypothesisExcerpt: tool.schema.string().optional(),
        researchQuestionExcerpt: tool.schema.string().optional(),
      })
      .describe("create only — link back to research brief sections / hypothesis excerpt.")
      .optional(),
    tags: tool.schema
      .array(tool.schema.string())
      .describe("create only — free-form tags.")
      .optional(),
    run: tool.schema
      .object({
        runId: tool.schema.string().optional(),
        startedAt: tool.schema.string().optional(),
        finishedAt: tool.schema.string().optional(),
        command: tool.schema.string(),
        cwd: tool.schema.string().optional(),
        exitCode: tool.schema.number().optional(),
        stdoutTail: tool.schema.string().optional(),
        stderrTail: tool.schema.string().optional(),
        artifacts: tool.schema.array(tool.schema.string()).optional(),
        notes: tool.schema.string().optional(),
        kind: tool.schema
          .enum(["train", "eval", "plot", "data", "setup", "other"])
          .describe("Optional run classification. Omit when unsure.")
          .optional(),
        logPath: tool.schema
          .string()
          .describe(
            "Optional lab-relative path to a full stdout/stderr log (e.g. logs/<runId>.log).",
          )
          .optional(),
      })
      .describe("append_run only — run entry fields (runId/timestamps/env auto-filled when omitted).")
      .optional(),
  },
  async execute(args, context) {
    const action = typeof args.action === "string" ? args.action : "";
    if (!action) return toolOutput({ ok: false, error: "Missing action parameter." });

    const payload: Record<string, unknown> = { action };
    if (action === "create") {
      const title = typeof args.title === "string" ? args.title.trim() : "";
      if (!title) return toolOutput({ ok: false, error: "Missing title parameter." });
      payload.title = title;
      if (args.briefLinks) payload.briefLinks = args.briefLinks;
      if (Array.isArray(args.tags)) payload.tags = args.tags;
    } else if (action === "read") {
      const id = typeof args.id === "string" ? args.id.trim() : "";
      if (!id) return toolOutput({ ok: false, error: "Missing id parameter." });
      payload.id = id;
      if (typeof args.runsLimit === "number") payload.runsLimit = args.runsLimit;
    } else if (action === "append_run") {
      const id = typeof args.id === "string" ? args.id.trim() : "";
      if (!id) return toolOutput({ ok: false, error: "Missing id parameter." });
      payload.id = id;
      if (!args.run || typeof args.run !== "object") {
        return toolOutput({ ok: false, error: "Missing run parameter." });
      }
      const run = args.run as { command?: unknown };
      if (typeof run.command !== "string" || !run.command.trim()) {
        return toolOutput({ ok: false, error: "Missing run.command parameter." });
      }
      payload.run = args.run;
    } else if (action === "detect_env" || action === "open") {
      const id = typeof args.id === "string" ? args.id.trim() : "";
      if (!id) return toolOutput({ ok: false, error: "Missing id parameter." });
      payload.id = id;
    } else if (action === "list") {
      // no extra params
    } else {
      return toolOutput({ ok: false, error: `Unknown action: ${action}` });
    }

    return bridgeCall(context as Record<string, unknown>, payload);
  },
});
