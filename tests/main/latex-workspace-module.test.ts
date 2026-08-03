import { describe, expect, it } from "vitest";
import { buildLatexWorkspacePrompt } from "../../src/main/prompts/modules/latex-workspace";
import { TOOL_NAMES } from "../../src/shared/tool-names";
import type { PromptContext } from "../../src/main/prompts/types";

describe("buildLatexWorkspacePrompt", () => {
  it("keeps compile workflow + boundaries; defers engine how-to to tools", () => {
    const latex = buildLatexWorkspacePrompt({} as PromptContext);
    expect(latex).toContain("Soft workflow");
    expect(latex).toContain(TOOL_NAMES.latexCompile);
    expect(latex).toContain(TOOL_NAMES.latexRoot);
    expect(latex).toContain(".prismnext/compile/");
    expect(latex).toContain("Scope boundary");
    expect(latex).toContain("Route the request");
    expect(latex).toContain("Citation & bibliography audit");
    expect(latex).toContain(TOOL_NAMES.citationHealth);

    expect(latex).not.toContain("pdflatex");
    expect(latex).not.toContain("xelatex");
    expect(latex).not.toContain("BINDING");
    expect(latex).not.toContain("forbidden");
  });

  it("injects configured manuscript folder when present", () => {
    const latex = buildLatexWorkspacePrompt({
      workspaceDirs: [
        {
          name: "paper",
          function: "manuscript",
          mainTex: "main.tex",
          description: "The paper",
        },
      ],
    } as PromptContext);
    expect(latex).toContain("`paper/`");
    expect(latex).toContain("`main.tex`");
  });
});
