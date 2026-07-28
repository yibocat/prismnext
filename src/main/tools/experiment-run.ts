/**
 * experiment-run — Run a shell command inside an experiment island and record it.
 *
 * Fixed pipeline (executed by the bridge executor): resolve island → ensure
 * shared `.prismnext/.venv` (uv/python) → detect_env → run command via PTY
 * (venv on PATH) → append a runs.jsonl entry → return the run.
 *
 * There is NO wall-clock timeout on the tool poll: training jobs may run for
 * many hours. The loop ends only when the bridge writes a result file, or the
 * OpenCode session aborts (`context.abort` / user cancel).
 */
import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";
import { experimentLogBridgeRoot } from "./bridge-paths";

const BRIDGE_ROOT = experimentLogBridgeRoot();
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
  return `exp-run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
      tool: "experiment-run",
      sessionId,
      projectRoot: typeof directory === "string" ? directory : process.cwd(),
    }),
    "utf-8",
  );

  const abort = (context as { abort?: AbortSignal }).abort;
  // Poll forever until the executor writes resPath, or the session cancels.
  // Do not impose a wall-clock soft/hard cap — long training must not be
  // timed out by the tool layer.
  while (!abort?.aborted) {
    await delay(50);
    if (!fs.existsSync(resPath)) continue;
    try {
      const result = JSON.parse(fs.readFileSync(resPath, "utf-8")) as Record<string, unknown>;
      try {
        fs.unlinkSync(resPath);
      } catch {
        // Bridge bookkeeping may race; ignore.
      }
      return toolOutput(result);
    } catch (err) {
      return toolOutput({ error: err instanceof Error ? err.message : String(err) });
    }
  }

  return toolOutput({
    ok: false,
    error: "experiment_run_aborted",
    hint:
      "Session was cancelled while the experiment was running. The bridge may still finish the run and append to runs.jsonl — check with `experiment-log action=read`.",
  });
}

export default tool({
  description:
    "Run a shell command inside an experiment workspace folder and append a structured run record. " +
    "Runs in the workspace cwd, captures stdout/stderr tail + exit code, optionally records artifacts/notes you supply, " +
    "and appends one JSONL line to the registry runs log. " +
    "There is no wall-clock timeout — the tool waits until the command finishes or the chat session is cancelled. " +
    "Use when you want execution + logging in one step; layout and env setup inside the workspace are up to you. " +
    "The experiment must already exist (experiment-log action=create).",
  args: {
    id: tool.schema
      .string()
      .describe("Experiment slug (e.g. exp-20260707-lr-ablation-a3f2) — the island to run in."),
    command: tool.schema
      .string()
      .describe("Shell command to execute in the experiment island cwd."),
    artifacts: tool.schema
      .array(tool.schema.string())
      .describe(
        "Result file paths produced by the command (any kind: figures, CSV, JSON metrics, " +
          "checkpoints, logs you care about, … — not images only). Island-relative or " +
          "project-relative; prismnext resolves against the disk when recording. " +
          "Declare all important outputs; undeclared paths may still be inferred from " +
          "island mtime or paths printed in stdout.",
      )
      .optional(),
    notes: tool.schema
      .string()
      .describe("Optional agent comment recorded with the run.")
      .optional(),
    kind: tool.schema
      .enum(["train", "eval", "plot", "data", "setup", "other"])
      .describe(
        "Optional run classification. Omit when unsure — do not invent 'other' as a default.",
      )
      .optional(),
  },
  async execute(args, context) {
    const id = typeof args.id === "string" ? args.id.trim() : "";
    const command = typeof args.command === "string" ? args.command : "";
    if (!id) return toolOutput({ ok: false, error: "Missing id parameter." });
    if (!command.trim()) return toolOutput({ ok: false, error: "Missing command parameter." });

    const payload: Record<string, unknown> = { action: "run", id, command };
    if (Array.isArray(args.artifacts)) payload.artifacts = args.artifacts;
    if (typeof args.notes === "string") payload.notes = args.notes;
    if (typeof args.kind === "string" && args.kind.trim()) payload.kind = args.kind.trim();

    return bridgeCall(context as Record<string, unknown>, payload);
  },
});
