import { describe, expect, it } from "vitest";
import { INTERACTION_PROMPT } from "../../src/main/prompts/modules/interaction";
import { ALL_MODULES } from "../../src/main/prompts/modules";
import { TOOL_NAMES } from "../../src/shared/agent/tool-names";

describe("INTERACTION_PROMPT", () => {
  it("teaches when to create Interaction cards — no UI chrome jargon", () => {
    expect(INTERACTION_PROMPT).toContain("clickable card");
    expect(INTERACTION_PROMPT).toContain("figure.static");
    expect(INTERACTION_PROMPT).toContain(TOOL_NAMES.interactionWrite);
    expect(INTERACTION_PROMPT).toContain("artifact");
    expect(INTERACTION_PROMPT).toContain("Reply depth");

    expect(INTERACTION_PROMPT).not.toContain("RightArea");
    expect(INTERACTION_PROMPT).not.toContain("BINDING");
  });

  it("is a shared profile module (not global system)", () => {
    const mod = ALL_MODULES.find((m) => m.key === "interaction");
    expect(mod?.profileOnly).toBe(true);
  });
});
