import { describe, expect, it } from "vitest";
import {
  formatPaperQuoteMarkdown,
  insertQuoteIntoNoteContent,
} from "@/lib/literature/insert-paper-quote";

describe("insert-paper-quote", () => {
  it("formats blockquote with page and bibkey", () => {
    const md = formatPaperQuoteMarkdown("Hello\nworld", 12, "vaswani2017");
    expect(md).toBe("> Hello\n> world\n\n— p.12 (@vaswani2017)\n");
  });

  it("inserts under ## Quotes section", () => {
    const note = [
      "# Title",
      "",
      "## Quotes",
      "",
      "## Other",
    ].join("\n");

    const quote = formatPaperQuoteMarkdown("A quote", 3, "key");
    const next = insertQuoteIntoNoteContent(note, quote);

    expect(next.indexOf("## Quotes")).toBeGreaterThan(-1);
    expect(next.indexOf("> A quote")).toBeGreaterThan(next.indexOf("## Quotes"));
    expect(next.indexOf("## Other")).toBeGreaterThan(next.indexOf("> A quote"));
  });

  it("appends at EOF when no Quotes section", () => {
    const note = "# Title\n\nBody";
    const quote = formatPaperQuoteMarkdown("Tail quote", 1, "k");
    const next = insertQuoteIntoNoteContent(note, quote);
    expect(next.endsWith("— p.1 (@k)\n")).toBe(true);
    expect(next.startsWith("# Title")).toBe(true);
  });
});
