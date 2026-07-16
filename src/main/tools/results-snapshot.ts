/**
 * results-snapshot — Read-only scan of an experiment lab for figures /
 * tables / metrics (Phase 4 / P2.4). Complements experiment-log read
 * (run records) without writing the registry.
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
  return `snap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
      tool: "results-snapshot",
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
  return toolOutput({
    error: "Results-snapshot bridge timed out. Restart Prism Next and try a new chat tab.",
  });
}

export default tool({
  description:
    "Scan an experiment lab folder for figures, CSV tables, and JSON metrics " +
    "(read-only). Use after runs to summarize results for Methods / figures. " +
    "Complements experiment-log action=read (run history). Does not write the registry. " +
    "Unparsed files are listed so you can read them yourself.",
  args: {
    id: tool.schema
      .string()
      .describe("Experiment slug (e.g. exp-20260707-lr-ablation-a3f2)."),
    scanDirs: tool.schema
      .array(tool.schema.string())
      .describe("Lab-relative dirs to scan (default: results, output, figures).")
      .optional(),
    metricsFiles: tool.schema
      .array(tool.schema.string())
      .describe("Optional lab-relative JSON metric files to include.")
      .optional(),
    maxFiles: tool.schema
      .number()
      .describe("Cap on files examined (default 80, max 200).")
      .optional(),
  },
  async execute(args, context) {
    const id = typeof args.id === "string" ? args.id.trim() : "";
    if (!id) return toolOutput({ ok: false, error: "Missing id parameter." });

    const payload: Record<string, unknown> = { action: "snapshot", id };
    if (Array.isArray(args.scanDirs)) payload.scanDirs = args.scanDirs;
    if (Array.isArray(args.metricsFiles)) payload.metricsFiles = args.metricsFiles;
    if (typeof args.maxFiles === "number") payload.maxFiles = args.maxFiles;

    return bridgeCall(context as Record<string, unknown>, payload);
  },
});
