import { describe, expect, it } from "vitest";
import { CORE_PERSONA_PROMPT } from "../../src/main/prompts/layers/core-persona";

describe("CORE_PERSONA_PROMPT", () => {
  it("defines role, mission, and refusals — not domain modules or edit playbooks", () => {
    expect(CORE_PERSONA_PROMPT).toContain("research AI assistant");
    expect(CORE_PERSONA_PROMPT).toContain("research program");
    expect(CORE_PERSONA_PROMPT).toContain("not a substitute for the researcher's judgment");
    expect(CORE_PERSONA_PROMPT).toContain("Extend the researcher's line of thought");
    expect(CORE_PERSONA_PROMPT).toContain("Fabricated citations");

    expect(CORE_PERSONA_PROMPT).not.toContain("Scholarly reasoning");
    expect(CORE_PERSONA_PROMPT).not.toContain("local-first");
    expect(CORE_PERSONA_PROMPT).not.toContain("Scale edits to the task");
    expect(CORE_PERSONA_PROMPT).not.toContain("LaTeX-only");
    expect(CORE_PERSONA_PROMPT).not.toContain("first person");
    expect(CORE_PERSONA_PROMPT).not.toContain("\\chapter");
    expect(CORE_PERSONA_PROMPT).not.toContain(".workbench/.venv");
    expect(CORE_PERSONA_PROMPT).not.toContain("capability modules");
  });
});
