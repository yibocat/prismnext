import { describe, expect, it } from "vitest";
import {
  computeEffectiveSidebarWidth,
  shouldAutoCloseSplitSidebar,
  shouldExitFullMode,
  canAutoOpenSplitSidebar,
  RIGHT_AREA_SPLIT_THRESHOLD,
  RIGHT_AREA_SPLIT_RECOVER,
} from "@/lib/workspace/right-area-sidebar-layout";

describe("right-area-sidebar-layout", () => {
  it("clamps sidebar width as container narrows", () => {
    expect(computeEffectiveSidebarWidth(600, 320)).toBe(320);
    expect(computeEffectiveSidebarWidth(450, 320)).toBe(300);
    expect(computeEffectiveSidebarWidth(430, 320)).toBe(280);
  });

  it("auto-closes split mode below threshold but not full overlay", () => {
    expect(shouldAutoCloseSplitSidebar(RIGHT_AREA_SPLIT_THRESHOLD - 1, false)).toBe(true);
    expect(shouldAutoCloseSplitSidebar(RIGHT_AREA_SPLIT_THRESHOLD - 1, true)).toBe(false);
    expect(shouldAutoCloseSplitSidebar(RIGHT_AREA_SPLIT_THRESHOLD + 10, false)).toBe(false);
  });

  it("uses hysteresis for recovering split layout", () => {
    expect(shouldExitFullMode(RIGHT_AREA_SPLIT_RECOVER - 1)).toBe(false);
    expect(shouldExitFullMode(RIGHT_AREA_SPLIT_RECOVER)).toBe(true);
    expect(canAutoOpenSplitSidebar(RIGHT_AREA_SPLIT_RECOVER)).toBe(true);
  });
});
