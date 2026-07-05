/**
 * literature-export-bib — Append library BibTeX entries into the project manuscript .bib file.
 */
import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";
import { literatureBridgeRoot } from "./bridge-paths";

const BRIDGE_ROOT = literatureBridgeRoot();
const TIMEOUT_MS = 60_000;
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
  return `lit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
  return toolOutput({ error: "Literature bridge timed out. Restart Prism and try a new chat tab." });
}

export default tool({
  description:
    "Append BibTeX from the project literature library into the manuscript references.bib file.",
  args: {
    bibkeys: tool.schema
      .array(tool.schema.string())
      .describe("Optional bibkeys to export; default: cited-in-tex keys that exist in library")
      .optional(),
    all: tool.schema
      .boolean()
      .describe("Export entire library (default false — only cited keys in .tex)")
      .optional(),
    onlyCitedInTex: tool.schema
      .boolean()
      .describe("When no bibkeys: merge library rows for keys cited in .tex (default true)")
      .optional(),
  },
  async execute(args, context) {
    const bibkeys = Array.isArray(args.bibkeys)
      ? args.bibkeys.map((k) => String(k).trim()).filter(Boolean)
      : undefined;
    const all = args.all === true;
    const onlyCitedInTex = args.onlyCitedInTex !== false;
    return bridgeCall(context as Record<string, unknown>, {
      action: "export-bib",
      ...(bibkeys?.length ? { bibkeys } : {}),
      all,
      onlyCitedInTex: bibkeys?.length ? false : onlyCitedInTex,
    });
  },
});
