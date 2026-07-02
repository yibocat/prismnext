import { describe, expect, it } from "vitest";
import {
  inferToolNameFromInput,
  inferToolNameFromOutput,
  resolveLiteratureToolTitle,
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
