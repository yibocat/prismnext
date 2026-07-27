import { describe, expect, it } from "vitest";
import { INTERACTION_KINDS_AGENT } from "../../src/shared/interaction-spec";
import {
  INTERACTION_RENDERERS,
  resolveInteractionRenderer,
} from "../../src/renderer/lib/interaction/renderer-registry";

describe("interaction renderer registry", () => {
  it("resolves every agent-writable kind to a renderer", () => {
    for (const kind of INTERACTION_KINDS_AGENT) {
      expect(resolveInteractionRenderer(kind), `no renderer for ${kind}`).toBeTruthy();
    }
  });

  it("routes figure.plotly to the plotly renderer", () => {
    expect(resolveInteractionRenderer("figure.plotly")?.key).toBe("plotly");
  });

  it("routes figure.static to the figure renderer", () => {
    expect(resolveInteractionRenderer("figure.static")?.key).toBe("figure");
  });

  it("routes plot.* kinds to the plot renderer", () => {
    expect(resolveInteractionRenderer("plot.line")?.key).toBe("plot");
    expect(resolveInteractionRenderer("plot.series")?.key).toBe("plot");
    expect(resolveInteractionRenderer("plot.scatter")?.key).toBe("plot");
  });

  it("routes instrument to the instrument renderer", () => {
    expect(resolveInteractionRenderer("instrument")?.key).toBe("instrument");
  });

  it("routes retired legacy kinds to the deprecated view", () => {
    expect(resolveInteractionRenderer("scene.ir")?.key).toBe("deprecated");
    expect(resolveInteractionRenderer("scene.program")?.key).toBe("deprecated");
    expect(resolveInteractionRenderer("math.surface")?.key).toBe("deprecated");
    expect(resolveInteractionRenderer("math.field")?.key).toBe("deprecated");
  });

  it("returns null for unknown kinds", () => {
    expect(resolveInteractionRenderer("totally.unknown")).toBeNull();
  });

  it("has unique renderer keys", () => {
    const keys = INTERACTION_RENDERERS.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
