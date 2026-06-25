import { describe, expect, it } from "vitest";
import {
  SETTINGS_DETAIL_SPLIT_MIN,
  canSplitSettingsDetail,
  resolveSettingsDetailSplitWidth,
} from "@/lib/workspace/settings-detail-layout";

describe("settings-detail-layout", () => {
  it("requires list + detail minimum for split mode", () => {
    expect(SETTINGS_DETAIL_SPLIT_MIN).toBe(680);
    expect(canSplitSettingsDetail(679)).toBe(false);
    expect(canSplitSettingsDetail(680)).toBe(true);
  });

  it("clamps detail width so the list keeps its minimum", () => {
    expect(resolveSettingsDetailSplitWidth(900, 500)).toBe(500);
    expect(resolveSettingsDetailSplitWidth(700, 500)).toBe(300);
    expect(resolveSettingsDetailSplitWidth(680, 500)).toBe(280);
  });
});
