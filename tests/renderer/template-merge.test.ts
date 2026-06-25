import { describe, it, expect } from "vitest";
import {
  getCompatibilityLevel,
  getTemplateSwitchStrategy,
  supportsSectionMerge,
  mergeSections,
  mergeFile,
  parseSections,
  NON_MERGE_CATEGORIES,
} from "@/lib/templates/template-merge";

describe("supportsSectionMerge", () => {
  it("allows paper and thesis only", () => {
    expect(supportsSectionMerge("paper")).toBe(true);
    expect(supportsSectionMerge("thesis")).toBe(true);
    expect(supportsSectionMerge("letter")).toBe(false);
    expect(supportsSectionMerge("beamer")).toBe(false);
  });
});

describe("getCompatibilityLevel", () => {
  it("returns L1 for same category", () => {
    expect(getCompatibilityLevel("paper", "paper")).toBe("L1");
  });

  it("returns L2 for paper-thesis pair", () => {
    expect(getCompatibilityLevel("paper", "thesis")).toBe("L2");
    expect(getCompatibilityLevel("thesis", "paper")).toBe("L2");
  });

  it("returns L3 for unrelated categories", () => {
    expect(getCompatibilityLevel("paper", "beamer")).toBe("L3");
  });
});

describe("getTemplateSwitchStrategy", () => {
  it("first use offers replace only", () => {
    const s = getTemplateSwitchStrategy("", "paper", {
      sameTemplate: false,
      hasChanges: true,
      isFirstUse: true,
    });
    expect(s.level).toBe("firstUse");
    expect(s.dialogActions).toEqual(["replace"]);
  });

  it("same template no changes needs no dialog", () => {
    const s = getTemplateSwitchStrategy("paper", "paper", {
      sameTemplate: true,
      hasChanges: false,
      isFirstUse: false,
    });
    expect(s.dialogActions).toEqual([]);
  });

  it("letter involved forces replace only", () => {
    const s = getTemplateSwitchStrategy("paper", "letter", {
      sameTemplate: false,
      hasChanges: true,
      isFirstUse: false,
    });
    expect(s.level).toBe("L3");
    expect(s.dialogActions).toEqual(["replace"]);
  });

  it("paper to thesis offers merge and replace", () => {
    const s = getTemplateSwitchStrategy("paper", "thesis", {
      sameTemplate: false,
      hasChanges: true,
      isFirstUse: false,
    });
    expect(s.level).toBe("L2");
    expect(s.dialogActions).toEqual(["merge", "replace"]);
  });

  it("paper to paper with changes offers merge", () => {
    const s = getTemplateSwitchStrategy("paper", "paper", {
      sameTemplate: false,
      hasChanges: true,
      isFirstUse: false,
    });
    expect(s.level).toBe("L1");
    expect(s.dialogActions).toEqual(["merge", "replace"]);
  });
});

describe("NON_MERGE_CATEGORIES", () => {
  it("includes letter beamer poster cv", () => {
    expect(NON_MERGE_CATEGORIES.has("letter")).toBe(true);
    expect(NON_MERGE_CATEGORIES.has("beamer")).toBe(true);
    expect(NON_MERGE_CATEGORIES.has("poster")).toBe(true);
    expect(NON_MERGE_CATEGORIES.has("cv")).toBe(true);
  });
});

describe("mergeSections", () => {
  const newBody = `\\maketitle

\\begin{abstract}
New abstract placeholder.
\\end{abstract}

\\section{Introduction}
Template intro.

\\section{Methods}
Template methods.
`;

  it("preserves user abstract in preamble block", () => {
    const oldBody = `\\maketitle

\\begin{abstract}
My edited abstract text.
\\end{abstract}

\\section{Introduction}
My introduction content.
`;
    const merged = mergeSections(oldBody, newBody);
    expect(merged).toContain("My edited abstract text");
    expect(merged).not.toContain("New abstract placeholder");
    expect(merged).toContain("My introduction content");
    expect(merged).toContain("\\section{Methods}");
  });

  it("replaces matching section content by name", () => {
    const oldBody = `\\section{Introduction}
User intro here.
`;
    const smallNew = `\\section{Introduction}
Placeholder.
`;
    const merged = mergeSections(oldBody, smallNew);
    expect(merged).toContain("User intro here");
    expect(merged).not.toContain("Placeholder");
  });

  it("appends old-only sections at end", () => {
    const oldBody = `\\section{Introduction}
A

\\section{Custom Appendix}
Extra material.
`;
    const newOnly = `\\section{Introduction}
B
`;
    const merged = mergeSections(oldBody, newOnly);
    expect(merged).toContain("Custom Appendix");
    expect(merged).toContain("Extra material");
  });
});

describe("mergeFile", () => {
  const newTex = `\\documentclass{article}
\\begin{document}
\\begin{abstract}
New abs
\\end{abstract}
\\section{Introduction}
T
\\end{document}
`;

  it("uses new content when user has not changed file", () => {
    const result = mergeFile("", newTex, "main.tex", false, "paper");
    expect(result).toBe(newTex);
  });

  it("merges changed paper tex with preamble swap", () => {
    const oldTex = `\\documentclass{article}
\\begin{document}
\\begin{abstract}
User abs
\\end{abstract}
\\section{Introduction}
User intro
\\end{document}
`;
    const result = mergeFile(oldTex, newTex, "main.tex", true, "paper");
    expect(result).toContain("User abs");
    expect(result).toContain("User intro");
    expect(result).toContain("\\end{document}");
  });

  it("replace-only category returns new template for changed tex", () => {
    const oldTex = `\\begin{document}old letter\\end{document}`;
    const result = mergeFile(oldTex, newTex, "main.tex", true, "letter");
    expect(result).toBe(newTex);
  });

  it("keeps user bib when changed", () => {
    const result = mergeFile("@user{}", "@template{}", "refs.bib", true, "paper");
    expect(result).toBe("@user{}");
  });
});

describe("parseSections", () => {
  it("captures preamble before first section", () => {
    const body = `\\maketitle
\\begin{abstract}X\\end{abstract}

\\section{Intro}
text`;
    const sections = parseSections(body);
    expect(sections[0].name).toBe("");
    expect(sections[0].content).toContain("abstract");
    expect(sections[1].name).toBe("intro");
  });
});
