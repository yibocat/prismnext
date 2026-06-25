import { describe, it, expect } from "vitest";
import {
  assertSafeRelativePath,
  parseBackupLabelIds,
} from "../../src/main/lib/template-path";

describe("assertSafeRelativePath", () => {
  it("allows normal relative paths", () => {
    expect(() => assertSafeRelativePath("main.tex")).not.toThrow();
    expect(() => assertSafeRelativePath("chapters/intro.tex")).not.toThrow();
  });

  it("rejects parent traversal", () => {
    expect(() => assertSafeRelativePath("../secret.tex")).toThrow();
    expect(() => assertSafeRelativePath("foo/../../etc/passwd")).toThrow();
  });

  it("rejects absolute paths", () => {
    expect(() => assertSafeRelativePath("/etc/passwd")).toThrow();
  });
});

describe("parseBackupLabelIds", () => {
  it("parses switch labels", () => {
    expect(
      parseBackupLabelIds("2026-01-01T00-00-00-000Z_academic-paper_to_phd-thesis"),
    ).toEqual({
      sourceTemplateId: "academic-paper",
      targetTemplateId: "phd-thesis",
    });
  });

  it("parses first_use labels", () => {
    expect(parseBackupLabelIds("2026_first_use_academic-paper")).toEqual({
      targetTemplateId: "academic-paper",
    });
  });
});
