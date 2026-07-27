/**
 * figure.script — T3 escape hatch (V5). Agent writes a real JS module
 * (`resources: [{ role: "script", path: "script.js" }]`), executed inside a
 * genuinely isolated sandboxed iframe (reusing figure.static's Blob+CSP
 * infrastructure), not the host's own JS realm. This is the last-resort kind
 * — prefer figure.plotly/instrument for anything they can express.
 *
 * See docs-private/superpowers/specs/2026-07-27-interaction-plotly-runtime-design.md
 * §11 (D29–D35) for the full design rationale.
 */
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { injectFigureHtmlCsp, normalizeFigureResourceProjectPath } from "./interaction-figure";
import type { InteractionResource, InteractionSpec } from "./interaction-spec";

export const INTERACTION_SCRIPT_KIND = "figure.script" as const;

/** Script source cap — this is code, not data. */
export const SCRIPT_MAX_BYTES = 256 * 1024;
/** Combined cap on every other declared resource (ctx.resource() data/images). */
export const SCRIPT_RESOURCES_MAX_BYTES = 8 * 1024 * 1024;

export function isInteractionScriptKind(kind: string): boolean {
  return kind.trim() === INTERACTION_SCRIPT_KIND;
}

function resourcePath(r: InteractionResource): string | null {
  const p = (r.path ?? r.artifactPath)?.trim();
  return p || null;
}

export function scriptResourcePath(resources?: InteractionResource[]): string | null {
  if (!resources?.length) return null;
  const found = resources.find((r) => r.role === "script" && resourcePath(r));
  return found ? resourcePath(found) : null;
}

/** Mirrors the retired interaction-scene-contract.ts's comment stripper. */
export function stripScriptComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
}

type BanRule = { id: string; re: RegExp; message: string };

const HARD_BAN_RULES: BanRule[] = [
  {
    id: "import",
    re: /\bimport\b/,
    message:
      "cannot use import — Plotly/THREE are already available as ctx.Plotly / ctx.three.THREE.",
  },
  { id: "require", re: /\brequire\s*\(/, message: "cannot use require()." },
  { id: "eval", re: /\beval\s*\(/, message: "cannot use eval()." },
  { id: "new-function", re: /\bnew\s+Function\s*\(/, message: "cannot use new Function()." },
  { id: "cookie", re: /\bdocument\.cookie\b/, message: "cannot access document.cookie." },
  {
    id: "window-parent",
    re: /\bwindow\.(parent|top)\b/,
    message: "cannot access window.parent/window.top.",
  },
  {
    id: "fetch",
    re: /\bfetch\s*\(/,
    message:
      "cannot use fetch() — network access is blocked; declare needed data via resources[] and read it with ctx.resource(role).",
  },
  { id: "xhr", re: /\bXMLHttpRequest\b/, message: "cannot use XMLHttpRequest." },
  { id: "websocket", re: /\bWebSocket\b/, message: "cannot use WebSocket." },
  { id: "localstorage", re: /\blocalStorage\b/, message: "cannot use localStorage." },
  { id: "indexeddb", re: /\bindexedDB\b/, message: "cannot use indexedDB." },
];

/** Throws Error on the first hard-ban hit (comments stripped first). */
export function assertScriptHardBans(source: string): void {
  const stripped = stripScriptComments(source);
  for (const rule of HARD_BAN_RULES) {
    if (rule.re.test(stripped)) {
      throw new Error(`figure.script: ${rule.message}`);
    }
  }
}

const RENDER_EXPORT_RE =
  /\bexport\s+(?:async\s+)?function\s+render\b|\bexport\s+(?:const|let|var)\s+render\s*=/;

/** No mount/setup/main alias fallback — `render` only. */
export function hasRenderExport(source: string): boolean {
  return RENDER_EXPORT_RE.test(source);
}

export type ScriptValidationResult =
  | { ok: true; scriptPath: string; threeEnabled: boolean }
  | { ok: false; error: string };

/**
 * Reads resources[role="script"] off disk (<=SCRIPT_MAX_BYTES), runs the
 * static ban-scan, requires an exported `render`, and sums declared resource
 * file sizes against SCRIPT_RESOURCES_MAX_BYTES (stat only — content is read
 * later, per render path in the panel view / offscreen thumbnail capture).
 */
export function validateScriptSpec(
  projectRoot: string,
  spec: InteractionSpec,
): ScriptValidationResult {
  if (!isInteractionScriptKind(spec.kind)) {
    return { ok: false, error: `unsupported kind "${spec.kind}"` };
  }

  const rawPath = scriptResourcePath(spec.resources);
  if (!rawPath) {
    return {
      ok: false,
      error:
        'figure.script requires resources[] with a script path (e.g. resources: [{ role: "script", path: "script.js" }] after saving the file under .prismnext/artifacts/<id>/)',
    };
  }

  const relPath = normalizeFigureResourceProjectPath(spec, rawPath);
  const abs = join(projectRoot, relPath);
  let stat: ReturnType<typeof statSync>;
  try {
    stat = statSync(abs);
  } catch {
    return { ok: false, error: `script resource not found on disk: ${relPath}` };
  }
  if (!stat.isFile()) {
    return { ok: false, error: `script resource is not a file: ${relPath}` };
  }
  if (stat.size > SCRIPT_MAX_BYTES) {
    return {
      ok: false,
      error: `figure.script script.js too large (${stat.size} > ${SCRIPT_MAX_BYTES} bytes limit): ${relPath}`,
    };
  }

  let text: string;
  try {
    text = readFileSync(abs, "utf8");
  } catch {
    return { ok: false, error: `could not read script resource: ${relPath}` };
  }

  try {
    assertScriptHardBans(text);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "script contains a banned construct" };
  }

  if (!hasRenderExport(stripScriptComments(text))) {
    return {
      ok: false,
      error: "figure.script must export function render(ctx) { ... } — no mount/setup/main alias is accepted.",
    };
  }

  let othersBytes = 0;
  for (const r of spec.resources ?? []) {
    if (r.role === "script") continue;
    const p = resourcePath(r);
    if (!p) continue;
    const otherAbs = join(projectRoot, normalizeFigureResourceProjectPath(spec, p));
    try {
      othersBytes += statSync(otherAbs).size;
    } catch {
      return { ok: false, error: `resource not found on disk: ${p}` };
    }
  }
  if (othersBytes > SCRIPT_RESOURCES_MAX_BYTES) {
    return {
      ok: false,
      error: `figure.script resources too large combined (${othersBytes} > ${SCRIPT_RESOURCES_MAX_BYTES} bytes limit)`,
    };
  }

  const threeEnabled = spec.model?.three === true;
  return { ok: true, scriptPath: relPath, threeEnabled };
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp)$/i;
const JSON_EXT = /\.json$/i;

export function classifyResourceEmbedKind(path: string): "image" | "json" | "text" {
  if (IMAGE_EXT.test(path)) return "image";
  if (JSON_EXT.test(path)) return "json";
  return "text";
}

export type ScriptResourceEmbed = {
  role: string;
  text?: string;
  json?: unknown;
  dataUrl?: string;
};

export type ScriptSandboxInput = {
  plotlyJs: string;
  /** Raw text of three/build/three.module.min.js — only when threeEnabled. */
  threeModuleJs?: string;
  /** Agent's script.js source, as written. */
  scriptText: string;
  resources: ScriptResourceEmbed[];
  /** Initial snapshot only — see D31, no live updates. */
  bindings: Record<string, number>;
  size: { width: number; height: number };
  theme: { isDark: boolean };
};

/** Escape `</script>` breakout when embedding text/JSON inside inline <script>. */
function embedJson(value: unknown): string {
  return JSON.stringify(value ?? null).replace(/</g, "\\u003c");
}

const CTX_ALLOWED_KEYS = ["el", "Plotly", "three", "resource", "bindings", "size", "theme", "setStatus"];

const GUARD_CTX_FN_JS = `function guardCtx(ctx) {
  var allowed = new Set(${JSON.stringify(CTX_ALLOWED_KEYS)});
  return new Proxy(ctx, {
    get: function (target, prop, receiver) {
      if (typeof prop === "symbol") return Reflect.get(target, prop, receiver);
      if (!allowed.has(prop)) throw new Error("figure.script: ctx has no property \\"" + prop + "\\"");
      return Reflect.get(target, prop, receiver);
    },
    set: function () { throw new Error("figure.script: ctx is read-only"); },
    has: function (_t, prop) { return typeof prop === "string" && allowed.has(prop); },
    ownKeys: function () { return Array.from(allowed); },
    getOwnPropertyDescriptor: function (target, prop) {
      if (typeof prop === "string" && allowed.has(prop)) {
        return { configurable: true, enumerable: true, get: function () { return Reflect.get(target, prop); } };
      }
      return undefined;
    },
  });
}`;

/**
 * Builds the full standalone HTML document string — identical output whether
 * it ends up in a renderer <iframe> (Blob URL) or a main-process hidden
 * BrowserWindow.loadFile. Sets `window.__prismScript = {ready, error}` AND
 * posts `window.parent.postMessage({type:"prism-script-ready"|"prism-script-error"|"prism-script-status", ...})`
 * — the offscreen capture polls the former (same convention as V4-B's
 * `window.__prismThumb`), the panel iframe listens for the latter.
 */
export function buildScriptSandboxHtml(input: ScriptSandboxInput): string {
  const resourcesEmbed = embedJson(input.resources);
  const bindingsEmbed = embedJson(input.bindings);
  const sizeEmbed = embedJson(input.size);
  const themeEmbed = embedJson(input.theme);
  const scriptTextEmbed = embedJson(input.scriptText);
  const threeTextEmbed = input.threeModuleJs != null ? embedJson(input.threeModuleJs) : null;

  const threeBootstrap =
    threeTextEmbed != null
      ? `
    var threeBlobUrl = URL.createObjectURL(new Blob([${threeTextEmbed}], { type: "text/javascript" }));
    THREE = await import(threeBlobUrl);
    URL.revokeObjectURL(threeBlobUrl);`
      : "";

  const bootstrap = `(async () => {
  function report(ok, message) {
    window.__prismScript = { ready: !!ok, error: message || null };
    try {
      window.parent.postMessage({ type: ok ? "prism-script-ready" : "prism-script-error", message: message || null }, "*");
    } catch (e) { /* ignore */ }
  }
  window.__prismScript = { ready: false, error: null };
  ${GUARD_CTX_FN_JS}
  try {
    var THREE = undefined;${threeBootstrap}
    var resources = ${resourcesEmbed};
    var resourceMap = {};
    for (var i = 0; i < resources.length; i++) { resourceMap[resources[i].role] = resources[i]; }
    var ctx = guardCtx({
      el: document.getElementById("root"),
      Plotly: window.Plotly,
      three: ${threeTextEmbed != null ? "{ THREE: THREE }" : "undefined"},
      resource: function (role) { return resourceMap[role] || null; },
      bindings: ${bindingsEmbed},
      size: ${sizeEmbed},
      theme: ${themeEmbed},
      setStatus: function (msg) {
        try { window.parent.postMessage({ type: "prism-script-status", message: String(msg) }, "*"); } catch (e) { /* ignore */ }
      },
    });
    var scriptBlobUrl = URL.createObjectURL(new Blob([${scriptTextEmbed}], { type: "text/javascript" }));
    var mod = await import(scriptBlobUrl);
    URL.revokeObjectURL(scriptBlobUrl);
    if (typeof mod.render !== "function") {
      throw new Error("figure.script must export function render(ctx)");
    }
    await mod.render(ctx);
    if (typeof mod.dispose === "function") {
      window.addEventListener("unload", function () {
        try { mod.dispose(ctx); } catch (e) { /* ignore */ }
      });
    }
    report(true, null);
  } catch (e) {
    report(false, String((e && e.message) || e));
  }
})();`;

  const html = `<!doctype html>
<html>
<head><meta charset="utf-8">
<style>html,body,#root{margin:0;padding:0;width:100%;height:100%;}</style>
</head>
<body>
<div id="root"></div>
<script>${input.plotlyJs}</script>
<script type="module">${bootstrap}</script>
</body>
</html>`;

  return injectFigureHtmlCsp(html);
}

/** Minimal legal figure.script spec + matching script.js — copyable hint on
 *  validation failure, and used in the interaction-write tool description. */
export const SCRIPT_SAMPLE_SPEC: Record<string, unknown> = {
  id: "demo.script.sample",
  title: "Custom scatter (figure.script sample)",
  kind: INTERACTION_SCRIPT_KIND,
  compute: "local",
  revision: 1,
  resources: [{ role: "script", path: "script.js" }],
};

export const SCRIPT_SAMPLE_JS = `export function render(ctx) {
  const trace = {
    type: "scatter",
    mode: "markers",
    x: [1, 2, 3, 4],
    y: [1, 4, 9, 16],
    marker: { size: 10 },
  };
  return ctx.Plotly.newPlot(ctx.el, [trace], { margin: { l: 40, r: 10, t: 10, b: 30 } });
}
`;
