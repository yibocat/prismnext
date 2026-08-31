import { describe, expect, it } from "vitest";
import { typstFileUri, typstRelFromUri, normalizeTypstRel } from "../../src/shared/typst/uri";

describe("typst URI", () => {
  it("normalizes backslashes and leading slashes", () => {
    expect(normalizeTypstRel("\\manuscript\\main.typ")).toBe("manuscript/main.typ");
    expect(normalizeTypstRel("/manuscript/main.typ")).toBe("manuscript/main.typ");
  });

  it("round-trips a POSIX manuscript path", () => {
    const root = "/Users/me/paper";
    const rel = "manuscript/main.typ";
    const uri = typstFileUri(root, rel);
    expect(uri.startsWith("file://")).toBe(true);
    expect(uri).toContain("manuscript/main.typ");
    expect(typstRelFromUri(root, uri)).toBe(rel);
  });

  it("encodes spaces in the file URI", () => {
    const root = "/tmp/my paper";
    const rel = "src/hello world.typ";
    const uri = typstFileUri(root, rel);
    expect(uri).toContain("hello%20world.typ");
    expect(typstRelFromUri(root, uri)).toBe(rel);
  });

  it("round-trips a Windows drive path", () => {
    if (process.platform !== "win32") return;
    const root = "C:\\Users\\me\\paper";
    const rel = "manuscript/main.typ";
    expect(typstRelFromUri(root, typstFileUri(root, rel))).toBe(rel);
  });

  it("returns null when the URI is outside the project root", () => {
    expect(typstRelFromUri("/proj", typstFileUri("/other", "main.typ"))).toBeNull();
  });
});

describe("parseTinymistScrollSource", () => {
  it("maps JumpInfo filepath + 0-based start to a 1-based TypstScrollToEvent", async () => {
    const { parseTinymistScrollSource } = await import("../../src/shared/typst/lsp");
    expect(parseTinymistScrollSource("/proj", {
      filepath: "/proj/manuscript/main.typ",
      start: [11, 4],
    })).toEqual({
      projectRoot: "/proj",
      relPath: "manuscript/main.typ",
      line: 12,
      character: 4,
    });
  });

  it("accepts a file:// filepath", async () => {
    const { parseTinymistScrollSource } = await import("../../src/shared/typst/lsp");
    const uri = typstFileUri("/proj", "ch.typ");
    expect(parseTinymistScrollSource("/proj", { filepath: uri, start: [0, 0] })).toMatchObject({
      relPath: "ch.typ",
      line: 1,
      character: 0,
    });
  });

  it("returns null without filepath or start", async () => {
    const { parseTinymistScrollSource } = await import("../../src/shared/typst/lsp");
    expect(parseTinymistScrollSource("/proj", {})).toBeNull();
    expect(parseTinymistScrollSource("/proj", { filepath: "/proj/a.typ" })).toBeNull();
  });
});
