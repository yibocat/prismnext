import { describe, expect, it } from "vitest";
import { CORE_PERSONA_PROMPT } from "../../src/main/prompts/layers/core-persona";

describe("CORE_PERSONA_PROMPT", () => {
  it("defines research collaboration identity — not LaTeX tutorial or brief duplication", () => {
    expect(CORE_PERSONA_PROMPT).toContain("research collaborator");
    expect(CORE_PERSONA_PROMPT).toContain("research program");
    expect(CORE_PERSONA_PROMPT).toContain("Scale edits to the task");
    expect(CORE_PERSONA_PROMPT).toContain("coherence");
    expect(CORE_PERSONA_PROMPT).toContain("Scholarly reasoning");

    expect(CORE_PERSONA_PROMPT).not.toContain("never rewrite a whole file");
    expect(CORE_PERSONA_PROMPT).not.toContain("LaTeX-only");
    expect(CORE_PERSONA_PROMPT).not.toContain("first person");
    expect(CORE_PERSONA_PROMPT).not.toContain("\\chapter");
    expect(CORE_PERSONA_PROMPT).not.toContain(".prismnext/.venv");
  });
});
