import { describe, expect, it } from "vitest";
import {
  assistantTextEmbedsArtifactPath,
  artifactPathMatchesAny,
  buildArtifactFallbackMarkdown,
  buildArtifactFenceMarkdown,
  classifyArtifactKind,
  presentOutcomeResource,
  collapseVisualArtifactPaths,
  parseArtifactFenceContent,
  resolveToolCardGalleryPaths,
  CHAT_ARTIFACT_AUTO_CAP,
} from "../../src/renderer/lib/markdown/chat-artifact";

describe("parseArtifactFenceContent", () => {
  it("reads path and title", () => {
    expect(
      parseArtifactFenceContent("path: papers/out/t.csv\ntitle: Main table\n"),
    ).toEqual({ path: "papers/out/t.csv", title: "Main table" });
  });

  it("uses first bare line as path", () => {
    expect(parseArtifactFenceContent("figs/a.png\n")).toEqual({
      path: "figs/a.png",
      title: undefined,
    });
  });

  it("rejects empty or parent traversal", () => {
    expect(parseArtifactFenceContent("")).toBeNull();
    expect(parseArtifactFenceContent("path: ../secret.png")).toBeNull();
  });
});

describe("classifyArtifactKind", () => {
  it("classifies images, pdf, and generic", () => {
    expect(classifyArtifactKind("a.png")).toBe("image");
    expect(classifyArtifactKind("out/report.PDF")).toBe("pdf");
    expect(classifyArtifactKind("a.CSV")).toBe("generic");
    expect(classifyArtifactKind("metrics.json")).toBe("generic");
  });
});

describe("presentOutcomeResource", () => {
  it("presents files by kind and Interaction as its own card", () => {
    expect(presentOutcomeResource({ type: "file", path: "fig.pdf" })).toBe("preview");
    expect(presentOutcomeResource({ type: "file", path: "out.csv" })).toBe("chip");
    expect(presentOutcomeResource({ type: "entity", system: "interaction", id: "loss-curve" })).toBe("card");
    expect(presentOutcomeResource({ type: "entity", system: "experiment", id: "exp-1" })).toBe("skip");
  });
});

describe("assistantTextEmbedsArtifactPath", () => {
  it("detects fence and markdown image", () => {
    const path = "manuscript/fig.png";
    expect(
      assistantTextEmbedsArtifactPath(
        "```artifact\npath: manuscript/fig.png\ntitle: x\n```",
        path,
      ),
    ).toBe(true);
    expect(assistantTextEmbedsArtifactPath(`![x](${path})`, path)).toBe(true);
    expect(assistantTextEmbedsArtifactPath("see manuscript/fig.png", path)).toBe(false);
    expect(
      assistantTextEmbedsArtifactPath("PNG: [lstm-cell.png](figures/lstm-cell.png)", path),
    ).toBe(false);
    expect(
      assistantTextEmbedsArtifactPath(
        "PNG: [lstm-cell.png](manuscript/fig.png)",
        path,
      ),
    ).toBe(true);
    expect(assistantTextEmbedsArtifactPath("见 `manuscript/fig.png`", path)).toBe(true);
  });

  it("treats same basename as embedded (working path vs snapshot)", () => {
    expect(
      assistantTextEmbedsArtifactPath(
        "```artifact\npath: manuscript/fig.png\ntitle: x\n```",
        ".workbench/experiments/e1/artifacts/r1/fig.png",
      ),
    ).toBe(true);
  });
});

describe("resolveToolCardGalleryPaths", () => {
  it("filters suppressed paths and caps overflow", () => {
    const paths = ["a.png", "b.csv", "c.json", "d.pdf", "e.png", "f.csv"];
    const { paths: visible, overflow } = resolveToolCardGalleryPaths(paths, [
      "other/a.png",
    ]);
    expect(visible).toEqual(["b.csv", "c.json", "d.pdf", "e.png", "f.csv"]);
    expect(overflow).toBe(0);
    expect(artifactPathMatchesAny("x/a.png", ["y/a.png"])).toBe(true);
    expect(artifactPathMatchesAny("figures/cell.pdf", ["figures/cell.png"])).toBe(true);
    expect(artifactPathMatchesAny("figures/cell.pdf", ["figures/other.png"])).toBe(false);
  });

  it("reports overflow past cap", () => {
    const paths = Array.from({ length: 7 }, (_, i) => `f${i}.csv`);
    const { paths: visible, overflow } = resolveToolCardGalleryPaths(paths, []);
    expect(visible).toHaveLength(CHAT_ARTIFACT_AUTO_CAP);
    expect(overflow).toBe(2);
  });
});

describe("buildArtifactFallbackMarkdown", () => {
  it("emits fences and caps overflow", () => {
    const paths = Array.from({ length: CHAT_ARTIFACT_AUTO_CAP + 2 }, (_, i) => `out/f${i}.csv`);
    const md = buildArtifactFallbackMarkdown(paths);
    expect(md).toContain("```artifact");
    expect(md).toContain("path: out/f0.csv");
    expect(md.match(/```artifact/g)?.length).toBe(CHAT_ARTIFACT_AUTO_CAP);
    expect(md).toContain("另有 2 个文件");
  });

  it("buildArtifactFenceMarkdown shape", () => {
    expect(buildArtifactFenceMarkdown("a/b.csv", "T")).toBe(
      ["```artifact", "path: a/b.csv", "title: T", "```"].join("\n"),
    );
  });
});

describe("collapseVisualArtifactPaths", () => {
  it("collapses same figure across formats to the image", () => {
    expect(
      collapseVisualArtifactPaths(["out/fig.pdf", "out/fig.png"]),
    ).toEqual(["out/fig.png"]);
    // order-independent: PDF listed after the image still collapses away
    expect(
      collapseVisualArtifactPaths(["out/fig.png", "out/fig.pdf"]),
    ).toEqual(["out/fig.png"]);
  });

  it("prefers the frozen snapshot over the working path", () => {
    expect(
      collapseVisualArtifactPaths([
        "experiments/e1/fig.svg",
        ".workbench/experiments/e1/artifacts/run-1/fig.svg",
      ]),
    ).toEqual([".workbench/experiments/e1/artifacts/run-1/fig.svg"]);
  });

  it("keeps non-visual files even when the stem matches a figure", () => {
    expect(
      collapseVisualArtifactPaths(["out/results.csv", "out/results.png"]),
    ).toEqual(["out/results.csv", "out/results.png"]);
  });

  it("keeps distinct figures in first-seen order", () => {
    expect(
      collapseVisualArtifactPaths(["a/fig1.png", "b/fig2.pdf", "c/fig1.svg"]),
    ).toEqual(["c/fig1.svg", "b/fig2.pdf"]);
  });

  it("dedupes exact paths and ignores case in the stem", () => {
    expect(
      collapseVisualArtifactPaths(["a/Fig.PNG", "a/Fig.PNG", "a/fig.pdf"]),
    ).toEqual(["a/Fig.PNG"]);
  });
});
