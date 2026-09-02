import { describe, expect, it } from "vitest";
import { mapConvertError } from "../../src/main/lib/anydoc/errors";
import {
  DOCUMENT_READ_MAX_OUTPUT_CHARS,
  filterMarkdownByQuery,
  mapConvertSuccess,
  truncateMarkdown,
} from "../../src/main/lib/anydoc/map";

describe("truncateMarkdown", () => {
  it("marks oversize bodies as truncated with a middle marker", () => {
    const huge = "a".repeat(DOCUMENT_READ_MAX_OUTPUT_CHARS + 4_000);
    const trimmed = truncateMarkdown(huge);
    expect(trimmed.truncated).toBe(true);
    expect(trimmed.text.length).toBe(DOCUMENT_READ_MAX_OUTPUT_CHARS);
    expect(trimmed.text.includes("[...content trimmed...]")).toBe(true);
  });

  it("leaves short bodies alone", () => {
    expect(truncateMarkdown("hello")).toEqual({ text: "hello", truncated: false });
  });
});

describe("filterMarkdownByQuery", () => {
  const sample = ["# Title", "alpha line", "beta UNIQUE_TOKEN here", "gamma", "tail"].join("\n");

  it("keeps matching lines plus one line of context", () => {
    const filtered = filterMarkdownByQuery(sample, "unique_token");
    expect(filtered.filtered).toBe(true);
    expect(filtered.text).toContain("UNIQUE_TOKEN");
    expect(filtered.text).toContain("alpha line");
    expect(filtered.text).toContain("gamma");
    expect(filtered.text).not.toContain("# Title");
  });

  it("returns a miss note when nothing matches", () => {
    const filtered = filterMarkdownByQuery(sample, "zzz-nope");
    expect(filtered.filtered).toBe(true);
    expect(filtered.text).toContain("No lines matched query");
  });

  it("is a no-op without a query", () => {
    expect(filterMarkdownByQuery(sample, undefined)).toEqual({ text: sample, filtered: false });
    expect(filterMarkdownByQuery(sample, "  ")).toEqual({ text: sample, filtered: false });
  });
});

describe("mapConvertSuccess", () => {
  it("applies truncation then query", () => {
    const mapped = mapConvertSuccess({
      path: "notes.docx",
      absPath: "/proj/notes.docx",
      format: "docx",
      markdown: "keep UNIQUE_DOCX_TOKEN\n" + "x".repeat(DOCUMENT_READ_MAX_OUTPUT_CHARS),
      query: "UNIQUE_DOCX_TOKEN",
    });
    expect(mapped.ok).toBe(true);
    expect(mapped.truncated).toBe(true);
    expect(mapped.filtered).toBe(true);
    expect(mapped.content).toContain("UNIQUE_DOCX_TOKEN");
  });
});

describe("mapConvertError", () => {
  it("maps AnyDoc error.code values", () => {
    expect(mapConvertError({ code: "encrypted", message: "encrypted ole" }).error).toBe(
      "password_protected",
    );
    expect(mapConvertError({ code: "needsOcr", message: "pages need OCR" }).error).toBe(
      "scanned_pdf_unsupported",
    );
    expect(mapConvertError({ code: "unsupported", message: "unrecognized" }).error).toBe(
      "unsupported_format",
    );
    expect(mapConvertError({ code: "io", message: "No such file or directory (os error 2)" }).error)
      .toBe("file_not_found");
    expect(mapConvertError({ code: "malformed", message: "broken zip" }).error).toBe(
      "anydoc_convert_failed",
    );
  });

  it("falls back to message heuristics", () => {
    expect(mapConvertError(new Error("password required")).error).toBe("password_protected");
    expect(mapConvertError(new Error("scanned pages need OCR")).error).toBe(
      "scanned_pdf_unsupported",
    );
    expect(mapConvertError(new Error("Cannot find native binding.")).error).toBe(
      "anydoc_unavailable",
    );
  });
});
