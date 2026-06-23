import { describe, expect, it } from "vitest";
import { appendRingBuffer, DEFAULT_CAP_BYTES } from "@/lib/terminal/ring-buffer";

describe("ring-buffer", () => {
  it("appends within cap", () => {
    expect(appendRingBuffer("ab", "cd")).toBe("abcd");
  });

  it("truncates from the front when exceeding cap", () => {
    const prev = "a".repeat(DEFAULT_CAP_BYTES);
    const next = appendRingBuffer(prev, "END");
    expect(next.length).toBeLessThanOrEqual(DEFAULT_CAP_BYTES);
    expect(next.endsWith("END")).toBe(true);
  });
});
