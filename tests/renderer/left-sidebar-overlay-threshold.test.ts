import { describe, expect, it } from "vitest";
import {
  MAIN_AREA_MIN,
  SIDEBAR_LEFT_MIN,
  SIDEBAR_OVERLAY_THRESHOLD,
} from "@/styles/constants";

describe("SIDEBAR_OVERLAY_THRESHOLD", () => {
  it("is at least sidebar + main minSizes so inline expand cannot break the panel group", () => {
    // Window widths in [old 500, 680) used to expand inline while
    // SIDEBAR_LEFT_MIN + MAIN_AREA_MIN > available width → layout collapse.
    expect(SIDEBAR_OVERLAY_THRESHOLD).toBeGreaterThanOrEqual(
      SIDEBAR_LEFT_MIN + MAIN_AREA_MIN,
    );
  });
});
