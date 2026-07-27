/**
 * Offscreen render + thumbnail (V4-B) — after a successful `figure.plotly`/
 * `instrument` write, render the real figure once in a hidden window and
 * capture a PNG. This doubles as the render self-check for file-backed
 * figures (previously only existence-checked, never actually parsed) and
 * feeds the Chat fence card's thumbnail image.
 *
 * See docs-private/superpowers/specs/2026-07-27-interaction-plotly-runtime-design.md
 * §10 (D25–D28) for the full design rationale.
 */
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { app, BrowserWindow } from "electron";
import {
  isInteractionInstrumentKind,
  parseInstrumentModel,
  resolveInstrumentFigure,
} from "../../shared/interaction-instrument";
import { initialBindingValues, parseMathBindings } from "../../shared/interaction-math";
import { normalizeFigureResourceProjectPath } from "../../shared/interaction-figure";
import {
  PLOTLY_MAX_JSON_BYTES,
  isInteractionPlotlyKind,
  resolvePlotlyFigureSource,
  validatePlotlyFigure,
  type PlotlyFigure,
} from "../../shared/interaction-plotly";
import {
  buildScriptSandboxHtml,
  classifyResourceEmbedKind,
  isInteractionScriptKind,
  validateScriptSpec,
  type ScriptResourceEmbed,
} from "../../shared/interaction-script";
import {
  isInteractionDiagramKind,
  resolveDiagramSource,
} from "../../shared/interaction-diagram";
import type { InteractionSpec } from "../../shared/interaction-spec";
import { broadcastInteractionChanged } from "./interaction-ui-events";
import {
  clearInteractionLastError,
  writeInteractionLastError,
  writeInteractionThumbnail,
} from "./interaction-store";

export const THUMBNAIL_WIDTH = 480;
export const THUMBNAIL_HEIGHT = 360;

export type ThumbnailFigureResult = { ok: true; figure: PlotlyFigure } | { ok: false; error: string };

function resolveProjectAbsPath(projectRoot: string, relPath: string): string {
  const p = relPath.replace(/\\/g, "/").replace(/^\.\//, "");
  if (p.startsWith("/") || /^[A-Za-z]:[/\\]/.test(p)) return p;
  return join(projectRoot, p);
}

function resolvePlotlyFileFigure(projectRoot: string, path: string): ThumbnailFigureResult {
  const abs = resolveProjectAbsPath(projectRoot, path);
  let text: string;
  try {
    text = readFileSync(abs, "utf8");
  } catch {
    return { ok: false, error: `could not read figure resource "${path}"` };
  }
  if (text.length > PLOTLY_MAX_JSON_BYTES) {
    return { ok: false, error: `figure json too large (> ${PLOTLY_MAX_JSON_BYTES} bytes): ${path}` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: `invalid JSON in figure resource "${path}"` };
  }
  const validated = validatePlotlyFigure(parsed);
  if (!validated.ok) return { ok: false, error: `${path}: ${validated.error}` };
  return { ok: true, figure: validated.figure };
}

/**
 * Resolve the actual Plotly figure a `figure.plotly`/`instrument` spec would
 * render, for offscreen capture. Pure (no Electron) — reads file-mode figure
 * resources synchronously since this always runs in the main process.
 */
export function resolveFigureForThumbnail(
  projectRoot: string,
  spec: InteractionSpec,
): ThumbnailFigureResult {
  if (isInteractionPlotlyKind(spec.kind)) {
    const src = resolvePlotlyFigureSource(spec);
    if (!src.ok) return { ok: false, error: src.error };
    if (src.mode === "inline") return { ok: true, figure: src.figure };
    return resolvePlotlyFileFigure(projectRoot, src.path);
  }
  if (isInteractionInstrumentKind(spec.kind)) {
    const model = parseInstrumentModel(spec.model);
    if (!model) return { ok: false, error: "invalid instrument model" };
    const bindingValues = initialBindingValues(parseMathBindings(spec.bindings));
    const resolved = resolveInstrumentFigure(model, bindingValues, 0);
    if (!resolved.ok) return { ok: false, error: resolved.error };
    return { ok: true, figure: resolved.figure };
  }
  return { ok: false, error: `unsupported kind "${spec.kind}" for thumbnail capture` };
}

const DEFAULT_RENDER_TIMEOUT_MS = 8000;

let cachedPlotlyJs: string | null = null;

/** Read once, cache in memory — the minified bundle is ~3.5MB of text. */
function loadPlotlyBundleText(): string {
  if (cachedPlotlyJs == null) {
    // Kept out of `electron.vite.config.ts`'s main bundle (rollupOptions.external)
    // — we want the raw file on disk, not inlined/rebundled.
    cachedPlotlyJs = readFileSync(require.resolve("plotly.js-dist-min"), "utf8");
  }
  return cachedPlotlyJs;
}

let cachedThreeModuleJs: string | null = null;

/**
 * `three`'s package.json `exports` map only exposes the root ESM entry
 * (`.` -> `build/three.module.js`) and a short allow-list of subpaths — it
 * does *not* expose a deep `build/three.module.min.js` specifier, so
 * `require.resolve("three/build/...")` fails the same way Vite's `?raw`
 * resolver does (both honor Node's exports encapsulation). Resolve the
 * package's real `build/` directory via the CJS entry instead, then read
 * the (non-minified) ESM sibling file directly off disk.
 */
function loadThreeModuleBundleText(): string {
  if (cachedThreeModuleJs == null) {
    const cjsEntry = require.resolve("three");
    cachedThreeModuleJs = readFileSync(join(dirname(cjsEntry), "three.module.js"), "utf8");
  }
  return cachedThreeModuleJs;
}

let cachedMermaidJs: string | null = null;

/** Read once, cache in memory — the UMD bundle is ~3.5MB of text. */
function loadMermaidBundleText(): string {
  if (cachedMermaidJs == null) {
    // Kept out of rollupOptions.external the same way as plotly/three — we
    // want the raw file on disk, not inlined/rebundled.
    cachedMermaidJs = readFileSync(require.resolve("mermaid/dist/mermaid.min.js"), "utf8");
  }
  return cachedMermaidJs;
}

let cachedGraphvizJs: string | null = null;

/**
 * `@hpcc-js/wasm/graphviz`'s `require` condition resolves to `dist/graphviz.cjs`
 * (not a self-contained UMD bundle with the WASM inlined as base64) — the
 * actual self-contained file is `dist/graphviz.umd.js`, a sibling not
 * directly exposed by the package's exports map. Same trick as
 * `loadThreeModuleBundleText`: resolve any exported entry to find the
 * package's real `dist/` directory, then read the sibling file off disk.
 */
function loadGraphvizBundleText(): string {
  if (cachedGraphvizJs == null) {
    const anchor = require.resolve("@hpcc-js/wasm/graphviz");
    cachedGraphvizJs = readFileSync(join(dirname(anchor), "graphviz.umd.js"), "utf8");
  }
  return cachedGraphvizJs;
}

/**
 * Resolve a `diagram.mermaid` spec into a fully self-contained HTML document
 * for offscreen capture. Unlike write-time `validateDiagramSpec` (existence
 * check only), this reads the real file content for file-mode sources.
 * No CSP is needed here (unlike figure.script's sandbox HTML) — this is
 * trusted-library rendering of declarative text, not Agent code execution,
 * same posture as figure.plotly's offscreen HTML.
 */
export function resolveDiagramForThumbnail(
  projectRoot: string,
  spec: InteractionSpec,
): { ok: true; html: string } | { ok: false; error: string } {
  const src = resolveDiagramSource(spec);
  if (!src.ok) return { ok: false, error: src.error };

  let sourceText: string;
  if (src.mode === "inline") {
    sourceText = src.source;
  } else {
    const abs = resolveProjectAbsPath(projectRoot, src.path);
    try {
      sourceText = readFileSync(abs, "utf8");
    } catch {
      return { ok: false, error: `could not read diagram resource "${src.path}"` };
    }
  }

  if (src.engine === "dot") {
    const html = `<!doctype html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#fff;">
<div id="dgm" style="width:${THUMBNAIL_WIDTH}px;height:${THUMBNAIL_HEIGHT}px;overflow:hidden;"></div>
<script>${loadGraphvizBundleText()}</script>
<script>
window.__prismThumb = { ready: false, error: null };
(async function () {
  try {
    var mod = window["@hpcc-js/wasm/graphviz"];
    var graphviz = await mod.Graphviz.load();
    var svg = graphviz.dot(${embedJson(sourceText)});
    svg = svg
      .replace(/<script[\\s\\S]*?<\\/script>/gi, "")
      .replace(/\\s+on[a-z]+\\s*=\\s*"(?:[^"\\\\]|\\\\.)*"/gi, "")
      .replace(/\\s+on[a-z]+\\s*=\\s*'(?:[^'\\\\]|\\\\.)*'/gi, "")
      .replace(/(href|xlink:href)\\s*=\\s*"javascript:[^"]*"/gi, '$1="#"')
      .replace(/(href|xlink:href)\\s*=\\s*'javascript:[^']*'/gi, "$1='#'");
    document.getElementById("dgm").innerHTML = svg;
    window.__prismThumb.ready = true;
  } catch (e) {
    window.__prismThumb.error = String((e && e.message) || e);
  }
})();
</script>
</body>
</html>`;
    return { ok: true, html };
  }

  const html = `<!doctype html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#fff;">
<div id="dgm" style="width:${THUMBNAIL_WIDTH}px;height:${THUMBNAIL_HEIGHT}px;overflow:hidden;"></div>
<script>${loadMermaidBundleText()}</script>
<script>
window.__prismThumb = { ready: false, error: null };
(async function () {
  try {
    mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });
    var result = await mermaid.render("dgm-svg", ${embedJson(sourceText)});
    document.getElementById("dgm").innerHTML = result.svg;
    window.__prismThumb.ready = true;
  } catch (e) {
    window.__prismThumb.error = String((e && e.message) || e);
  }
})();
</script>
</body>
</html>`;
  return { ok: true, html };
}

function scriptResourceEmbedResourcePath(r: {
  role?: string;
  path?: string;
  artifactPath?: string;
}): string | null {
  const p = (r.path ?? r.artifactPath)?.trim();
  return p || null;
}

/**
 * Resolve a `figure.script` spec into the fully assembled sandbox HTML for
 * offscreen capture — reads the script + declared resources off disk
 * (main-process fs, mirroring resolveFigureForThumbnail's file-mode reads)
 * and, unlike write-time validateScriptSpec, actually embeds their content.
 * Theme is hardcoded light and bindings use their declared defaults —
 * thumbnails are small proof-of-render images, not theme-accurate previews.
 */
export function resolveScriptForThumbnail(
  projectRoot: string,
  spec: InteractionSpec,
): { ok: true; html: string } | { ok: false; error: string } {
  const validated = validateScriptSpec(projectRoot, spec);
  if (!validated.ok) return { ok: false, error: validated.error };

  const scriptAbs = join(projectRoot, validated.scriptPath);
  let scriptText: string;
  try {
    scriptText = readFileSync(scriptAbs, "utf8");
  } catch {
    return { ok: false, error: `could not read script resource: ${validated.scriptPath}` };
  }

  const resources: ScriptResourceEmbed[] = [];
  for (const r of spec.resources ?? []) {
    if (r.role === "script") continue;
    const rawPath = scriptResourceEmbedResourcePath(r);
    if (!rawPath) continue;
    const role = r.role ?? rawPath;
    const abs = join(projectRoot, normalizeFigureResourceProjectPath(spec, rawPath));
    const kind = classifyResourceEmbedKind(rawPath);
    try {
      if (kind === "image") {
        const bytes = readFileSync(abs);
        const ext = rawPath.split(".").pop()?.toLowerCase() ?? "png";
        const mime = ext === "svg" ? "image/svg+xml" : `image/${ext === "jpg" ? "jpeg" : ext}`;
        resources.push({ role, dataUrl: `data:${mime};base64,${bytes.toString("base64")}` });
        continue;
      }
      const text = readFileSync(abs, "utf8");
      if (kind === "json") {
        try {
          resources.push({ role, json: JSON.parse(text), text });
          continue;
        } catch {
          // fall through to text-only
        }
      }
      resources.push({ role, text });
    } catch {
      return { ok: false, error: `resource not found on disk: ${rawPath}` };
    }
  }

  const html = buildScriptSandboxHtml({
    plotlyJs: loadPlotlyBundleText(),
    threeModuleJs: validated.threeEnabled ? loadThreeModuleBundleText() : undefined,
    scriptText,
    resources,
    bindings: initialBindingValues(parseMathBindings(spec.bindings)),
    size: { width: THUMBNAIL_WIDTH, height: THUMBNAIL_HEIGHT },
    theme: { isDark: false },
  });
  return { ok: true, html };
}

/** Escape `</script>` breakout when embedding JSON inside an inline <script>. */
function embedJson(value: unknown): string {
  return JSON.stringify(value ?? null).replace(/</g, "\\u003c");
}

function buildThumbnailHtml(figure: PlotlyFigure, plotlyJs: string): string {
  const layout = { ...(figure.layout ?? {}), width: THUMBNAIL_WIDTH, height: THUMBNAIL_HEIGHT };
  return `<!doctype html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;">
<div id="gd" style="width:${THUMBNAIL_WIDTH}px;height:${THUMBNAIL_HEIGHT}px;"></div>
<script>${plotlyJs}</script>
<script>
window.__prismThumb = { ready: false, error: null };
try {
  Plotly.newPlot("gd", ${embedJson(figure.data)}, ${embedJson(layout)}, {
    responsive: false,
    staticPlot: true,
    displayModeBar: false,
  }).then(function () {
    window.__prismThumb.ready = true;
  }).catch(function (e) {
    window.__prismThumb.error = String((e && e.message) || e);
  });
} catch (e) {
  window.__prismThumb.error = String((e && e.message) || e);
}
</script>
</body>
</html>`;
}

const POLL_THUMB_SCRIPT = `
(function () {
  return new Promise(function (resolve) {
    (function check() {
      var t = window.__prismThumb;
      if (t && (t.ready || t.error)) resolve(t);
      else setTimeout(check, 50);
    })();
  });
})()`;

function delayResult(ms: number, value: { error: string }): Promise<{ error: string }> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

export type RenderFigureResult = { ok: true; png: Buffer } | { ok: false; error: string };

/**
 * Core hidden-window lifecycle: write a prepared HTML document to a temp
 * file, load it in an off-screen `BrowserWindow`, poll `window.__prismThumb`
 * (both `buildThumbnailHtml` and `buildScriptSandboxHtml` set this global on
 * completion — see D28/D34), capture a screenshot, and always clean up the
 * window + temp file. Per D26, the window is `show:true` but positioned
 * off-screen — `show:false` windows can end up with no GPU/WebGL context on
 * some platforms, silently producing blank frames for 3D content.
 */
async function renderPreparedHtmlToPngBuffer(
  html: string,
  opts?: { timeoutMs?: number },
): Promise<RenderFigureResult> {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_RENDER_TIMEOUT_MS;
  const tmpPath = join(
    app.getPath("temp"),
    `prism-interaction-thumb-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.html`,
  );
  writeFileSync(tmpPath, html, "utf8");

  let win: BrowserWindow | null = null;
  try {
    win = new BrowserWindow({
      width: THUMBNAIL_WIDTH,
      height: THUMBNAIL_HEIGHT,
      show: true,
      x: -10000,
      y: -10000,
      skipTaskbar: true,
      focusable: false,
      frame: false,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    });
    await win.loadFile(tmpPath);
    const result = (await Promise.race([
      win.webContents.executeJavaScript(POLL_THUMB_SCRIPT),
      delayResult(timeoutMs, { error: `thumbnail render timed out after ${timeoutMs}ms` }),
    ])) as { ready?: boolean; error?: string | null };
    if (result?.error) return { ok: false, error: String(result.error) };

    const image = await win.webContents.capturePage();
    return { ok: true, png: image.toPNG() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "offscreen render failed" };
  } finally {
    try {
      win?.destroy();
    } catch {
      /* ignore */
    }
    try {
      unlinkSync(tmpPath);
    } catch {
      /* ignore cleanup failure */
    }
  }
}

/** Render a Plotly figure once in a hidden window and capture a screenshot. */
export async function renderFigureToPngBuffer(
  figure: PlotlyFigure,
  opts?: { timeoutMs?: number },
): Promise<RenderFigureResult> {
  return renderPreparedHtmlToPngBuffer(buildThumbnailHtml(figure, loadPlotlyBundleText()), opts);
}

/** Resolve the figure/script, render it offscreen, and persist the PNG. No side effects on failure. */
export async function captureInteractionThumbnail(
  projectRoot: string,
  spec: InteractionSpec,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let rendered: RenderFigureResult;
  if (isInteractionScriptKind(spec.kind)) {
    const resolved = resolveScriptForThumbnail(projectRoot, spec);
    if (!resolved.ok) return { ok: false, error: resolved.error };
    rendered = await renderPreparedHtmlToPngBuffer(resolved.html);
  } else if (isInteractionDiagramKind(spec.kind)) {
    const resolved = resolveDiagramForThumbnail(projectRoot, spec);
    if (!resolved.ok) return { ok: false, error: resolved.error };
    rendered = await renderPreparedHtmlToPngBuffer(resolved.html);
  } else {
    const resolved = resolveFigureForThumbnail(projectRoot, spec);
    if (!resolved.ok) return { ok: false, error: resolved.error };
    rendered = await renderFigureToPngBuffer(resolved.figure);
  }
  if (!rendered.ok) return { ok: false, error: rendered.error };

  const written = writeInteractionThumbnail(projectRoot, spec.id, rendered.png);
  if (!written.ok) return { ok: false, error: written.error ?? "failed to write thumbnail" };
  return { ok: true };
}

type ScheduleState = { promise: Promise<void>; pending: InteractionSpec | null };
const scheduleState = new Map<string, ScheduleState>();

async function runThumbnailCycle(projectRoot: string, spec: InteractionSpec): Promise<void> {
  const result = await captureInteractionThumbnail(projectRoot, spec).catch(
    (e): { ok: false; error: string } => ({
      ok: false,
      error: e instanceof Error ? e.message : "thumbnail capture threw",
    }),
  );
  if (result.ok) {
    clearInteractionLastError(projectRoot, spec.id);
  } else {
    writeInteractionLastError(projectRoot, spec.id, { message: result.error, phase: "thumbnail" });
  }
  broadcastInteractionChanged({
    projectRoot,
    id: spec.id,
    title: spec.title,
    reason: "thumbnail",
  });
}

/**
 * Fire-and-forget scheduler with single-flight semantics: if a capture is
 * already running for this id, the latest spec replaces any queued one and
 * is captured once the current run finishes — never two overlapping hidden
 * windows for the same artifact (D28). Returns a Promise so tests can await
 * full settlement; production callers may ignore it.
 */
export function scheduleInteractionThumbnail(
  projectRoot: string,
  spec: InteractionSpec,
): Promise<void> {
  const key = `${projectRoot}::${spec.id}`;
  const existing = scheduleState.get(key);
  if (existing) {
    existing.pending = spec;
    return existing.promise;
  }

  const state: ScheduleState = { promise: Promise.resolve(), pending: null };
  state.promise = (async () => {
    let current = spec;
    for (;;) {
      await runThumbnailCycle(projectRoot, current);
      const next = state.pending;
      state.pending = null;
      if (!next) break;
      current = next;
    }
    scheduleState.delete(key);
  })();
  scheduleState.set(key, state);
  return state.promise;
}
