import { describe, expect, it } from "vitest";
import {
  normalizePaperTag,
  normalizePaperTags,
  normalizePaperTagsWithCatalog,
  parsePaperTagsJson,
  serializePaperTagsJson,
  paperTagDotClass,
  paperTagKey,
  paperTagToneClass,
  resolvePaperTagDisplay,
} from "../../src/shared/literature/paper-tags";

describe("paperTagKey", () => {
  it.each([
    ["test", "Test"],
    ["test", "TEST"],
    ["1-test", "1 test"],
    ["1-test", "1_test"],
    ["world model", "World Model"],
    ["world model", "world-model"],
    ["gpt-4", "gpt-4"],
  ])('"%s" equals "%s"', (a, b) => {
    expect(paperTagKey(a)).toBe(paperTagKey(b));
  });

  it.each([
    ["llm", "llms"],
    ["gpt-4", "gpt 4"],
  ])('"%s" differs from "%s"', (a, b) => {
    expect(paperTagKey(a)).not.toBe(paperTagKey(b));
  });
});

describe("resolvePaperTagDisplay", () => {
  it("reuses existing project display for same key", () => {
    const catalog = ["World Model", "LLM"];
    expect(resolvePaperTagDisplay("world model", catalog)).toBe("World Model");
    expect(resolvePaperTagDisplay("world-model", catalog)).toBe("World Model");
  });

  it("uses normalized display for new keys", () => {
    expect(resolvePaperTagDisplay("New Topic", [])).toBe("New Topic");
  });
});

describe("normalizePaperTagsWithCatalog", () => {
  it("dedupes by key and respects catalog display", () => {
    const out = normalizePaperTagsWithCatalog(["To Read", "to-read", "LLM"], ["To Read"]);
    expect(out).toEqual(["To Read", "LLM"]);
  });
});

describe("paper-tags", () => {
  it("normalizes and dedupes tags", () => {
    expect(normalizePaperTag("  world model  ")).toBe("world model");
    expect(normalizePaperTags(["To-Read", "to-read", "Writing"])).toEqual(["To-Read", "Writing"]);
  });

  it("round-trips JSON", () => {
    const json = serializePaperTagsJson(["Survey", "LLM"]);
    expect(parsePaperTagsJson(json)).toEqual(["Survey", "LLM"]);
    expect(serializePaperTagsJson([])).toBeNull();
  });

  it("rejects invalid tags", () => {
    expect(normalizePaperTag("")).toBeNull();
    expect(normalizePaperTag("x".repeat(40))).toBeNull();
    expect(parsePaperTagsJson("not-json")).toEqual([]);
  });

  it("assigns stable tone per tag name", () => {
    expect(paperTagToneClass("Survey")).toBe(paperTagToneClass("Survey"));
    expect(paperTagToneClass("Survey")).not.toBe(paperTagToneClass("LLM"));
    expect(paperTagDotClass("Survey")).toBe(paperTagDotClass("Survey"));
    expect(paperTagDotClass("Survey")).not.toBe(paperTagDotClass("LLM"));
  });
});
