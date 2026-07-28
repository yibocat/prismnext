import { describe, expect, it } from "vitest";
import {
  buildInteractionWriteGuidance,
  getInteractionCapability,
} from "../../src/shared/interaction-capabilities";

describe("Interaction capability contract", () => {
  it("declares live bindings only for instrument", () => {
    expect(getInteractionCapability("instrument")?.interaction).toBe("live-bindings");
    expect(getInteractionCapability("figure.plotly")?.interaction).not.toBe("live-bindings");
    expect(getInteractionCapability("figure.script")?.interaction).not.toBe("live-bindings");
  });

  it("declares bound resources as versioned rather than live-refreshed", () => {
    const plotly = getInteractionCapability("figure.plotly");
    expect(plotly?.boundResources).toBe("versioned");
    expect(buildInteractionWriteGuidance()).toContain("versioned resource");
    expect(buildInteractionWriteGuidance()).toContain("does not auto-refresh");
  });

  it("gives the agent a capability-based selection contract", () => {
    const guidance = buildInteractionWriteGuidance();
    expect(guidance).toContain("data source");
    expect(guidance).toContain("time behavior");
    expect(guidance).toContain("rendering capability");
    expect(guidance).toContain("figure.plotly");
    expect(guidance).toContain("instrument");
    expect(guidance).toContain("diagram.mermaid");
  });
});
