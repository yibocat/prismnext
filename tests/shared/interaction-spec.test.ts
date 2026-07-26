import { describe, expect, it } from "vitest";
import {
  isValidInteractionId,
  kindDisplayLabel,
  parseInteractionSpec,
  buildInteractionFenceMarkdown,
  interactionFenceHint,
  isAllowedInteractionKind,
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

describe("kindDisplayLabel", () => {
  it("maps known prefixes", () => {
    expect(kindDisplayLabel("plot.line")).toBe("Plot");
    expect(kindDisplayLabel("math.surface")).toBe("Math");
    expect(kindDisplayLabel("custom")).toBe("Custom");
  });
});

describe("interaction agent helpers", () => {
  it("builds fence markdown and hint", () => {
    expect(buildInteractionFenceMarkdown("demo.plot", "Demo")).toContain("id: demo.plot");
    const hint = interactionFenceHint("demo.plot", "Demo");
    expect(hint.fenceMarkdown).toContain("```interaction");
    expect(hint.replyRule).toMatch(/assistant/i);
  });

  it("validates allowed kinds for agent write", () => {
    expect(isAllowedInteractionKind("plot.line")).toBe(true);
    expect(isAllowedInteractionKind("custom.widget")).toBe(false);
  });
});
