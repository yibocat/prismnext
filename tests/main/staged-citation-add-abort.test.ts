import { describe, it, expect } from "vitest";
import {
  beginStagedCitationAdd,
  cancelStagedCitationAdd,
  endStagedCitationAdd,
  hasPendingStagedCitationAddCancel,
} from "../../src/main/services/staged-citation-add-abort";

describe("staged-citation-add-abort", () => {
  it("cancels an in-flight add via AbortSignal", () => {
    const signal = beginStagedCitationAdd("staged-1");
    cancelStagedCitationAdd("staged-1");
    expect(signal.aborted).toBe(true);
  });

  it("records pending cancel when no controller exists yet", () => {
    cancelStagedCitationAdd("staged-pending");
    expect(hasPendingStagedCitationAddCancel("staged-pending")).toBe(true);
    const signal = beginStagedCitationAdd("staged-pending");
    expect(hasPendingStagedCitationAddCancel("staged-pending")).toBe(false);
    expect(signal.aborted).toBe(false);
  });

  it("endStagedCitationAdd allows a fresh begin after completion", () => {
    const first = beginStagedCitationAdd("staged-retry");
    endStagedCitationAdd("staged-retry");
    cancelStagedCitationAdd("staged-retry");
    const second = beginStagedCitationAdd("staged-retry");
    expect(first.aborted).toBe(false);
    expect(second.aborted).toBe(false);
  });
});
