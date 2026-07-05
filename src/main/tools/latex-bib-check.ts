/**
 * latex-bib-check — Compare \\cite keys in .tex files against project .bib entries.
 */
import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";
import { latexBridgeRoot } from "./bridge-paths";

const BRIDGE_ROOT = latexBridgeRoot();
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
  return `latex-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
  return toolOutput({ error: "LaTeX bridge timed out. Restart Prism and try a new chat tab." });
}

export default tool({
  description:
    "Structured audit: \\cite keys in .tex vs project .bib (and library.db by default). " +
    "Prefer over read/glob on main.tex and references.bib; returns missing, unused, duplicate keys as JSON.",
  args: {
    mainFile: tool.schema
      .string()
      .describe("Optional main .tex for bib resolution; auto-detect when omitted")
      .optional(),
    bibPath: tool.schema
      .string()
      .describe("Optional .bib path relative to project; infer from \\addbibresource when omitted")
      .optional(),
    includeLibraryCheck: tool.schema
      .boolean()
      .describe("Also compare \\cite keys vs literature library.db (default true)")
      .optional(),
  },
  async execute(args, context) {
    const mainFile = typeof args.mainFile === "string" ? args.mainFile.trim() : undefined;
    const bibPath = typeof args.bibPath === "string" ? args.bibPath.trim() : undefined;
    const includeLibraryCheck = args.includeLibraryCheck !== false;
    return bridgeCall(context as Record<string, unknown>, {
      action: "bib-check",
      includeLibraryCheck,
      ...(mainFile ? { mainFile } : {}),
      ...(bibPath ? { bibPath } : {}),
    });
  },
});
