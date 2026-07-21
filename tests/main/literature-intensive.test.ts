import { describe, it, expect } from "vitest";
import { buildIntensiveReadingInstruction } from "../../src/main/prompts/per-turn/intensive-reading";
import { PAPER_EXTRACT_ACTION_LABEL } from "../../src/shared/paper-extract";
import { TOOL_NAMES } from "../../src/shared/tool-names";

describe("buildIntensiveReadingInstruction", () => {
  it("returns empty string when no papers", () => {
    expect(buildIntensiveReadingInstruction([])).toBe("");
  });

  it("lists papers by bibkey and title", () => {
    const out = buildIntensiveReadingInstruction([
      { bibkey: "Vaswani2017", title: "Attention Is All You Need" },
      { bibkey: "Devlin2019", title: "BERT" },
    ]);
    expect(out).toContain("## Intensive reading papers (this session)");
    expect(out).toContain("1. `Vaswani2017` — Attention Is All You Need");
    expect(out).toContain("2. `Devlin2019` — BERT");
  });

  it("mentions literature-read-pdf, cite form, and extract hint", () => {
    const out = buildIntensiveReadingInstruction([
      { bibkey: "Vaswani2017", title: "Attention Is All You Need" },
    ]);
    expect(out).toContain(TOOL_NAMES.literatureReadPdf);
    expect(out).toContain("p.X");
    expect(out).toContain("[@bibkey]");
    expect(out).toContain(PAPER_EXTRACT_ACTION_LABEL);
    expect(out).toContain("enforced by the tool");
    expect(out).not.toContain("you MUST use");
  });

  it("when paper snippets present, prioritizes excerpt over read-pdf", () => {
    const out = buildIntensiveReadingInstruction(
      [{ bibkey: "Liu2022", title: "Dynamic q-rung" }],
      { hasPaperSnippets: true },
    );
    expect(out).toContain("```paper");
    expect(out).toContain("prefer them");
    expect(out).toContain("context outside");
  });

  it("falls back to bibkey when title is empty", () => {
    const out = buildIntensiveReadingInstruction([{ bibkey: "X2020", title: "" }]);
    expect(out).toContain("`X2020` — X2020");
  });
});
