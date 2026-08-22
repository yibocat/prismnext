import { describe, expect, it } from "vitest";
import {
  extractAbstractFromMarkdown,
  extractKeywordHintsFromText,
} from "../../src/main/literature/ai-metadata/literature-ai-metadata-heuristics";

const SAMPLE = `
# Paper

Abstract
This paper studies world models for control and planning in complex environments.

Keywords: reinforcement learning, world models, planning
Introduction
Lorem ipsum
`;

describe("literature-ai-metadata-heuristics", () => {
  it("extracts abstract section", () => {
    expect(extractAbstractFromMarkdown(SAMPLE)).toContain("world models");
  });

  it("extracts keyword hints", () => {
    expect(extractKeywordHintsFromText(SAMPLE)).toEqual(
      expect.arrayContaining(["reinforcement learning", "world models"]),
    );
  });
});
