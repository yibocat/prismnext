import { describe, expect, it } from "vitest";
import { getNativeToolByName } from "../../src/main/agent/tools/index";
import { buildManuscriptCompilePrompt } from "../../src/main/prompts/modules/manuscript-compile";
import { buildWorkspacePrompt } from "../../src/main/prompts/modules/workspace-folders";
import { TOOL_NAMES } from "../../src/shared/agent/tool-names";
import type { PromptContext } from "../../src/main/prompts/types";

describe("buildManuscriptCompilePrompt", () => {
  it("keeps compile workflow + boundaries; defers engine how-to to tools", () => {
    const latex = buildManuscriptCompilePrompt({} as PromptContext);
    expect(latex).toContain("Soft workflow");
    expect(latex).toContain(TOOL_NAMES.latexCompile);
    expect(latex).toContain(TOOL_NAMES.latexRoot);
    expect(latex).toContain(TOOL_NAMES.typstCompile);
    expect(latex).toContain(TOOL_NAMES.typstRoot);
    expect(latex).toContain(".workbench/compile");
    expect(latex).toContain("Scope boundary");
    expect(latex).toContain("Route the request");
    expect(latex).toContain("Citation & bibliography audit");
    expect(latex).toContain(TOOL_NAMES.citationHealth);
    expect(latex).toContain("Template Center");
    expect(latex).toContain("LaTeX scaffolds only");
    expect(latex).toContain("standalone");
    expect(latex).toContain("not this module");
    expect(latex).toContain("do not loop");
    expect(latex).toContain("drafts/");
    expect(latex).toContain(TOOL_NAMES.typstCompileStandalone);
    expect(latex).not.toContain(TOOL_NAMES.latexCompileStandalone);
    expect(latex).not.toMatch(/TeX workspace/i);
    expect(latex).not.toContain("pdflatex");

    expect(latex).not.toContain("pdflatex");
    expect(latex).not.toContain("xelatex");
    expect(latex).not.toContain("BINDING");
    expect(latex).not.toContain("forbidden");
    expect(latex).not.toContain("#set page");
    expect(latex).not.toContain("#set text");
  });

  it("injects configured manuscript folder when present", () => {
    const latex = buildManuscriptCompilePrompt({
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
    expect(latex).toContain("Optional compile entry");
  });

  it("does not attach a main-file pin when the manuscript folder has none", () => {
    const latex = buildManuscriptCompilePrompt({
      workspaceDirs: [{ name: "paper", function: "manuscript" }],
    } as PromptContext);
    expect(latex).toContain("`paper/`");
    expect(latex).not.toContain("Optional compile entry");
  });

  it("does not send standalone figures through the paper compile tool", () => {
    const paper = getNativeToolByName(TOOL_NAMES.latexCompile);
    const figure = getNativeToolByName(TOOL_NAMES.latexCompileStandalone);
    expect(paper?.promptGuidelines?.join(" ")).toContain(TOOL_NAMES.latexCompileStandalone);
    expect(figure?.description).toMatch(/standalone/i);
    expect(figure?.promptGuidelines?.join(" ")).toContain(TOOL_NAMES.latexCompile);

    const latex = buildManuscriptCompilePrompt({} as PromptContext);
    expect(latex).not.toMatch(/User wants to compile, preview PDF/);
    expect(paper?.description).not.toMatch(/TeX workspace/i);

    const typstPaper = getNativeToolByName(TOOL_NAMES.typstCompile);
    expect(typstPaper?.promptGuidelines?.join(" ")).toContain("--root");
    expect(typstPaper?.promptGuidelines?.join(" ")).not.toContain("#set page");
  });
});

describe("buildWorkspacePrompt", () => {
  it("omits a compile entry unless the manuscript folder has a pin", () => {
    expect(buildWorkspacePrompt([{ function: "manuscript", name: "paper" }])).not.toContain(
      "optional compile entry",
    );
    expect(
      buildWorkspacePrompt([{ function: "manuscript", name: "paper", mainFile: "a.typ" }]),
    ).toContain("optional compile entry: `a.typ`");
  });
});
