import { describe, expect, it } from "vitest";
import {
  aiMetadataFingerprint,
  parseAiMetadataLlmJson,
} from "../../src/shared/literature-ai-metadata";

describe("literature-ai-metadata", () => {
  it("fingerprint changes when abstract or pdf_sha changes", () => {
    const a = aiMetadataFingerprint({
      abstractText: "foo",
      pdfSha: "abc",
      model: "openai/gpt-4o-mini",
    });
    const b = aiMetadataFingerprint({
      abstractText: "bar",
      pdfSha: "abc",
      model: "openai/gpt-4o-mini",
    });
    expect(a).not.toBe(b);
  });

  it("parses LLM JSON", () => {
    expect(
      parseAiMetadataLlmJson(
        '{"summary":"A short summary.","keywords":["world models","planning"]}',
      ),
    ).toEqual({
      summary: "A short summary.",
      keywords: ["world models", "planning"],
    });
  });
});
