import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ReactMarkdown from "react-markdown";
import { remarkLibraryCiteRefs } from "../../src/renderer/lib/markdown/remark-library-cite-refs";
import { StaticMarkdown } from "../../src/renderer/components/modules/chat/static-markdown";
import { useLiteratureStore } from "../../src/renderer/stores/literature-store";

vi.mock("@/stores/document-store", () => ({
  useDocumentStore: (selector: (s: { projectRoot: string; files: { relativePath: string }[]; folders: string[] }) => unknown) =>
    selector({ projectRoot: "", files: [], folders: [] }),
}));

function RenderMarkdown({
  content,
  knownBibkeys,
}: {
  content: string;
  knownBibkeys?: Set<string>;
}) {
  const plugins = knownBibkeys?.size
    ? [[remarkLibraryCiteRefs, { knownBibkeys }] as const]
    : [remarkLibraryCiteRefs];
  return (
    <ReactMarkdown remarkPlugins={plugins} urlTransform={(url) => url}>
      {content}
    </ReactMarkdown>
  );
}

describe("remarkLibraryCiteRefs", () => {
  beforeEach(() => {
    useLiteratureStore.setState({
      papers: [
        {
          id: "paper-1",
          bibkey: "smith2024",
          title: "World Models for RL",
          authors: JSON.stringify([{ family: "Smith", given: "A." }]),
          year: 2024,
          abstract: "We study world models.",
          venue: "NeurIPS",
          type: "article",
          doi: null,
          arxiv_id: null,
          isbn: null,
          pdf_path: "/tmp/paper.pdf",
          pdf_sha: null,
          origin: "catalog",
          metadata_source: "crossref",
          csl_json: null,
          source: null,
          raw_bibtex: null,
          zotero_key: null,
          zotero_version: null,
          zotero_attach_key: null,
          tags: [],
          created_at: 1,
          updated_at: 1,
        },
      ],
    } as Partial<ReturnType<typeof useLiteratureStore.getState>>);
  });

  it("turns [@bibkey] into a link node with library-cite: scheme", () => {
    const known = new Set(["smith2024"]);
    const { container } = render(
      <RenderMarkdown content="See [@smith2024] for details" knownBibkeys={known} />,
    );
    const link = container.querySelector('a[href^="library-cite:"]');
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toBe("library-cite:smith2024");
    expect(link?.textContent).toBe("[@smith2024]");
  });

  it("normalizes whitespace inside bracketed cites", () => {
    const known = new Set(["smith2024"]);
    const { container } = render(
      <RenderMarkdown content="See [ @ smith2024 ] for details" knownBibkeys={known} />,
    );
    const link = container.querySelector('a[href^="library-cite:"]');
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toBe("library-cite:smith2024");
    expect(link?.textContent).toBe("[@smith2024]");
  });

  it("links bare @bibkey when key is in the library", () => {
    const known = new Set(["smith2024"]);
    const { container } = render(
      <RenderMarkdown content="See @smith2024 for details" knownBibkeys={known} />,
    );
    const link = container.querySelector('a[href^="library-cite:"]');
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toBe("library-cite:smith2024");
    expect(link?.textContent).toBe("@smith2024");
  });

  it("does not link bare @expert mentions", () => {
    const known = new Set(["smith2024"]);
    const { container } = render(
      <RenderMarkdown content="Delegate to @library-scout please" knownBibkeys={known} />,
    );
    expect(container.querySelector('a[href^="library-cite:"]')).toBeNull();
  });

  it("links inline-code bibkeys from the library", () => {
    const known = new Set(["smith2024"]);
    const { container } = render(
      <RenderMarkdown content="Key `smith2024` in backticks" knownBibkeys={known} />,
    );
    const link = container.querySelector('a[href^="library-cite:"]');
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toBe("library-cite:smith2024");
  });

  it("does not touch [@key] inside inline code", () => {
    const known = new Set(["jones2023"]);
    const { container } = render(
      <RenderMarkdown content="code: `[@smith2024]` and [@jones2023]" knownBibkeys={known} />,
    );
    const links = container.querySelectorAll('a[href^="library-cite:"]');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe("library-cite:jones2023");
  });

  it("matches arXiv-style bibkeys that start with digits", () => {
    const known = new Set(["2604_16565v2", "2605_26379v1"]);
    const { container } = render(
      <RenderMarkdown content="See [@2604_16565v2] and [@2605_26379v1]" knownBibkeys={known} />,
    );
    const links = container.querySelectorAll('a[href^="library-cite:"]');
    expect(links).toHaveLength(2);
    expect(links[0].getAttribute("href")).toBe("library-cite:2604_16565v2");
    expect(links[1].getAttribute("href")).toBe("library-cite:2605_26379v1");
  });

  it("turns [@bibkey|images/fig.png] into library-figure link", () => {
    const { container } = render(
      <RenderMarkdown content="See [@smith2024|images/fig-0.png] for the plot." />,
    );
    const link = container.querySelector('a[href^="library-figure:"]');
    expect(link).toBeTruthy();
    expect(link?.textContent).toBe("[@smith2024|images/fig-0.png]");
  });

  it("StaticMarkdown renders literature cite chip (hover opens preview, no click-to-open)", () => {
    render(<StaticMarkdown content="Prior work [@smith2024] shows this." />);
    const chip = screen.getByText("smith2024").closest("[data-inline-token='literature']");
    expect(chip).toBeTruthy();
    expect(screen.queryByRole("button", { name: "smith2024" })).toBeNull();
    expect(screen.queryByText("Open in library")).toBeNull();
  });

  it("StaticMarkdown renders unknown bibkey chip", () => {
    render(<StaticMarkdown content="Maybe [@missing-key] exists." />);
    expect(screen.getByText("missing-key").closest("[data-inline-token='literature']")).toBeTruthy();
  });
});
