import { describe, expect, it } from "vitest";
import type { InteractionSpec } from "../../src/shared/interaction-spec";
import {
  isInteractionDiagramKind,
  resolveDiagramSource,
} from "../../src/shared/interaction-diagram";

function baseSpec(overrides?: Partial<InteractionSpec>): InteractionSpec {
  return {
    id: "demo.diagram",
    title: "Demo diagram",
    kind: "diagram.mermaid",
    compute: "local",
    revision: 1,
    ...overrides,
  };
}

describe("isInteractionDiagramKind", () => {
  it("matches diagram.mermaid, trims, case-sensitive", () => {
    expect(isInteractionDiagramKind("diagram.mermaid")).toBe(true);
    expect(isInteractionDiagramKind("  diagram.mermaid  ")).toBe(true);
    expect(isInteractionDiagramKind("figure.plotly")).toBe(false);
    expect(isInteractionDiagramKind("Diagram.Mermaid")).toBe(false);
  });
});

describe("resolveDiagramSource", () => {
  it("defaults engine to mermaid when omitted", () => {
    const r = resolveDiagramSource(baseSpec({ model: { source: "graph TD; A-->B;" } }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.engine).toBe("mermaid");
  });

  it("accepts explicit dot engine", () => {
    const r = resolveDiagramSource(
      baseSpec({ model: { engine: "dot", source: "digraph { a -> b; }" } }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.engine).toBe("dot");
  });

  it("rejects an unknown engine value", () => {
    const r = resolveDiagramSource(
      baseSpec({ model: { engine: "graphviz", source: "digraph { a -> b; }" } }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/mermaid.*dot/i);
  });

  it("resolves inline model.source", () => {
    const r = resolveDiagramSource(baseSpec({ model: { source: "graph TD; A-->B;" } }));
    expect(r.ok).toBe(true);
    if (r.ok && r.mode === "inline") expect(r.source).toBe("graph TD; A-->B;");
  });

  it("resolves a file resource, normalizing a bare filename under the artifact dir", () => {
    const r = resolveDiagramSource(
      baseSpec({ resources: [{ role: "diagram-source", path: "diagram.mmd" }] }),
    );
    expect(r.ok).toBe(true);
    if (r.ok && r.mode === "file") {
      expect(r.path).toBe(".prismnext/artifacts/demo.diagram/diagram.mmd");
    }
  });

  it("resolves a bound experiment/ path unchanged", () => {
    const r = resolveDiagramSource(
      baseSpec({
        compute: "bound",
        resources: [{ role: "diagram-source", path: "experiment/exp-1/results/callgraph.dot" }],
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok && r.mode === "file") {
      expect(r.path).toBe("experiment/exp-1/results/callgraph.dot");
    }
  });

  it("falls back to extension-sniffing when role is not diagram-source", () => {
    const r = resolveDiagramSource(baseSpec({ resources: [{ path: "flow.dot" }] }));
    expect(r.ok).toBe(true);
    if (r.ok && r.mode === "file") expect(r.path).toContain("flow.dot");
  });

  it("prefers a file resource over inline source when both are present", () => {
    const r = resolveDiagramSource(
      baseSpec({
        model: { source: "graph TD; A-->B;" },
        resources: [{ role: "diagram-source", path: "diagram.mmd" }],
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.mode).toBe("file");
  });

  it("fails when neither inline source nor a file resource is given", () => {
    const r = resolveDiagramSource(baseSpec());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/model\.source|diagram-source/);
  });

  it("rejects an unsupported kind", () => {
    const r = resolveDiagramSource(baseSpec({ kind: "figure.plotly" }));
    expect(r.ok).toBe(false);
  });
});
