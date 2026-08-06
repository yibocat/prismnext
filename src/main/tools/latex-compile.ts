/**
 * latex-compile — Compile the project LaTeX document via prismnext compile service.
 */
import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";
import { latexBridgeRoot } from "./bridge-paths";

const BRIDGE_ROOT = latexBridgeRoot();
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
  return toolOutput({ error: "LaTeX compile timed out (90s). Check Problems panel or retry." });
}

export default tool({
  description:
    "Compile a LaTeX document and return log summary plus structured errors. " +
    "The project manuscript (default, or any non-standalone mainFile) builds in the shared " +
    "`.prismnext/compile/` dir. A `\\documentclass{standalone}` file (e.g. a TikZ figure) " +
    "compiles in place in its own folder — PDF/aux stay next to the source and never " +
    "overwrite the manuscript build.",
  args: {
    mainFile: tool.schema
      .string()
      .describe("Optional main .tex relative path; auto-detect when omitted")
      .optional(),
    useTexlive: tool.schema
      .boolean()
      .describe("Use TeX Live instead of Tectonic (default false)")
      .optional(),
  },
  async execute(args, context) {
    const mainFile = typeof args.mainFile === "string" ? args.mainFile.trim() : undefined;
    const useTexlive = args.useTexlive === true;
    return bridgeCall(context as Record<string, unknown>, {
      action: "compile",
      useTexlive,
      ...(mainFile ? { mainFile } : {}),
    });
  },
});
