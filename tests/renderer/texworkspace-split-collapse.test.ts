import { describe, it, expect } from "vitest";
import {
  resolveTexworkspaceSplitCollapse,
  viewModeAfterPanelCollapse,
} from "../../src/renderer/modes/texworkspace-mode/texworkspace-main";

describe("resolveTexworkspaceSplitCollapse", () => {
  it("split keeps both open", () => {
    expect(resolveTexworkspaceSplitCollapse("split", false)).toEqual({
      leftCollapsed: false,
      rightCollapsed: false,
    });
  });

  it("tex collapses the PDF slot", () => {
    expect(resolveTexworkspaceSplitCollapse("tex", false)).toEqual({
      leftCollapsed: true,
      rightCollapsed: false,
    });
    expect(resolveTexworkspaceSplitCollapse("tex", true)).toEqual({
      leftCollapsed: false,
      rightCollapsed: true,
    });
  });
});

describe("viewModeAfterPanelCollapse", () => {
  it("maps sash collapse through swap", () => {
    expect(viewModeAfterPanelCollapse("left", false)).toBe("tex");
    expect(viewModeAfterPanelCollapse("right", false)).toBe("pdf");
    expect(viewModeAfterPanelCollapse("left", true)).toBe("pdf");
    expect(viewModeAfterPanelCollapse("right", true)).toBe("tex");
  });
});
