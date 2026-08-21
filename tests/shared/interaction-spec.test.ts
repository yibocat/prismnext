import { describe, expect, it } from "vitest";
import {
  isValidInteractionId,
  kindDisplayLabel,
  parseInteractionSpec,
  coerceInteractionSpecInput,
  explainInteractionSpecFailure,
  buildInteractionFenceMarkdown,
  interactionFenceHint,
  isAllowedInteractionKind,
  interactionSpecRelativePath,
  legacyInteractionSpecRelativePath,
} from "../../src/shared/interaction-spec";

describe("isValidInteractionId", () => {
  it("accepts safe ids and rejects traversal", () => {
    expect(isValidInteractionId("plot.loss")).toBe(true);
    expect(isValidInteractionId("a")).toBe(true);
    expect(isValidInteractionId("")).toBe(false);
    expect(isValidInteractionId("..")).toBe(false);
    expect(isValidInteractionId("a/b")).toBe(false);
  });
});

describe("parseInteractionSpec", () => {
  it("parses a minimal valid spec", () => {
    expect(
      parseInteractionSpec({
        id: "plot.loss",
        title: "Loss curve",
        kind: "plot.line",
        compute: "local",
        revision: 1,
      }),
    ).toEqual({
      id: "plot.loss",
      title: "Loss curve",
      kind: "plot.line",
      compute: "local",
      revision: 1,
    });
  });

  it("preserves optional sections", () => {
    const spec = parseInteractionSpec({
      id: "plot.bound",
      title: "Bound plot",
      kind: "plot.scatter",
      compute: "bound",
      revision: 2,
      params: { x: 1 },
      bindings: { csv: { path: "out/m.csv" } },
      resources: [{ path: "out/m.csv" }],
    });
    expect(spec?.params).toEqual({ x: 1 });
    expect(spec?.bindings).toEqual({ csv: { path: "out/m.csv" } });
    expect(spec?.resources).toEqual([{ path: "out/m.csv" }]);
  });

  it("rejects invalid payloads", () => {
    expect(parseInteractionSpec(null)).toBeNull();
    expect(parseInteractionSpec({ id: "x", title: "", kind: "plot", compute: "local", revision: 1 })).toBeNull();
    expect(parseInteractionSpec({ id: "x", title: "T", kind: "plot", compute: "remote", revision: 1 })).toBeNull();
  });
});

describe("coerceInteractionSpecInput", () => {
  it("parses a JSON string, defaults compute/revision, and normalizes kind", () => {
    const coerced = coerceInteractionSpecInput(
      JSON.stringify({
        id: "som-cell-diagram",
        title: "LSTM 单元结构",
        kind: "figure:static",
        path: "figures/som-cell.pdf",
      }),
    );
    expect(parseInteractionSpec(coerced)).toEqual({
      id: "som-cell-diagram",
      title: "LSTM 单元结构",
      kind: "figure.static",
      compute: "local",
      revision: 1,
      resources: [{ role: "figure", path: "figures/som-cell.pdf" }],
    });
  });

  it("lifts source / imagePath / files aliases into resources", () => {
    const coerced = coerceInteractionSpecInput({
      id: "fig.a",
      title: "A",
      kind: "figure.static",
      compute: "local",
      revision: 1,
      source: "out/a.png",
      files: ["out/b.png"],
    });
    const spec = parseInteractionSpec(coerced);
    expect(spec?.resources).toEqual([
      { role: "figure", path: "out/a.png" },
      { role: "figure", path: "out/b.png" },
    ]);
  });

  it("explains missing fields instead of a bare invalid_spec", () => {
    const hint = explainInteractionSpecFailure({ title: "T", kind: "figure.static" });
    expect(hint).toMatch(/missing/i);
    expect(hint).toMatch(/\bid\b/);
    expect(hint).toMatch(/resources/i);
  });
});

describe("kindDisplayLabel", () => {
  it("maps known prefixes", () => {
    expect(kindDisplayLabel("figure.static")).toBe("Figure");
    expect(kindDisplayLabel("plot.line")).toBe("Plot");
    expect(kindDisplayLabel("math.surface")).toBe("Math");
    expect(kindDisplayLabel("custom")).toBe("Custom");
  });
});

describe("interaction agent helpers", () => {
  it("builds fence markdown and hint", () => {
    expect(buildInteractionFenceMarkdown("fig.loss", "Demo")).toContain("id: fig.loss");
    const hint = interactionFenceHint("fig.loss", "Demo");
    expect(hint.fenceMarkdown).toContain("```interaction");
    expect(hint.replyRule).toMatch(/assistant/i);
  });

  it("validates allowed kinds for agent write", () => {
    expect(isAllowedInteractionKind("figure.static")).toBe(true);
    expect(isAllowedInteractionKind("plot.line")).toBe(true);
    expect(isAllowedInteractionKind("plot.series")).toBe(true);
    expect(isAllowedInteractionKind("plot.scatter")).toBe(true);
    expect(isAllowedInteractionKind("custom.widget")).toBe(false);
    expect(isAllowedInteractionKind("diagram.mermaid")).toBe(false);
  });
});

describe("interaction spec paths", () => {
  it("uses interactions dir for canonical relative path", () => {
    expect(interactionSpecRelativePath("plot.loss")).toBe(
      ".workbench/interactions/plot.loss/spec.json",
    );
    expect(legacyInteractionSpecRelativePath("plot.loss")).toBe(
      ".prismnext/artifacts/plot.loss/spec.json",
    );
  });
});
