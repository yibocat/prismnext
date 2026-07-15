import { describe, expect, it } from "vitest";
import {
  computeEffectiveSidebarWidth,
  clampSidebarWidth,
  clampSidebarMax,
  clampSidebarDragPreviewWidth,
  isSidebarSqueezedByContainer,
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

  it("clamps effective width to sidebar max", () => {
    expect(computeEffectiveSidebarWidth(1200, 900)).toBe(520);
    expect(clampSidebarMax(900)).toBe(520);
  });

  it("hard-stops drag preview at min/max when already open", () => {
    expect(clampSidebarDragPreviewWidth(600, 320)).toBe(520);
    expect(clampSidebarDragPreviewWidth(250, 320)).toBe(280);
    expect(clampSidebarDragPreviewWidth(20, 320)).toBe(20);
  });

  it("allows sub-min drag preview when opening from collapsed", () => {
    expect(clampSidebarDragPreviewWidth(120, 0)).toBe(120);
    expect(clampSidebarDragPreviewWidth(250, 0)).toBe(250);
    expect(clampSidebarDragPreviewWidth(600, 0)).toBe(520);
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

  it("allows sub-min width while dragging open", () => {
    expect(computeEffectiveSidebarWidth(800, 120, 150, 30)).toBe(120);
    expect(computeEffectiveSidebarWidth(400, 120, 150, 30)).toBe(120);
    expect(computeEffectiveSidebarWidth(400, 320, 150, 30)).toBe(250);
  });

  it("clamps persisted drag width to sidebar min/max", () => {
    expect(clampSidebarWidth(100)).toBe(280);
    expect(clampSidebarWidth(320)).toBe(320);
    expect(clampSidebarWidth(900)).toBe(520);
  });

  it("detects container squeeze without overwriting stored preference", () => {
    expect(isSidebarSqueezedByContainer(300, 450, 320)).toBe(true);
    expect(isSidebarSqueezedByContainer(320, 600, 320)).toBe(false);
  });
});
