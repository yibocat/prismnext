/**
 * provenance-query - Read-only lookups into `.prismnext/provenance.jsonl`.
 *
 * Closes the experiment -> agent loop: an agent that wrote provenance can read
 * it back to trace which run produced a file, or to summarize recent activity.
 * Rides the same file bridge as experiment-log (tool field discriminates).
 *
 * Actions:
 *  - resolve_artifact: given a project-relative file path, return the run that
 *    claimed it (command, env, exit, chatSessionId) + how it was linked.
 *  - resolve_run: given a runId, return the run_recorded event.
 *  - list_recent: the most recent N provenance events (runs + downloads).
 *
 * "Not found" is a normal null/empty result, not an error.
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
  return `prov-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
      tool: "provenance-query",
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
  return toolOutput({ error: "Provenance bridge timed out. Restart Prism Next and try a new chat tab." });
}

export default tool({
  description:
    "Provenance query - read-only trace of experiment runs and downloaded files from `.prismnext/provenance.jsonl`. " +
    "Use `action` to select: resolve_artifact (which run produced a file - command/env/exit/chat), " +
    "resolve_run (a run by id), or list_recent (recent provenance events). " +
    "Returns null/empty when nothing is recorded - that is honest, not an error. " +
    "Useful when writing Methods (cite the real command that produced a figure) or reproducing a result.",
  args: {
    action: tool.schema
      .enum(["resolve_artifact", "resolve_run", "list_recent"])
      .describe("Operation: trace a file to its run, fetch a run by id, or list recent events."),
    artifactPath: tool.schema
      .string()
      .describe("resolve_artifact only - project-relative file path (e.g. experiment/exp-x/plot.png).")
      .optional(),
    runId: tool.schema
      .string()
      .describe("resolve_run only - the run id (e.g. run-20260707-120000-a1b2).")
      .optional(),
    limit: tool.schema
      .number()
      .describe("list_recent only - max events to return (default 20, capped at 200).")
      .optional(),
  },
  async execute(args, context) {
    const action = typeof args.action === "string" ? args.action : "";
    if (!action) return toolOutput({ ok: false, error: "Missing action parameter." });

    const payload: Record<string, unknown> = { action };
    if (action === "resolve_artifact") {
      const artifactPath = typeof args.artifactPath === "string" ? args.artifactPath.trim() : "";
      if (!artifactPath) return toolOutput({ ok: false, error: "Missing artifactPath parameter." });
      payload.artifactPath = artifactPath;
    } else if (action === "resolve_run") {
      const runId = typeof args.runId === "string" ? args.runId.trim() : "";
      if (!runId) return toolOutput({ ok: false, error: "Missing runId parameter." });
      payload.runId = runId;
    } else if (action === "list_recent") {
      if (typeof args.limit === "number") payload.limit = args.limit;
    } else {
      return toolOutput({ ok: false, error: `Unknown action: ${action}` });
    }

    return bridgeCall(context as Record<string, unknown>, payload);
  },
});
