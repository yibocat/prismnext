/**
 * image-describe — Describe an image file via the configured multimodal helper model.
 * Bridge-backed: the actual vision HTTP call runs in Electron main (vision-fallback).
 */
import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";
import { imageDescribeBridgeRoot } from "./bridge-paths";

const BRIDGE_ROOT = imageDescribeBridgeRoot();
const TIMEOUT_MS = 180_000;
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
  return `img-desc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function bridgeCall(
  context: Record<string, unknown>,
  payload: Record<string, unknown>,
): Promise<{ output: string }> {
  const sessionId = sessionIdFrom(context);
  const requestId = requestIdFrom(context);
  const directory = (context as { directory?: string }).directory;

  const dir = path.join(BRIDGE_ROOT, sessionId);
  fs.mkdirSync(dir, { recursive: true });
  const reqPath = path.join(dir, `${requestId}.request.json`);
  const resPath = path.join(dir, `${requestId}.result.json`);

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
    await delay(100);
    if (!fs.existsSync(resPath)) continue;
    try {
      const result = JSON.parse(fs.readFileSync(resPath, "utf-8")) as Record<string, unknown>;
      try { fs.unlinkSync(resPath); } catch {}
      try { fs.unlinkSync(reqPath); } catch {}
      return toolOutput(result);
    } catch (err) {
      return toolOutput({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
  try { fs.unlinkSync(reqPath); } catch {}
  return toolOutput({ ok: false, error: "Image describe timed out. Restart prismnext and try a new chat tab." });
}

export default tool({
  description:
    "Describe an image file with the user's configured multimodal helper model. " +
    "Use when you need to understand the contents of an image file (figure, chart, screenshot, diagram) " +
    "and you cannot view images directly. path may be absolute or project-relative and must stay inside " +
    "the project; png/jpg/jpeg/webp/gif up to 5 MB. Pass question to focus the description. " +
    "Returns the helper's text description — reason from it; the image itself is not shown to you.",
  args: {
    path: tool.schema
      .string()
      .describe("Image file path, absolute or relative to the project root (png/jpg/jpeg/webp/gif)"),
    question: tool.schema
      .string()
      .describe('Optional focus, e.g. "which curve converges fastest?" or "transcribe the dialog text"')
      .optional(),
  },
  async execute(args, context) {
    const imagePath = typeof args.path === "string" ? args.path.trim() : "";
    if (!imagePath) return toolOutput({ ok: false, error: "Missing path parameter." });
    try {
      return await bridgeCall(context as Record<string, unknown>, {
        action: "describe",
        imagePath,
        question: typeof args.question === "string" && args.question.trim() ? args.question.trim() : undefined,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return toolOutput({ ok: false, error: message });
    }
  },
});
