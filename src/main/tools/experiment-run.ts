/**
 * experiment-run — Run a shell command inside an experiment island and record it.
 *
 * Fixed pipeline (executed by the bridge executor): resolve island → detect_env →
 * run command via the PTY layer → append a runs.jsonl entry → return the run.
 * This is the PREFERRED way to run experiment commands; it guarantees every run
 * is logged with env + exit code + output tail. If you run a raw `bash` command
 * inside an experiment island instead, the experiments module requires the next
 * tool call to be `experiment-log` action=append_run (fallback discipline).
 */
import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";
import { experimentLogBridgeRoot } from "./bridge-paths";

const BRIDGE_ROOT = experimentLogBridgeRoot();
// Experiment runs may take minutes — give the tool a generous poll ceiling.
// (The executor's own timeout is 10 min; the tool gives up slightly after.)
const TIMEOUT_MS = 11 * 60 * 1000;
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
  // Timed out. Leave the request file so the executor (still running) can find
  // its resPath — but the tool returns a timeout to the model. The orphaned
  // resPath will be written by the executor and cleaned up by a later poll.
  return toolOutput({
    ok: false,
    error: "experiment_run_timeout",
    hint: "The experiment command is still running in the background. Read its result later with experiment-log action=read.",
  });
}

export default tool({
  description:
    "Run a shell command inside an experiment workspace folder and append a structured run record. " +
    "Runs in the workspace cwd, captures stdout/stderr tail + exit code, optionally records artifacts/notes you supply, " +
    "and appends one JSONL line to the registry runs log. " +
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
      .describe("Optional artifact paths relative to the workspace folder — you choose what to record.")
      .optional(),
    notes: tool.schema
      .string()
      .describe("Optional agent comment recorded with the run.")
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

    return bridgeCall(context as Record<string, unknown>, payload);
  },
});
