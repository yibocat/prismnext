/**
 * literature-add — Add a paper to the project library by verified DOI or arXiv ID.
 * Metadata is resolved from external catalogs (Crossref, arXiv, OpenAlex, …);
 * invalid or unknown identifiers are rejected — never invent DOIs.
 */
import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";
import { literatureBridgeRoot } from "./bridge-paths";

const BRIDGE_ROOT = literatureBridgeRoot();
const TIMEOUT_MS = 90_000;
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
  return toolOutput({ error: "Literature bridge timed out. Restart prismnext and try a new chat tab." });
}

export default tool({
  description:
    "Add a real paper to the project literature library by DOI or arXiv ID. " +
    "The identifier is verified against external catalogs (Crossref, arXiv, OpenAlex, …) before insert. " +
    "ONLY use DOI/arXiv copied from literature-discover, websearch, or the user — NEVER invent identifiers. " +
    "If unsure, run literature-discover first, then call this tool with the exact DOI or arXiv ID.",
  args: {
    doi: tool.schema
      .string()
      .describe("Exact DOI from a trusted source (e.g. 10.1109/TFUZZ.2024.3364253). Mutually exclusive with arxivId.")
      .optional(),
    arxivId: tool.schema
      .string()
      .describe("Exact arXiv ID (e.g. 2312.00726). Mutually exclusive with doi.")
      .optional(),
    collection: tool.schema
      .string()
      .describe("Optional collection name — add the new paper to this collection (must already exist; create it in the Literature panel first).")
      .optional(),
  },
  async execute(args, context) {
    const doi = typeof args.doi === "string" ? args.doi.trim() : "";
    const arxivId = typeof args.arxivId === "string" ? args.arxivId.trim() : "";
    const collection = typeof args.collection === "string" ? args.collection.trim() : "";
    if (!doi && !arxivId) {
      return toolOutput({
        error: "Provide exactly one of doi or arxivId.",
        hint: "Get the identifier from literature-discover, websearch, or the user first. Do not invent DOIs.",
      });
    }
    if (doi && arxivId) {
      return toolOutput({
        error: "Provide only one of doi or arxivId, not both.",
      });
    }
    return bridgeCall(context as Record<string, unknown>, {
      action: "add",
      doi: doi || undefined,
      arxivId: arxivId || undefined,
      collection: collection || undefined,
    });
  },
});
