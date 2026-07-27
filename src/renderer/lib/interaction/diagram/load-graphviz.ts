/**
 * Lazy Graphviz (WASM) loader — bundled locally, shared across panels.
 * `Graphviz.load()` is the one-time async WASM init; `.dot()` on the
 * returned instance is synchronous.
 *
 * @hpcc-js/wasm's own .d.ts re-exports types from "@hpcc-js/wasm-graphviz",
 * which is only a devDependency of that package (not installed here) — so
 * we declare the minimal surface we actually use instead of importing its
 * (unresolvable) type declarations.
 */
export interface GraphvizInstance {
  dot(source: string, format?: string): string;
}

interface GraphvizModule {
  Graphviz: { load(): Promise<GraphvizInstance> };
}

let graphvizPromise: Promise<GraphvizInstance> | null = null;

export function loadGraphviz(): Promise<GraphvizInstance> {
  if (!graphvizPromise) {
    graphvizPromise = (
      import("@hpcc-js/wasm/graphviz") as unknown as Promise<GraphvizModule>
    ).then(({ Graphviz }) => Graphviz.load());
  }
  return graphvizPromise;
}
