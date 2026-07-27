/**
 * Lazy mermaid loader — bundled locally (no CDN), shared across panels.
 * securityLevel is hard-coded to "strict" (D37): Mermaid's own DOMPurify
 * pass plus disabling `click nodeId call fn()` callback bindings. This must
 * never be made configurable — an Agent-controlled Mermaid source that can
 * trigger a `click` callback is a function-call entry point in the main
 * realm, which is exactly what the immutable safety boundary rules out.
 */
export type MermaidModule = import("mermaid").Mermaid;

let mermaidPromise: Promise<MermaidModule> | null = null;

export function loadMermaid(): Promise<MermaidModule> {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((m) => {
      const mod = m.default;
      mod.initialize({ startOnLoad: false, securityLevel: "strict" });
      return mod;
    });
  }
  return mermaidPromise;
}
