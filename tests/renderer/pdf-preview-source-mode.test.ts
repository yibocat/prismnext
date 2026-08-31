import { describe, it, expect } from "vitest";
import {
  resolvePdfPreviewIsAssetFile,
  resolvePdfPreviewPersistKey,
} from "../../src/renderer/components/modules/preview/index";
import { compileArtifactCacheKey } from "../../src/shared/compile/artifact-key";

describe("PdfPreview sourceMode", () => {
  it("compile mode ignores active .pdf asset tabs", () => {
    expect(resolvePdfPreviewIsAssetFile("compile", "figures/plot.pdf")).toBe(false);
    expect(resolvePdfPreviewIsAssetFile("auto", "figures/plot.pdf")).toBe(true);
    expect(resolvePdfPreviewIsAssetFile("auto", "main.tex")).toBe(false);
  });

  it("compile mode persist key is the artifact cache key", () => {
    const cacheKey = compileArtifactCacheKey({
      projectRoot: "/proj",
      engine: "latex",
      route: "paper",
      compileRoot: "manuscript/main.tex",
    });
    expect(resolvePdfPreviewPersistKey("compile", "/proj", "figures/plot.pdf")).toBeUndefined();
    expect(resolvePdfPreviewPersistKey("compile", "/proj", "manuscript/main.tex", cacheKey)).toBe(
      cacheKey,
    );
    expect(resolvePdfPreviewPersistKey("auto", "/proj", "figures/plot.pdf")).toBe(
      "/proj::figures/plot.pdf",
    );
  });
});
