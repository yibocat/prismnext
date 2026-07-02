import { describe, it, expect } from "vitest";
import { stagedAddProgressLabel } from "../../src/renderer/lib/literature/staged-add-progress-label";

describe("stagedAddProgressLabel", () => {
  it("labels writing phase", () => {
    expect(
      stagedAddProgressLabel({
        stagedId: "s1",
        phase: "writing",
      }),
    ).toBe("Adding to library…");
  });

  it("includes batch prefix and download percent", () => {
    expect(
      stagedAddProgressLabel({
        stagedId: "s1",
        phase: "downloading-pdf",
        batchIndex: 2,
        batchTotal: 5,
        receivedBytes: 512_000,
        totalBytes: 1_024_000,
      }),
    ).toBe("2/5 · Downloading PDF · 50% (500 KB)");
  });
});
