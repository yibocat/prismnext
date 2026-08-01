/**
 * literature-discover — Search external academic catalogs by topic via prismnext bridge.
 * Returns candidate DOI/arXiv IDs; does NOT search the local library or cite.
 */
import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";
import { literatureBridgeRoot } from "./bridge-paths";

const BRIDGE_ROOT = literatureBridgeRoot();
const TIMEOUT_MS = 45_000;
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
  return `lit-disc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
  return toolOutput({ error: "Literature bridge timed out. Restart prismnext and try a new chat tab." });
}

export default tool({
  description:
    "Keyword search across external academic catalogs (arXiv, Crossref, OpenAlex, Semantic Scholar, PubMed). " +
    "Use for topic / external discovery only — NOT the project library. " +
    "Returns candidate papers with DOI/arXiv IDs. Does NOT cite or add to library. " +
    "After choosing papers, call literature-stage for each DOI/arXiv before writing [n].",
  args: {
    query: tool.schema
      .string()
      .describe("Search query — topic, keywords, or paper title fragment"),
    sources: tool.schema
      .array(tool.schema.string())
      .describe(
        "Optional source ids: arxiv, crossref, openalex, semantic-scholar, pubmed, biorxiv, medrxiv. Defaults to the five free catalogs.",
      )
      .optional(),
    limit: tool.schema.number().describe("Max hits per source (1–20, default 8)").optional(),
    year: tool.schema
      .string()
      .describe("Optional year filter: YYYY or YYYY-YYYY or YYYY- (open-ended)")
      .optional(),
    author: tool.schema.string().describe("Optional author name filter").optional(),
  },
  async execute(args, context) {
    const query = typeof args.query === "string" ? args.query.trim() : "";
    if (!query) {
      return toolOutput({
        error: "Missing query parameter.",
        hint: "Provide a focused topic or keyword query for external literature discovery.",
      });
    }
    const sources = Array.isArray(args.sources)
      ? args.sources.filter((s): s is string => typeof s === "string")
      : undefined;
    return bridgeCall(context as Record<string, unknown>, {
      action: "discover",
      query,
      sources,
      limit: typeof args.limit === "number" ? args.limit : undefined,
      year: typeof args.year === "string" ? args.year.trim() || undefined : undefined,
      author: typeof args.author === "string" ? args.author.trim() || undefined : undefined,
    });
  },
});
