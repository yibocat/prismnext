import { describe, it, expect } from "vitest";
import {
  resolvePdfPreviewIsAssetFile,
  resolvePdfPreviewPersistKey,
} from "../../src/renderer/components/modules/preview/index";

describe("PdfPreview sourceMode", () => {
  it("compile mode ignores active .pdf asset tabs", () => {
    expect(resolvePdfPreviewIsAssetFile("compile", "figures/plot.pdf")).toBe(false);
    expect(resolvePdfPreviewIsAssetFile("auto", "figures/plot.pdf")).toBe(true);
    expect(resolvePdfPreviewIsAssetFile("auto", "main.tex")).toBe(false);
  });

  it("compile mode uses a stable project persist key", () => {
    expect(resolvePdfPreviewPersistKey("compile", "/proj", "figures/plot.pdf")).toBe(
      "/proj::compile-preview",
    );
    expect(resolvePdfPreviewPersistKey("auto", "/proj", "figures/plot.pdf")).toBe(
      "/proj::figures/plot.pdf",
    );
  });
});
