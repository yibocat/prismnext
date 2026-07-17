import { beforeEach, describe, expect, it } from "vitest";
import {
  clearViewerPosition,
  loadViewerPosition,
  saveViewerPosition,
} from "../../src/renderer/lib/editor/viewer-position";

describe("viewer-position memory", () => {
  beforeEach(() => {
    clearViewerPosition("proj::compile-preview");
    clearViewerPosition("file-a.tex");
  });

  it("reads back in-memory saves immediately", () => {
    saveViewerPosition("proj::compile-preview", {
      pdfPage: 7,
      pdfScrollOffset: 1200,
    });
    expect(loadViewerPosition("proj::compile-preview")).toMatchObject({
      pdfPage: 7,
      pdfScrollOffset: 1200,
    });
  });

  it("merges partial updates without dropping earlier fields", () => {
    saveViewerPosition("file-a.tex", { cursorPos: 10, scrollTop: 400 });
    saveViewerPosition("file-a.tex", { scrollTop: 800 });
    expect(loadViewerPosition("file-a.tex")).toMatchObject({
      cursorPos: 10,
      scrollTop: 800,
    });
  });
});
