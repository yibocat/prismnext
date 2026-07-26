/**
 * interaction-write — Create or update an Interaction spec (upsert).
 */
import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";
import { interactionBridgeRoot } from "./bridge-paths";

const BRIDGE_ROOT = interactionBridgeRoot();
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
  return `ix-write-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function bridgeCall(
  context: Record<string, unknown>,
  payload: Record<string, unknown>,
): Promise<{ output: string }> {
  const sessionId = sessionIdFrom(context);
  const requestId = requestIdFrom(context);
  const directory = (context as { directory?: string }).directory;
  const dir = path.join(BRIDGE_ROOT, sessionId);
  fs.mkdirSync(dir, { recursive: true });
  const reqPath = path.join(dir, `${requestId}.request.json`);
  const resPath = path.join(dir, `${requestId}.result.json`);

  fs.writeFileSync(
    reqPath,
    JSON.stringify({
      ...payload,
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
      return toolOutput({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
  try { fs.unlinkSync(reqPath); } catch {}
  return toolOutput({ ok: false, error: "Interaction bridge timed out. Restart prismnext and try a new chat tab." });
}

export default tool({
  description:
    "Create or update an Interactive Research Artifact at `.prismnext/artifacts/<id>/spec.json`. " +
    "Required JSON fields: id, title, kind (plot.line | plot.series | plot.scatter | math.surface | math.field), compute (local | bound). " +
    "Optional: revision (auto-increments on update), params, model, bindings, view, resources. " +
    "For bound plots, set resources[] to project-relative csv paths from experiment outputs. " +
    "After success, embed the returned fenceMarkdown in your assistant reply — do NOT use ```artifact for interactive objects.",
  args: {
    spec: tool.schema
      .string()
      .describe(
        "InteractionSpec as a JSON string. Example: {\"id\":\"demo.plot\",\"title\":\"Loss curve\",\"kind\":\"plot.line\",\"compute\":\"local\",\"revision\":1}",
      ),
  },
  async execute(args, context) {
    const raw = typeof args.spec === "string" ? args.spec.trim() : "";
    if (!raw) return toolOutput({ ok: false, error: "Missing spec parameter (JSON string)." });
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return toolOutput({ ok: false, error: "spec is not valid JSON." });
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return toolOutput({ ok: false, error: "spec must be a JSON object." });
    }
    return bridgeCall(context as Record<string, unknown>, { action: "write", spec: parsed });
  },
});
