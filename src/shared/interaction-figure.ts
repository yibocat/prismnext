/**
 * Interaction figure.static / html resource helpers.
 */

import type { InteractionResource, InteractionSpec } from "./interaction-spec";

export const INTERACTION_FIGURE_KINDS = ["figure.static"] as const;

export type InteractionFigureKind = (typeof INTERACTION_FIGURE_KINDS)[number];

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp)$/i;
const HTML_EXT = /\.html?$/i;

/**
 * Hard cap on figure.static resource size. Agent-authored HTML (e.g. a full
 * Plotly export with inlined plotly.js) can legitimately reach a few MB, but
 * an unbounded read risks pathological files hanging the panel. Mirrors the
 * size-limit intent from the earlier S1 interactive-artifact sandbox design.
 */
export const FIGURE_MAX_BYTES = 15 * 1024 * 1024;

/**
 * CSP injected into agent-generated figure.static HTML before it is rendered
 * in the sandboxed iframe. The iframe already runs with
 * `sandbox="allow-scripts"` (no `allow-same-origin`), which blocks DOM/cookie
 * access to the host app, but does **not** by itself block outbound network
 * requests from script inside the frame. This CSP closes that gap: no
 * network egress, no nested frames/objects, only inline/blob/data resources
 * the generated document brings with it.
 */
const FIGURE_HTML_CSP =
  "default-src 'none'; " +
  "script-src 'unsafe-inline' 'unsafe-eval' blob: data:; " +
  "style-src 'unsafe-inline' blob: data:; " +
  "img-src data: blob:; " +
  "font-src data: blob:; " +
  "connect-src 'none'; " +
  "frame-src 'none'; " +
  "object-src 'none'; " +
  "base-uri 'none'; " +
  "form-action 'none';";

/** Injects the sandbox CSP as early as possible into an HTML document string. */
export function injectFigureHtmlCsp(html: string): string {
  const metaTag = `<meta http-equiv="Content-Security-Policy" content="${FIGURE_HTML_CSP}">`;
  const headMatch = html.match(/<head[^>]*>/i);
  if (headMatch) {
    const idx = html.indexOf(headMatch[0]) + headMatch[0].length;
    return html.slice(0, idx) + metaTag + html.slice(idx);
  }
  const htmlMatch = html.match(/<html[^>]*>/i);
  if (htmlMatch) {
    const idx = html.indexOf(htmlMatch[0]) + htmlMatch[0].length;
    return html.slice(0, idx) + `<head>${metaTag}</head>` + html.slice(idx);
  }
  return `${metaTag}${html}`;
}

export function isInteractionFigureKind(kind: string): boolean {
  return (INTERACTION_FIGURE_KINDS as readonly string[]).includes(kind.trim());
}

function resourcePath(r: InteractionResource): string | null {
  const p = (r.path ?? r.artifactPath)?.trim();
  return p || null;
}

/** Resolve figure/html resource path to a project-relative path. */
export function normalizeFigureResourceProjectPath(
  spec: InteractionSpec,
  rawPath: string,
): string {
  const p = rawPath.trim().replace(/\\/g, "/").replace(/^\.\//, "");
  if (!p || p.includes("..")) return p;
  if (
    p.startsWith(".prismnext/") ||
    p.startsWith("experiment/") ||
    p.startsWith("/") ||
    /^[A-Za-z]:[/\\]/.test(p)
  ) {
    return p;
  }
  return `.prismnext/artifacts/${spec.id}/${p}`;
}

export function pickFigureResourcePath(resources?: InteractionResource[]): string | null {
  if (!resources?.length) return null;
  const byRole = resources.find((r) => r.role === "figure" && resourcePath(r));
  if (byRole) return resourcePath(byRole);
  const byExt = resources.find((r) => {
    const p = resourcePath(r);
    return p && IMAGE_EXT.test(p);
  });
  return byExt ? resourcePath(byExt) : null;
}

export function pickHtmlResourcePath(resources?: InteractionResource[]): string | null {
  if (!resources?.length) return null;
  const byRole = resources.find((r) => r.role === "html" && resourcePath(r));
  if (byRole) return resourcePath(byRole);
  const byExt = resources.find((r) => {
    const p = resourcePath(r);
    return p && HTML_EXT.test(p);
  });
  return byExt ? resourcePath(byExt) : null;
}

export type FigureDisplayMode = "image" | "html";

export function resolveFigureDisplay(
  spec: InteractionSpec,
): { ok: true; mode: FigureDisplayMode; path: string } | { ok: false; error: string } {
  if (!isInteractionFigureKind(spec.kind)) {
    return { ok: false, error: `unsupported kind "${spec.kind}"` };
  }
  const prefer = typeof spec.params?.prefer === "string" ? spec.params.prefer.trim() : "";
  const htmlPath = pickHtmlResourcePath(spec.resources);
  const figurePath = pickFigureResourcePath(spec.resources);

  if (prefer === "html" && htmlPath) {
    return {
      ok: true,
      mode: "html",
      path: normalizeFigureResourceProjectPath(spec, htmlPath),
    };
  }
  if (prefer === "figure" && figurePath) {
    return {
      ok: true,
      mode: "image",
      path: normalizeFigureResourceProjectPath(spec, figurePath),
    };
  }
  if (figurePath) {
    return {
      ok: true,
      mode: "image",
      path: normalizeFigureResourceProjectPath(spec, figurePath),
    };
  }
  if (htmlPath) {
    return {
      ok: true,
      mode: "html",
      path: normalizeFigureResourceProjectPath(spec, htmlPath),
    };
  }
  return {
    ok: false,
    error:
      'figure.static requires resources[] with a figure or html path (e.g. resources: [{ role: "figure", path: "curvature_heatmap.png" }] after saving the PNG under .prismnext/artifacts/<id>/)',
  };
}
