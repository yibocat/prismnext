/**
 * suggest-plan — Pause the turn and show "Enter Plan mode?" until the user
 * accepts, dismisses, or the 15s consent window times out (≡ dismiss).
 */
import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";
import { planSuggestBridgeRoot } from "./bridge-paths";

const BRIDGE_ROOT = planSuggestBridgeRoot();
/** UI window 15s + bridge slack */
const TIMEOUT_MS = 20_000;
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
  return `plan-suggest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default tool({
  description:
    "Suggest Enter Plan (15s consent; timeout ≡ Build). Research: call for multi-step/multi-phase work " +
    "including the design phase (hypotheses, factor matrix, protocol) — Plan is NOT execution-only. " +
    "Do not skip because the user said “think through”. On accepted: `instruction` / `draftPath`; chat ≠ plan.",
  args: {
    reason: tool.schema
      .string()
      .optional()
      .describe("Short reason shown on the suggest strip (one sentence)"),
  },
  async execute(args, context) {
    const sessionId = sessionIdFrom(context as Record<string, unknown>);
    const requestId = requestIdFrom(context as Record<string, unknown>);
    const reason = typeof args.reason === "string" ? args.reason : "";
    const dir = path.join(BRIDGE_ROOT, sessionId);
    fs.mkdirSync(dir, { recursive: true });
    const reqPath = path.join(dir, `${requestId}.request.json`);
    const resPath = path.join(dir, `${requestId}.result.json`);

    fs.writeFileSync(
      reqPath,
      JSON.stringify({ sessionId, reason }),
      "utf-8",
    );

    const abort = (context as { abort?: AbortSignal }).abort;
    const deadline = Date.now() + TIMEOUT_MS;
    while (!abort?.aborted && Date.now() < deadline) {
      await delay(100);
      if (!fs.existsSync(resPath)) continue;
      try {
        const result = JSON.parse(fs.readFileSync(resPath, "utf-8")) as Record<string, unknown>;
        try { fs.unlinkSync(resPath); } catch { /* ignore */ }
        try { fs.unlinkSync(reqPath); } catch { /* ignore */ }
        return toolOutput(result);
      } catch (err) {
        return toolOutput({ error: err instanceof Error ? err.message : String(err) });
      }
    }
    try { fs.unlinkSync(reqPath); } catch { /* ignore */ }
    return toolOutput({
      suggested: false,
      status: abort?.aborted ? "ignored" : "timed_out",
      error: abort?.aborted ? "aborted" : "Plan suggest timed out waiting for user.",
    });
  },
});
