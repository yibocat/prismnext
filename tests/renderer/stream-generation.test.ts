import { describe, expect, it } from "vitest";
import { canClearStreamingForGeneration } from "@/lib/chat/stream-generation";

describe("canClearStreamingForGeneration", () => {
  it("allows clear when generation is unchanged", () => {
    expect(canClearStreamingForGeneration(3, 3)).toBe(true);
  });

  it("blocks clear after cancel / re-send bumped generation", () => {
    expect(canClearStreamingForGeneration(3, 4)).toBe(false);
    expect(canClearStreamingForGeneration(3, 5)).toBe(false);
  });
});
