/**
 * literature-read — Read paper metadata via Prism main-process bridge.
 * Pattern mirrors question.ts: fs/path/os only, file bridge, returns `{ output: string }`.
 */
import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const BRIDGE_ROOT = path.join(os.homedir(), ".prism-literature-bridge");
const TIMEOUT_MS = 30_000;
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function sessionIdFrom(context: Record<string, unknown>): string {
  const c = context as { sessionID?: string; sessionId?: string };
  return c.sessionID || c.sessionId || "unknown";
}

function requestIdFrom(context: Record<string, unknown>): string {
  const c = context as { toolCallId?: string; tool_call_id?: string; callID?: string };
  for (const v of [c.toolCallId, c.tool_call_id, c.callID]) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return `lit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** OpenCode custom tools must return `{ output: string }` — same contract as question.ts / bash.ts. */
function toolOutput(data: Record<string, unknown>): { output: string } {
  return { output: JSON.stringify(data, null, 2) };
}

async function bridgeCall(
  context: Record<string, unknown>,
  payload: Record<string, unknown>,
): Promise<{ output: string }> {
  const sessionId = sessionIdFrom(context);
  const requestId = requestIdFrom(context);
  const directory = (context as { directory?: string }).directory;
  const projectRoot = typeof directory === "string" ? directory : process.cwd();

  const dir = path.join(BRIDGE_ROOT, sessionId);
  fs.mkdirSync(dir, { recursive: true });
  const reqPath = path.join(dir, `${requestId}.request.json`);
  const resPath = path.join(dir, `${requestId}.result.json`);

  fs.writeFileSync(
    reqPath,
    JSON.stringify({ ...payload, sessionId, projectRoot }),
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
      const message = err instanceof Error ? err.message : String(err);
      return toolOutput({ error: message });
    }
  }
  try { fs.unlinkSync(reqPath); } catch {}
  return toolOutput({ error: "Literature bridge timed out. Restart Prism and try a new chat tab." });
}

export default tool({
  description:
    "Read a paper from the project literature library by bibkey (Cite key in Literature panel). Returns metadata, abstract, publication_details, highlights, PDF path. Uses .prismnext/library/library.db.",
  args: {
    bibkey: tool.schema.string().describe("Exact cite key / bibkey from the Literature library"),
  },
  async execute(args, context) {
    const bibkey = typeof args.bibkey === "string" ? args.bibkey.trim() : "";
    if (!bibkey) return toolOutput({ error: "Missing bibkey parameter." });
    try {
      return await bridgeCall(context as Record<string, unknown>, { action: "read", bibkey });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return toolOutput({ error: message });
    }
  },
});
