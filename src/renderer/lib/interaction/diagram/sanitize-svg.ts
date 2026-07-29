/**
 * Defensive SVG sanitization for Graphviz DOT output (D37). DOT allows
 * URL/href/tooltip node attributes, so the compiled SVG can carry <a href>
 * and (in principle) inline event handlers. This is a targeted strip of the
 * concrete injection surfaces, not a general HTML sanitizer — the same
 * "targeted, not universal" approach as interaction-script's hard-ban scan.
 */
export function sanitizeDiagramSvg(svg: string): string {
  return svg
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*"(?:[^"\\]|\\.)*"/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*'(?:[^'\\]|\\.)*'/gi, "")
    .replace(/(href|xlink:href)\s*=\s*"javascript:[^"]*"/gi, '$1="#"')
    .replace(/(href|xlink:href)\s*=\s*'javascript:[^']*'/gi, "$1='#'");
}
