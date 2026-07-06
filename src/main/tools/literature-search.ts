/**
 * literature-search — Search project literature library via Prism main-process bridge.
 * Return shape matches question.ts: `{ output: string }`.
 */
import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";
import { literatureBridgeRoot } from "./bridge-paths";

const BRIDGE_ROOT = literatureBridgeRoot();
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
    "Search papers in the current project's literature library by title, authors, abstract, bibkey, user tags, or AI summary. " +
    "Omit query (and tag) to list all library papers. Optional tag= filters to papers with that exact project tag (case-insensitive); " +
    "collection= filters to papers in a named collection. The response always includes a `collections` roster (id, name, paperCount).",
  args: {
    query: tool.schema
      .string()
      .describe("Search query; omit to list all papers in the library")
      .optional(),
    tag: tool.schema
      .string()
      .describe("Exact project tag filter (case-insensitive), e.g. World Model")
      .optional(),
    collection: tool.schema
      .string()
      .describe("Collection name filter (case-insensitive) — only return papers in this collection")
      .optional(),
    limit: tool.schema.number().describe("Max results (default 20)").optional(),
  },
  async execute(args, context) {
    const query = typeof args.query === "string" ? args.query.trim() : "";
    const tag = typeof args.tag === "string" ? args.tag.trim() : "";
    const collection = typeof args.collection === "string" ? args.collection.trim() : "";
    return bridgeCall(context as Record<string, unknown>, {
      action: "search",
      query,
      tag,
      collection: collection || undefined,
      limit: args.limit,
    });
  },
});
