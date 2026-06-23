import { describe, expect, it } from "vitest";
import {
  externalFileId,
  isExternalFileId,
  resolveExternalPath,
} from "../../src/renderer/lib/files/external-file";

describe("external-file ids", () => {
  it("round-trips absolute paths", () => {
    const abs = "/Users/test/notes.md";
    const id = externalFileId(abs);
    expect(isExternalFileId(id)).toBe(true);
    expect(resolveExternalPath(id)).toBe(abs);
  });

  it("does not treat project paths as external", () => {
    expect(isExternalFileId("manuscript/main.tex")).toBe(false);
  });
});
