import { describe, expect, it } from "vitest";
import {
  isBinaryProjectFile,
  fileExtensionLower,
} from "../../src/shared/project-file-openability";

describe("project-file-openability", () => {
  it("flags database and archive extensions", () => {
    expect(isBinaryProjectFile("library/library.db")).toBe(true);
    expect(isBinaryProjectFile("data/archive.zip")).toBe(true);
    expect(fileExtensionLower("notes/report.md")).toBe(".md");
    expect(isBinaryProjectFile("notes/report.md")).toBe(false);
  });

  it("still allows pdf and images in dedicated viewers", () => {
    expect(isBinaryProjectFile("paper.pdf")).toBe(false);
    expect(isBinaryProjectFile("fig/plot.png")).toBe(false);
  });
});
