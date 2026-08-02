import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import ReactMarkdown from "react-markdown";
import { remarkCitationRefs } from "../../src/renderer/lib/markdown/remark-citation-refs";
import { useCitationStagingStore } from "../../src/renderer/stores/citation-staging-store";
import { StaticMarkdown } from "../../src/renderer/components/modules/chat/static-markdown";

function RenderMarkdown({
  content,
  stagedRefIds = new Set([1, 2, 3]),
}: {
  content: string;
  stagedRefIds?: ReadonlySet<number>;
}) {
  return (
    <ReactMarkdown
      remarkPlugins={[[remarkCitationRefs, { stagedRefIds }]]}
      urlTransform={(url) => url}
    >
      {content}
    </ReactMarkdown>
  );
}

describe("remarkCitationRefs", () => {
  beforeEach(() => {
    useCitationStagingStore.getState().clearAll();
  });

  it("StaticMarkdown renders clickable citation when session has ref", () => {
    const sessionId = "chat-sess-1";
    useCitationStagingStore.getState().upsertFromStageResult(sessionId, {
      staged: true,
      verified: true,
      refId: 1,
      citation: {
        title: "Test Paper",
        authors: null,
        year: 2024,
        venue: "arXiv",
        type: "article",
        doi: null,
        arxivId: "2405.00133",
        abstract: null,
        cslJson: null,
        sourceUrl: null,
        catalogSource: "arxiv",
        catalogVerified: true,
        verifyError: null,
        discoveredFrom: "agent",
        libraryPaperId: null,
        libraryBibkey: null,
      },
    });
    render(<StaticMarkdown content="See paper [1] here." sessionId={sessionId} />);
    const btn = screen.getByRole("button", { name: "[1]" });
    expect(btn).toBeTruthy();
  });

  it("StaticMarkdown without sessionId renders plain [n] text", () => {
    render(<StaticMarkdown content="See paper [1] here." />);
    expect(screen.queryByRole("button", { name: "[1]" })).toBeNull();
    expect(screen.getByText(/See paper \[1\] here\./)).toBeTruthy();
  });

  it("StaticMarkdown with session but no staged refs renders plain [n] text", () => {
    render(<StaticMarkdown content="See paper [1] here." sessionId="empty-sess" />);
    expect(screen.queryByRole("button", { name: "[1]" })).toBeNull();
    expect(screen.getByText(/See paper \[1\] here\./)).toBeTruthy();
  });

  it("turns staged [n] into a link node with citation: scheme", () => {
    const { container } = render(<RenderMarkdown content="see [1] for details" />);
    const link = container.querySelector('a[href^="citation:"]');
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toBe("citation:1");
    expect(link?.textContent).toBe("[1]");
    expect(container.textContent).toContain("see ");
    expect(container.textContent).toContain(" for details");
  });

  it("leaves unstaged [n] as plain text", () => {
    const { container } = render(
      <RenderMarkdown content="see [9] for details" stagedRefIds={new Set([1])} />,
    );
    expect(container.querySelector('a[href^="citation:"]')).toBeNull();
    expect(container.textContent).toContain("[9]");
  });

  it("transforms staged [n] inside table cells", () => {
    const md = "| # | Title |\n| --- | --- |\n| [1] | Foo |";
    const { container } = render(<RenderMarkdown content={md} stagedRefIds={new Set([1])} />);
    const links = container.querySelectorAll('a[href^="citation:"]');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe("citation:1");
  });

  it("transforms staged [n] inside list items", () => {
    const md = "- [1] first\n- [2] second";
    const { container } = render(<RenderMarkdown content={md} />);
    expect(container.querySelectorAll('a[href^="citation:"]')).toHaveLength(2);
  });

  it("does not touch [n] inside inline code or real links", () => {
    const md = "code: `[1]` and [real link](https://example.com) and [2]";
    const { container } = render(<RenderMarkdown content={md} stagedRefIds={new Set([2])} />);
    const citationLinks = container.querySelectorAll('a[href^="citation:"]');
    expect(citationLinks).toHaveLength(1);
    expect(citationLinks[0].getAttribute("href")).toBe("citation:2");
    const realLink = container.querySelector('a[href="https://example.com"]');
    expect(realLink).not.toBeNull();
  });

  it("does not turn [n](url) into citation links", () => {
    const { container } = render(
      <RenderMarkdown content="See [2](https://example.com)" stagedRefIds={new Set([2])} />,
    );
    expect(container.querySelectorAll('a[href^="citation:"]')).toHaveLength(0);
    expect(container.querySelector('a[href="https://example.com"]')).not.toBeNull();
  });

  it("no-ops when stagedRefIds is empty", () => {
    const { container } = render(
      <RenderMarkdown content="refs [1], [2] and [3]" stagedRefIds={new Set()} />,
    );
    expect(container.querySelectorAll('a[href^="citation:"]')).toHaveLength(0);
  });

  it("transforms multiple staged refs in one paragraph", () => {
    const { container } = render(
      <RenderMarkdown content="refs [1], [2] and [3]" />,
    );
    expect(container.querySelectorAll('a[href^="citation:"]')).toHaveLength(3);
  });
});
