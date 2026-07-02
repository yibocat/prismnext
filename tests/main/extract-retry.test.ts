import { describe, expect, it } from "vitest";
import {
  EXTRACT_MAX_AUTO_RETRIES,
  extractRetryDelayMs,
} from "../../src/shared/paper-extract";

describe("extractRetryDelayMs", () => {
  it("uses exponential backoff from 30s base", () => {
    expect(extractRetryDelayMs(1)).toBe(30_000);
    expect(extractRetryDelayMs(2)).toBe(60_000);
    expect(extractRetryDelayMs(3)).toBe(120_000);
  });

  it("caps auto retries constant", () => {
    expect(EXTRACT_MAX_AUTO_RETRIES).toBe(3);
  });
});
