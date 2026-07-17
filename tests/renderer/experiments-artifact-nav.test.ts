import { describe, expect, it } from "vitest";
import {
  artifactFullPath,
  isImageArtifactPath,
  resolveImageArtifactPaths,
} from "../../src/renderer/modes/experiments-mode/experiments-artifact-nav";

describe("artifactFullPath", () => {
  it("prefixes island workspace when path is island-relative", () => {
    expect(artifactFullPath("results/plot.png", "labs/exp-demo")).toBe(
      "labs/exp-demo/results/plot.png",
    );
  });

  it("leaves paths already under the workspace unchanged", () => {
    expect(artifactFullPath("labs/exp-demo/results/plot.png", "labs/exp-demo")).toBe(
      "labs/exp-demo/results/plot.png",
    );
  });
});

describe("isImageArtifactPath", () => {
  it("detects common image extensions", () => {
    expect(isImageArtifactPath("a.png")).toBe(true);
    expect(isImageArtifactPath("a.JPG")).toBe(true);
    expect(isImageArtifactPath("x/y/z.webp")).toBe(true);
    expect(isImageArtifactPath("results.csv")).toBe(false);
    expect(isImageArtifactPath("notes.md")).toBe(false);
  });
});

describe("resolveImageArtifactPaths", () => {
  it("keeps paths with directories as-declared; joins bare filenames", () => {
    expect(
      resolveImageArtifactPaths(
        ["results/loss.png", "results/metrics.json", "fig.jpg", "manuscript/out.png"],
        "labs/exp-a",
      ),
    ).toEqual(["results/loss.png", "labs/exp-a/fig.jpg", "manuscript/out.png"]);
  });
});
