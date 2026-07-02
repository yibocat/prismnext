/**
 * literature-read-pdf — Read extracted PDF body text from the project literature library.
 */
import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const BRIDGE_ROOT = path.join(os.homedir(), ".prism-literature-bridge");
const TIMEOUT_MS = 360_000;
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
  return `litpdf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

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
    await delay(100);
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
  return toolOutput({
    error: "Literature PDF read timed out (extraction may still be running). Check Literature panel status.",
  });
}

export default tool({
  description:
    "Read extracted body text of a library paper PDF by bibkey. Uses cached MinerU/pdfjs/HTML extracts under .prismnext/library/extract/. Set force=true to start extraction if missing (may upload PDF to MinerU cloud).",
  args: {
    bibkey: tool.schema.string().describe("Exact cite key / bibkey from the Literature library"),
    pages: tool.schema
      .string()
      .describe('Optional page range, e.g. "1-5" or "3,7,9"')
      .optional(),
    query: tool.schema
      .string()
      .describe("Optional keyword filter — return paragraphs containing this text")
      .optional(),
    source: tool.schema
      .enum(["auto", "mineru", "pdfjs", "html"])
      .describe("Extract source preference (default auto = best ready)")
      .optional(),
    force: tool.schema
      .boolean()
      .describe("If true, enqueue extraction and wait when no cached extract exists")
      .optional(),
  },
  async execute(args, context) {
    const bibkey = typeof args.bibkey === "string" ? args.bibkey.trim() : "";
    if (!bibkey) return toolOutput({ error: "Missing bibkey parameter." });
    try {
      return await bridgeCall(context as Record<string, unknown>, {
        action: "read-pdf",
        bibkey,
        pages: typeof args.pages === "string" ? args.pages : undefined,
        query: typeof args.query === "string" ? args.query : undefined,
        source: args.source,
        force: args.force === true,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return toolOutput({ error: message });
    }
  },
});
