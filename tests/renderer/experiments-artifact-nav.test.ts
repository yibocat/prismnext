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

  it("leaves project-relative paths unchanged", () => {
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
  it("filters to images and prefixes workspace", () => {
    expect(
      resolveImageArtifactPaths(
        ["results/loss.png", "results/metrics.json", "fig.jpg"],
        "labs/exp-a",
      ),
    ).toEqual(["labs/exp-a/results/loss.png", "labs/exp-a/fig.jpg"]);
  });
});
