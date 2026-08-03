/**
 * research-brief-update — Patch one section of the project research brief (.brief.md).
 */
import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";
import { researchBriefBridgeRoot } from "./bridge-paths";

const BRIDGE_ROOT = researchBriefBridgeRoot();
const TIMEOUT_MS = 15_000;
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
  return `brief-upd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
  return toolOutput({ error: "Research brief bridge timed out. Restart prismnext and try a new chat tab." });
}

export default tool({
  description:
    "Update one section of project-root `.brief.md` when a matching `##` heading exists. " +
    "Replaces the section body by default; set append=true to append. " +
    "Do not use generic edit/write on `.brief.md` — use this tool only.",
  args: {
    section: tool.schema
      .string()
      .describe(
        "Section title — one of: Research question, Background & motivation, Hypotheses / claims, " +
          "Contribution & novelty, Scope, Assumptions, Open questions, Risks & limitations, Related work gaps",
      ),
    content: tool.schema.string().describe("New markdown body for the section (without the ## heading)"),
    append: tool.schema
      .boolean()
      .describe("When true, append to existing section content instead of replacing")
      .optional(),
  },
  async execute(args, context) {
    const section = typeof args.section === "string" ? args.section.trim() : "";
    const content = typeof args.content === "string" ? args.content : "";
    if (!section) return toolOutput({ error: "Missing section parameter.", ok: false });
    if (!content.trim()) return toolOutput({ error: "Missing content parameter.", ok: false });
    return bridgeCall(context as Record<string, unknown>, {
      action: "update",
      section,
      content,
      append: args.append === true,
    });
  },
});
