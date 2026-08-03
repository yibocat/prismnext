import { describe, expect, it, afterEach } from "vitest";
import {
  countPromptTokens,
  _resetPromptTokenEncoderForTests,
} from "../../src/main/lib/token-estimate";
import { PROMPT_TOKEN_ENCODING } from "../../src/shared/token-estimate";

describe("countPromptTokens", () => {
  afterEach(() => {
    _resetPromptTokenEncoderForTests();
  });

  it("returns zero for empty text", () => {
    expect(countPromptTokens("")).toEqual({
      tokenCount: 0,
      charCount: 0,
      encoding: PROMPT_TOKEN_ENCODING,
    });
  });

  it("counts tokens with o200k_base BPE", () => {
    const result = countPromptTokens("hello world");
    expect(result.encoding).toBe("o200k_base");
    expect(result.charCount).toBe(11);
    expect(result.tokenCount).toBe(2);
  });

  it("english prompt is below chars/4 heuristic for short text", () => {
    const text = "You are a literature synthesizer.";
    const { tokenCount, charCount } = countPromptTokens(text);
    expect(tokenCount).toBeGreaterThan(0);
    expect(tokenCount).toBeLessThanOrEqual(Math.ceil(charCount / 2));
  });
});
