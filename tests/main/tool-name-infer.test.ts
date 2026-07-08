import { describe, expect, it } from "vitest";
import {
  inferToolNameFromInput,
  inferToolNameFromOutput,
  resolveLiteratureToolTitle,
  resolvePrismToolTitle,
} from "../../src/main/acp/tool-name-infer";

describe("inferToolNameFromInput", () => {
  it("maps literature-search when query and limit are present", () => {
    expect(inferToolNameFromInput({ query: "Choquet", limit: 20 })).toBe("literature-search");
  });

  it("maps bare query to websearch (KIND_TO_TOOL[other]=task would mislabel it otherwise)", () => {
    expect(inferToolNameFromInput({ query: "Choquet integral" })).toBe("websearch");
  });

  it("maps websearch when max_results is present", () => {
    expect(inferToolNameFromInput({ query: "news", max_results: 5 })).toBe("websearch");
  });

  it("maps literature-read from bibkey", () => {
    expect(inferToolNameFromInput({ bibkey: "foo_2024" })).toBe("literature-read");
  });

  it("maps literature-stage (not add) from doi as the safer default", () => {
    expect(inferToolNameFromInput({ doi: "10.1234/example" })).toBe("literature-stage");
  });

  it("maps literature-stage from arxivId", () => {
    expect(inferToolNameFromInput({ arxivId: "2312.00726" })).toBe("literature-stage");
  });

  it("maps experiment-run (id + command) and does NOT mislabel as bash", () => {
    expect(inferToolNameFromInput({ id: "exp-20260708-lr-a3f2", command: "python train.py" })).toBe("experiment-run");
    expect(
      inferToolNameFromInput({ id: "exp-x", command: "echo hi", artifacts: ["results/loss.png"], notes: "baseline" }),
    ).toBe("experiment-run");
  });

  it("still maps bare command (no id) to bash", () => {
    expect(inferToolNameFromInput({ command: "ls -la" })).toBe("bash");
    expect(inferToolNameFromInput({ command: "make build", description: "build", workdir: "." })).toBe("bash");
  });
});

describe("inferToolNameFromOutput", () => {
  it("detects literature-search results by bibkey", () => {
    const raw = {
      output: JSON.stringify({
        results: [{ bibkey: "a_novel_choquet", title: "Test" }],
        count: 1,
      }),
    };
    expect(inferToolNameFromOutput(raw)).toBe("literature-search");
  });

  it("returns null for web search shaped results", () => {
    expect(
      inferToolNameFromOutput({ results: [{ url: "https://example.com", title: "Web" }] }),
    ).toBeNull();
  });
});

describe("resolveLiteratureToolTitle", () => {
  it("accepts literature tool titles", () => {
    expect(resolveLiteratureToolTitle("literature-search")).toBe("literature-search");
    expect(resolveLiteratureToolTitle("literature-add")).toBe("literature-add");
    expect(resolveLiteratureToolTitle("literature-stage")).toBe("literature-stage");
  });

  it("rejects unrelated titles", () => {
    expect(resolveLiteratureToolTitle("websearch")).toBeNull();
  });
});

describe("inferToolNameFromInput — utility / shell / file branches", () => {
  it("maps bash / webfetch", () => {
    expect(inferToolNameFromInput({ command: "ls" })).toBe("bash");
    expect(inferToolNameFromInput({ url: "https://x" })).toBe("webfetch");
  });

  it("maps todowrite / question / task / skill", () => {
    expect(inferToolNameFromInput({ todos: [] })).toBe("todowrite");
    expect(inferToolNameFromInput({ question: "why?" })).toBe("question");
    expect(inferToolNameFromInput({ prompt: "x", subagent_type: "y" })).toBe("task");
    expect(inferToolNameFromInput({ name: "skill-id" })).toBe("skill");
  });

  it("maps file ops from file_path + companion keys", () => {
    expect(inferToolNameFromInput({ file_path: "/a", old_string: "a", new_string: "b" })).toBe("edit");
    expect(inferToolNameFromInput({ file_path: "/a", content: "hi" })).toBe("write");
    expect(inferToolNameFromInput({ file_path: "/a", description: "del" })).toBe("delete");
    expect(inferToolNameFromInput({ file_path: "/a" })).toBe("read");
  });

  it("maps move from source/destination paths", () => {
    expect(inferToolNameFromInput({ source_path: "a", destination_path: "b" })).toBe("move");
    expect(inferToolNameFromInput({ sourcePath: "a", destinationPath: "b" })).toBe("move");
  });

  it("maps grep / glob / apply_patch", () => {
    expect(inferToolNameFromInput({ pattern: "foo", include: "*.ts" })).toBe("grep");
    expect(inferToolNameFromInput({ pattern: "foo", path: "." })).toBe("glob");
    // pattern-only (no include/type/path) collapses to glob per source
    expect(inferToolNameFromInput({ pattern: "foo" })).toBe("glob");
    expect(inferToolNameFromInput({ patch: "diff" })).toBe("apply_patch");
  });

  it("maps lsp family", () => {
    expect(inferToolNameFromInput({ uri: "file:///a", references: true })).toBe("lsp_find_references");
    expect(inferToolNameFromInput({ uri: "file:///a", definition: true })).toBe("lsp_goto_definition");
    expect(inferToolNameFromInput({ uri: "file:///a" })).toBe("lsp");
  });

  it("returns null for empty / unknown / non-object input", () => {
    expect(inferToolNameFromInput({})).toBeNull();
    expect(inferToolNameFromInput(null)).toBeNull();
    expect(inferToolNameFromInput("string")).toBeNull();
    expect(inferToolNameFromInput(42)).toBeNull();
  });
});

describe("resolvePrismToolTitle", () => {
  it("resolves registered Prism custom tool names (trimmed + lowercased)", () => {
    expect(resolvePrismToolTitle("citation-health")).toBe("citation-health");
    expect(resolvePrismToolTitle("latex-compile")).toBe("latex-compile");
    expect(resolvePrismToolTitle("latex-root")).toBe("latex-root");
    expect(resolvePrismToolTitle("literature-export-bib")).toBe("literature-export-bib");
    expect(resolvePrismToolTitle("literature-delete")).toBe("literature-delete");
    expect(resolvePrismToolTitle("  LITERATURE-READ  ")).toBe("literature-read");
  });

  it("rejects non-Prism / unknown tool names", () => {
    expect(resolvePrismToolTitle("unknown-tool")).toBeNull();
    expect(resolvePrismToolTitle("")).toBeNull();
    expect(resolvePrismToolTitle("websearch")).toBeNull();
  });
});
