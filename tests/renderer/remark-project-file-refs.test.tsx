import { describe, expect, it } from "vitest";
import {
  looksLikeProjectFileRef,
  decodeProjectFileHref,
  encodeProjectFileHref,
} from "../../src/renderer/lib/markdown/project-file-ref";
import { remarkProjectFileRefs } from "../../src/renderer/lib/markdown/remark-project-file-refs";
import { remarkExperimentRefs } from "../../src/renderer/lib/markdown/remark-experiment-refs";
import ReactMarkdown from "react-markdown";
import { render, screen } from "@testing-library/react";
import React from "react";
import { remarkLibraryCiteRefs } from "../../src/renderer/lib/markdown/remark-library-cite-refs";

const KNOWN = new Set([
  "notes/sine-regression-experiment.md",
  "out/metrics.csv",
  "out",
]);

describe("project-file-ref", () => {
  it("detects paths with file extensions", () => {
    expect(looksLikeProjectFileRef("notes/sine-regression-experiment.md")).toBe(true);
    expect(looksLikeProjectFileRef("out/metrics.csv")).toBe(true);
    expect(looksLikeProjectFileRef("main.tex")).toBe(true);
  });

  it("detects known project paths without requiring an extension", () => {
    expect(looksLikeProjectFileRef("notes/draft", KNOWN)).toBe(false);
    expect(looksLikeProjectFileRef("out", KNOWN)).toBe(true);
    expect(looksLikeProjectFileRef("out/", KNOWN)).toBe(true);
  });

  it("rejects slash paths without extension when not in project", () => {
    expect(looksLikeProjectFileRef("a/b")).toBe(false);
    expect(looksLikeProjectFileRef("x/y")).toBe(false);
    expect(looksLikeProjectFileRef("out/")).toBe(false);
  });

  it("rejects URLs and bare words", () => {
    expect(looksLikeProjectFileRef("https://example.com/a.md")).toBe(false);
    expect(looksLikeProjectFileRef("python")).toBe(false);
    expect(looksLikeProjectFileRef("smith2024")).toBe(false);
  });

  it("round-trips project-file href", () => {
    const href = encodeProjectFileHref("notes/foo bar.md");
    expect(decodeProjectFileHref(href)).toBe("notes/foo bar.md");
  });
});

describe("remarkProjectFileRefs", () => {
  function renderMd(
    content: string,
    opts?: { knownBibkeys?: Set<string>; knownProjectPaths?: Set<string> },
  ) {
    const plugins = [
      ...(opts?.knownBibkeys?.size
        ? ([[remarkLibraryCiteRefs, { knownBibkeys: opts.knownBibkeys }] as const] as const)
        : []),
      [remarkProjectFileRefs, { knownProjectPaths: opts?.knownProjectPaths }] as const,
      remarkExperimentRefs,
    ];
    return render(
      <ReactMarkdown remarkPlugins={plugins} urlTransform={(url) => url}>
        {content}
      </ReactMarkdown>,
    );
  }

  it("turns inline code paths into project-file links", () => {
    const { container } = renderMd("Edit `notes/report.md` next.");
    const link = container.querySelector('a[href^="project-file:"]');
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toBe(
      encodeProjectFileHref("notes/report.md"),
    );
    expect(link?.textContent).toBe("notes/report.md");
  });

  it("does not turn slash-only paths without extension into file links", () => {
    const { container } = renderMd("Ratio `a/b` is fine.");
    expect(container.querySelector('a[href^="project-file:"]')).toBeNull();
    expect(container.textContent).toContain("a/b");
  });

  it("prefers library bibkeys over file paths in backticks", () => {
    const known = new Set(["smith2024"]);
    const { container } = renderMd("See `smith2024` and `out/data.csv`.", {
      knownBibkeys: known,
    });
    const links = container.querySelectorAll("a");
    expect(links).toHaveLength(2);
    expect(links[0]?.getAttribute("href")).toBe("library-cite:smith2024");
    expect(links[1]?.getAttribute("href")).toBe(encodeProjectFileHref("out/data.csv"));
  });

  it("does not rewrite markdown project links into project-file links", () => {
    const { container } = renderMd("See [the report](notes/report.md).", {
      knownProjectPaths: new Set(["notes/report.md"]),
    });
    expect(container.querySelector('a[href^="project-file:"]')).toBeNull();
    const link = container.querySelector('a[href="notes/report.md"]');
    expect(link).not.toBeNull();
    expect(link?.textContent).toBe("the report");
  });

  it("turns experiment ids into experiment-ref links", () => {
    const { container } = renderMd("Run exp-20260707-lr-ablation-a3f2 again.");
    const link = container.querySelector('a[href^="experiment-ref:"]');
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toBe(
      "experiment-ref:exp-20260707-lr-ablation-a3f2",
    );
  });
});

describe("StaticMarkdown file chips", () => {
  it("renders project file inline chip from backticks", async () => {
    const { StaticMarkdown } = await import(
      "../../src/renderer/components/modules/chat/static-markdown"
    );
    render(<StaticMarkdown content="Open `notes/report.md` in the editor." />);
    expect(screen.getByRole("button", { name: "report.md" })).toBeTruthy();
  });
});
