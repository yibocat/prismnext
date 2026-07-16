import { describe, expect, it } from "vitest";
import {
  EXPERIMENT_RUN_CONFIRM_TIMEOUT_MS,
  PERMISSION_TIMEOUT_MS,
  PERMISSION_UI_TIMEOUT_MS,
} from "../../src/shared/permission-timeouts";

describe("permission-timeouts (shared)", () => {
  it("keeps ACP/chat UI timeouts identical at 120s", () => {
    expect(PERMISSION_TIMEOUT_MS).toBe(120_000);
    expect(PERMISSION_UI_TIMEOUT_MS).toBe(PERMISSION_TIMEOUT_MS);
  });

  it("keeps Experiments run-confirm shorter than ACP (60s) by design", () => {
    expect(EXPERIMENT_RUN_CONFIRM_TIMEOUT_MS).toBe(60_000);
    expect(EXPERIMENT_RUN_CONFIRM_TIMEOUT_MS).toBeLessThan(PERMISSION_TIMEOUT_MS);
  });
});
