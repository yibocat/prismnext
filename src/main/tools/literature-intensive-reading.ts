/**
 * literature-intensive-reading — Add/remove/list papers on this chat's intensive-reading list
 * so the agent can call literature-read-pdf without the user manually @-toggling.
 */
import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";
import { literatureBridgeRoot } from "./bridge-paths";

const BRIDGE_ROOT = literatureBridgeRoot();
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
  return `lit-int-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
    await delay(50);
    if (!fs.existsSync(resPath)) continue;
    try {
      const result = JSON.parse(fs.readFileSync(resPath, "utf-8")) as Record<string, unknown>;
      try { fs.unlinkSync(resPath); } catch { /* ignore */ }
      try { fs.unlinkSync(reqPath); } catch { /* ignore */ }
      return toolOutput(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return toolOutput({ error: message });
    }
  }
  try { fs.unlinkSync(reqPath); } catch { /* ignore */ }
  return toolOutput({
    error: "Literature bridge timed out. Restart prismnext and try a new chat tab.",
  });
}

export default tool({
  description:
    "Manage this chat session's intensive-reading list (required before literature-read-pdf). " +
    "action=add|remove|list by library bibkey. Prefer add yourself when PDF body is needed — " +
    "do not ask the user to @-toggle Intensive reading unless they refuse.",
  args: {
    action: tool.schema
      .string()
      .describe("add | remove | list")
      .optional(),
    bibkey: tool.schema
      .string()
      .describe("Exact cite key / bibkey from the Literature library (required for add/remove)")
      .optional(),
  },
  async execute(args, context) {
    const actionRaw = typeof args.action === "string" ? args.action.trim().toLowerCase() : "add";
    const action =
      actionRaw === "remove" || actionRaw === "list" || actionRaw === "add"
        ? actionRaw
        : "add";
    const bibkey = typeof args.bibkey === "string" ? args.bibkey.trim() : "";
    if ((action === "add" || action === "remove") && !bibkey) {
      return toolOutput({ error: "Missing bibkey parameter for add/remove." });
    }
    return bridgeCall(context as Record<string, unknown>, {
      action: "intensive-reading",
      intensiveAction: action,
      bibkey: bibkey || undefined,
    });
  },
});
