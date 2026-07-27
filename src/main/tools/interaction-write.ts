/**
 * interaction-write — Create or update an Interaction spec (upsert).
 */
import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";
import { interactionBridgeRoot } from "./bridge-paths";
import { PLOTLY_SAMPLE_FIGURE } from "../../shared/interaction-plotly";
import { INSTRUMENT_SAMPLE_MODEL } from "../../shared/interaction-instrument";
import { SCRIPT_SAMPLE_JS, SCRIPT_SAMPLE_SPEC } from "../../shared/interaction-script";
import {
  DIAGRAM_MAX_FILE_BYTES,
  DIAGRAM_MAX_INLINE_BYTES,
  DIAGRAM_SAMPLE_DOT_SPEC,
  DIAGRAM_SAMPLE_MERMAID_SPEC,
} from "../../shared/interaction-diagram";

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
    "Kinds: plot.*, figure.plotly (scientific 2D/3D, default), instrument (live recompute / true step iteration), figure.static, figure.script (sandboxed JS, last resort), diagram.mermaid (structural/flow diagrams). " +
    "scene.ir / math.surface / math.field / scene.program are RETIRED — writes are rejected; existing on-disk artifacts of those kinds still open read-only with a migration hint. Use figure.plotly or instrument instead. " +
    "For scientific 2D/3D prefer kind figure.plotly: spec.model.figure = Plotly JSON { data, layout } (inline), " +
    "or resources: [{ role: \"figure-json\", path: \"figure.json\" }] for large/Python-generated figures. " +
    "Python: fig.write_json('.prismnext/artifacts/<id>/figure.json') — do NOT export PNG when an interactive figure is possible. " +
    "matplotlib -> plotly quick map: ax.plot/plt.plot -> {type:'scatter',mode:'lines'}; " +
    "ax.scatter -> {type:'scatter',mode:'markers'}; ax.bar -> {type:'bar'}; " +
    "ax.plot_surface -> {type:'surface'}; ax.contour/contourf -> {type:'contour'}; " +
    "ax.imshow/pcolormesh -> {type:'heatmap'}; ax.quiver (2D) -> scatter+annotations, or a 3D field -> {type:'cone'}/{type:'streamtube'}. " +
    "Keep colorbars via trace.colorbar, not a separate axis. " +
    "Step-through demos: include figure.frames plus layout.sliders / layout.updatemenus — each slider step advances one iteration and Play animates. " +
    "Sample figure:\n" +
    JSON.stringify(PLOTLY_SAMPLE_FIGURE, null, 2) +
    "\nFor LIVE recompute on binding change, or TRUE step-by-step iteration (Newton/EM/BFS-style demos), use kind instrument instead of figure.plotly: " +
    "spec.model.figureTemplate is Plotly JSON like figure.plotly, but leaf values may be evaluation markers resolved against spec.bindings (continuous sliders — min/max/step/default/label) before Plotly.react runs — no remount, no flicker. " +
    "Markers: {\"$grid\":\"u\"|\"v\"} -> sampled coordinate array (needs model.domain); {\"$exprGrid\":\"<expr>\"} -> 2D array sampled over domain (u,v,bindings in scope); " +
    "{\"$expr\":\"<expr>\"} -> scalar from bindings only (no u/v); {\"$state\":\"<name>\"}/{\"$stateTrail\":\"<name>\"} -> current/0..current step value(s) from model.step (needs model.step). " +
    "model.step = { init: {name: \"<expr over bindings>\"}, next: {name: \"<expr over bindings + prior state + step index var `step`>\"}, max: <int, hard ceiling 2000> } — true recurrence x_(n+1)=g(x_n), replayed from 0 every time (always reproducible). " +
    "Host renders Prev/Next/Reset/Play controls automatically when model.step is present — do not build your own. instrument is local-only (no bound compute yet). Sample instrument model:\n" +
    JSON.stringify(INSTRUMENT_SAMPLE_MODEL, null, 2) +
    "\nNo kind accepts a sceneSource/scene.js argument anymore — everything is spec.model. " +
    "For figure.static: resources[] is **required** — point at PNG/SVG/HTML (artifact-relative filename OK, e.g. curvature_heatmap.png under .prismnext/artifacts/<id>/); write is rejected if the file is missing. " +
    "Agent-generated (Python): `uv venv .prismnext/artifacts/.venv && uv pip install --python .prismnext/artifacts/.venv/bin/python matplotlib plotly numpy`, save PNG/HTML there, then write with resources: [{ role: \"figure\", path: \"<file>.png\" }]. " +
    "HTML must be fully self-contained — the preview iframe blocks all network access: Plotly `fig.write_html(path, include_plotlyjs=True, full_html=True)`, never `include_plotlyjs=\"cdn\"`; no external `<script src=\"http...\">` / fonts / images. " +
    "For bound plots/figures, set resources[] to project-relative paths — e.g. an existing experiment-run output at `experiment/<id>/results/loss.png` or `experiment/<id>/results/metrics.csv`. Bound resources are read at their real path (not copied), so don't re-render or re-plot something a run already produced. " +
    "figure.script is the LAST RESORT — only when figure.plotly/instrument truly cannot express the visualization (e.g. a molecule structure, custom non-Plotly geometry). " +
    "Write a real JS file first (fs write tool), then reference it: resources: [{ role: \"script\", path: \"script.js\" }] — no sceneSource parameter. " +
    "The file MUST `export function render(ctx) { ... }` (async ok) — no other export name is accepted. " +
    "ctx keys (read-only, nothing else exists): el (mount DOM node), Plotly (already loaded), three ({THREE} only when spec.model.three === true — set it to opt in), " +
    "resource(role) -> {text?, json?, dataUrl?} for any other resources[] entry you declare (e.g. { role: \"data\", path: \"atoms.json\" }), " +
    "bindings (plain numbers from spec.bindings defaults), size ({width,height} of the mount area), theme ({isDark}), setStatus(msg) for a one-line progress note. " +
    "CRITICAL: bindings/size/theme are a ONE-TIME SNAPSHOT taken when the panel mounts — there is NO live re-render on binding change (dragging a slider does nothing here). If the user wants live parameter exploration, use instrument instead. " +
    "Banned in script.js (write is rejected if found): import, require(), eval(), new Function(), document.cookie, window.parent/window.top, fetch(), XMLHttpRequest, WebSocket, localStorage, indexedDB — network access is fully blocked; get all data via resources[]/ctx.resource(). " +
    "Caps: script.js <= 256KB, all other declared resources combined <= 8MB. Sample spec + script.js:\n" +
    JSON.stringify(SCRIPT_SAMPLE_SPEC, null, 2) +
    "\n" +
    SCRIPT_SAMPLE_JS +
    "\ndiagram.mermaid is for structural/flow diagrams (flowcharts, DAGs, proof trees, call graphs) — a plain-text contract, not JSON and not a code sandbox: do NOT put executable code or HTML expecting to be executed inside spec.model.source. " +
    'spec.model.engine selects the dialect: "mermaid" (default — richer diagram types: flowchart, sequence, class, state, etc.) or "dot" (Graphviz layout — good for large auto-laid-out graphs). ' +
    'Inline: spec.model.source = "<Mermaid or DOT text>" (<= ' + DIAGRAM_MAX_INLINE_BYTES + ' bytes). ' +
    'File (e.g. program-generated): resources: [{ role: "diagram-source", path: "<file>.mmd|.dot" }] (<= ' + DIAGRAM_MAX_FILE_BYTES + ' bytes); for bound compute point at an experiment-run output path, same convention as figure.static/figure.plotly file mode. ' +
    "No bindings/live updates — this is a static render (step-through network demos are a future kind, not this one). " +
    "Sample mermaid spec:\n" +
    JSON.stringify(DIAGRAM_SAMPLE_MERMAID_SPEC, null, 2) +
    "\nSample dot spec:\n" +
    JSON.stringify(DIAGRAM_SAMPLE_DOT_SPEC, null, 2) +
    "\nAfter success, embed fenceMarkdown in your assistant reply.",
  args: {
    spec: tool.schema
      .string()
      .describe(
        "InteractionSpec JSON. For scientific 2D/3D use kind figure.plotly with spec.model.figure (see tool description sample).",
      ),
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
    return bridgeCall(context as Record<string, unknown>, {
      action: "write",
      spec: parsed,
    });
  },
});
