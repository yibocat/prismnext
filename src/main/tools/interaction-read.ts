/**
 * interaction-read — Read one Interaction spec by id.
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
  return `ix-read-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
    "Read a persisted Interaction spec from `.prismnext/artifacts/<id>/spec.json`. " +
    "Returns the full spec plus fenceMarkdown to embed in your assistant reply. " +
    "Use interaction-list to discover ids; use interaction-write to create or update.",
  args: {
    id: tool.schema.string().describe("Interaction object id (directory name under .prismnext/artifacts/)"),
  },
  async execute(args, context) {
    const id = typeof args.id === "string" ? args.id.trim() : "";
    if (!id) return toolOutput({ ok: false, error: "Missing id parameter." });
    return bridgeCall(context as Record<string, unknown>, { action: "read", id });
  },
});
