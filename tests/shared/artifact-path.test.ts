import { describe, expect, it } from "vitest";
import {
  artifactPathCandidates,
  chatImagePathCandidates,
  imagePathsForRunDisplay,
  isPdfArtifactPath,
  normalizeRunArtifactPaths,
  resolveImageArtifactPathsForDisplay,
  toProjectRelativeArtifact,
} from "../../src/shared/artifact-path";

describe("isPdfArtifactPath", () => {
  it("detects pdf extension", () => {
    expect(isPdfArtifactPath("out/report.pdf")).toBe(true);
    expect(isPdfArtifactPath("X.PDF")).toBe(true);
    expect(isPdfArtifactPath("out/report.png")).toBe(false);
  });
});

describe("toProjectRelativeArtifact", () => {
  it("joins under workspace when not already prefixed (island-relative default)", () => {
    expect(toProjectRelativeArtifact("results/plot.png", "labs/exp-a")).toBe(
      "labs/exp-a/results/plot.png",
    );
    expect(toProjectRelativeArtifact("plot.png", "labs/exp-a")).toBe("labs/exp-a/plot.png");
  });

  it("leaves paths already under the workspace unchanged", () => {
    expect(toProjectRelativeArtifact("labs/exp-a/results/plot.png", "labs/exp-a")).toBe(
      "labs/exp-a/results/plot.png",
    );
  });
});

describe("artifactPathCandidates", () => {
  it("only offers as-declared and workspace-joined forms", () => {
    expect(artifactPathCandidates("results/plot.png", "labs/exp-a")).toEqual([
      "results/plot.png",
      "labs/exp-a/results/plot.png",
    ]);
    expect(artifactPathCandidates("anywhere/deep/fig.png", "labs/exp-a")).toEqual([
      "anywhere/deep/fig.png",
      "labs/exp-a/anywhere/deep/fig.png",
    ]);
  });
});

describe("chatImagePathCandidates", () => {
  it("merges workspace hints for lab-relative embeds", () => {
    const c = chatImagePathCandidates("results/plot.png", ["labs/exp-a"]);
    expect(c).toContain("results/plot.png");
    expect(c).toContain("labs/exp-a/results/plot.png");
  });
});

describe("resolveImageArtifactPathsForDisplay", () => {
  it("keeps manuscript paths as-declared", () => {
    expect(
      resolveImageArtifactPathsForDisplay(["manuscript/foo.png"], "experiment/exp-a"),
    ).toEqual(["manuscript/foo.png"]);
  });

  it("joins bare filenames under workspace", () => {
    expect(resolveImageArtifactPathsForDisplay(["plot.png"], "labs/exp-a")).toEqual([
      "labs/exp-a/plot.png",
    ]);
  });
});

describe("imagePathsForRunDisplay", () => {
  it("prefers snapshots when present", () => {
    expect(
      imagePathsForRunDisplay({
        artifacts: ["manuscript/foo.png"],
        artifactSnapshots: [".workbench/experiments/e/artifacts/r/foo.png"],
      }),
    ).toEqual([".workbench/experiments/e/artifacts/r/foo.png"]);
  });
});

describe("normalizeRunArtifactPaths", () => {
  it("prefers as-declared when that file exists (any folder)", () => {
    const existing = new Set(["papers/out/benchmark.png"]);
    expect(
      normalizeRunArtifactPaths(["papers/out/benchmark.png"], {
        workspacePath: "labs/exp-a",
        existsProjectRel: (rel) => existing.has(rel),
      }),
    ).toEqual(["papers/out/benchmark.png"]);
  });

  it("prefers workspace join when only the island path exists", () => {
    const existing = new Set(["labs/exp-a/results/plot.png"]);
    expect(
      normalizeRunArtifactPaths(["results/plot.png"], {
        workspacePath: "labs/exp-a",
        existsProjectRel: (rel) => existing.has(rel),
      }),
    ).toEqual(["labs/exp-a/results/plot.png"]);
  });

  it("uses basename search when structural candidates miss", () => {
    expect(
      normalizeRunArtifactPaths(["benchmark.png"], {
        workspacePath: "labs/exp-a",
        existsProjectRel: () => false,
        findByBasename: (base) =>
          base === "benchmark.png" ? "papers/figures/benchmark.png" : null,
      }),
    ).toEqual(["papers/figures/benchmark.png"]);
  });

  it("falls back to island join when nothing exists yet", () => {
    expect(
      normalizeRunArtifactPaths(["results/plot.png"], {
        workspacePath: "labs/exp-a",
        existsProjectRel: () => false,
      }),
    ).toEqual(["labs/exp-a/results/plot.png"]);
  });
});
