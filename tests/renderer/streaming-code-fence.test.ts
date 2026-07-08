import { describe, expect, it } from "vitest";
import {
  normalizeSingleLineCodeFences,
  parsePendingCodeFence,
} from "../../src/renderer/lib/markdown/streaming-code-fence";

describe("parsePendingCodeFence", () => {
  it("detects multi-line fence body", () => {
    expect(parsePendingCodeFence("```python\nprint(1)")).toEqual({
      inFence: true,
      lang: "python",
      code: "print(1)",
    });
  });

  it("detects same-line ```code``` while streaming", () => {
    expect(parsePendingCodeFence("```xxx```")).toEqual({
      inFence: true,
      lang: "",
      code: "xxx",
    });
  });

  it("detects partial same-line fence before closing backticks", () => {
    expect(parsePendingCodeFence("```xxx")).toEqual({
      inFence: true,
      lang: "",
      code: "xxx",
    });
  });

  it("returns plain pending when not in fence", () => {
    expect(parsePendingCodeFence("hello")).toEqual({
      inFence: false,
      lang: "",
      code: "hello",
    });
  });
});

describe("normalizeSingleLineCodeFences", () => {
  it("expands ```xxx``` to a GFM fenced block", () => {
    const out = normalizeSingleLineCodeFences("before\n```xxx```\nafter");
    expect(out).toContain("```\nxxx\n```");
    expect(out).not.toMatch(/```xxx```/);
  });
});
