/**
 * interaction-write — Create or update an Interaction spec (upsert).
 */
import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";
import { interactionBridgeRoot } from "./bridge-paths";
import { SCENE_IR_SAMPLE_MODEL } from "../../shared/interaction-scene-ir";

const BRIDGE_ROOT = interactionBridgeRoot();
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
  return `ix-write-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
    await delay(50);
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
  return toolOutput({ ok: false, error: "Interaction bridge timed out. Restart prismnext and try a new chat tab." });
}

export default tool({
  description:
    "Create or update an Interactive Research Artifact at `.prismnext/artifacts/<id>/spec.json`. " +
    "Kinds: plot.*, math.surface/field, figure.static, scene.ir (declarative 3D), scene.program (legacy builtin only). " +
    "For 3D manifolds / Riemann metrics / tangent probes: use kind scene.ir with spec.model (runtimeVersion 1, parametric x/y/z, probe, metric, layers). " +
    "Canvas framing defaults to mathematical origin — model.view.frame \"origin\" (default) keeps (0,0,0); use \"bbox\" only to center on the mesh AABB. orbitTarget \"origin\"|\"probe\". " +
    "Do NOT pass sceneSource — arbitrary scene.js is rejected. Host renders surface, wireframe, tangents, metric status, bindings. Sample scene.ir model:\n" +
    JSON.stringify(SCENE_IR_SAMPLE_MODEL, null, 2) +
    "\nSimple heightfields only: math.surface with model.z. " +
    "For figure.static: resources[] is **required** — point at PNG/SVG/HTML (artifact-relative filename OK, e.g. curvature_heatmap.png under .prismnext/artifacts/<id>/); write is rejected if the file is missing. " +
    "Agent-generated (Python): `uv venv .prismnext/artifacts/.venv && uv pip install --python .prismnext/artifacts/.venv/bin/python matplotlib plotly numpy`, save PNG/HTML there, then write with resources: [{ role: \"figure\", path: \"<file>.png\" }]. " +
    "HTML must be fully self-contained — the preview iframe blocks all network access: Plotly `fig.write_html(path, include_plotlyjs=True, full_html=True)`, never `include_plotlyjs=\"cdn\"`; no external `<script src=\"http...\">` / fonts / images. " +
    "For bound plots/figures, set resources[] to project-relative paths — e.g. an existing experiment-run output at `experiment/<id>/results/loss.png` or `experiment/<id>/results/metrics.csv`. Bound resources are read at their real path (not copied), so don't re-render or re-plot something a run already produced. " +
    "After success, embed fenceMarkdown in your assistant reply.",
  args: {
    spec: tool.schema
      .string()
      .describe(
        "InteractionSpec JSON. For paraboloid + metric use kind scene.ir with bindings + model (see tool description sample).",
      ),
    sceneSource: tool.schema
      .string()
      .optional()
      .describe("Deprecated — rejected. Use scene.ir with spec.model instead."),
  },
  async execute(args, context) {
    const raw = typeof args.spec === "string" ? args.spec.trim() : "";
    if (!raw) return toolOutput({ ok: false, error: "Missing spec parameter (JSON string)." });
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return toolOutput({ ok: false, error: "spec is not valid JSON." });
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return toolOutput({ ok: false, error: "spec must be a JSON object." });
    }
    const sceneSource =
      typeof args.sceneSource === "string" ? args.sceneSource : undefined;
    return bridgeCall(context as Record<string, unknown>, {
      action: "write",
      spec: parsed,
      ...(sceneSource != null ? { sceneSource } : {}),
    });
  },
});
