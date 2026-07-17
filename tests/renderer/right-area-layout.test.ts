import { describe, expect, it, vi, beforeEach } from "vitest";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { useLayoutStore } from "@/stores/layout-store";
import {
  computeCanSplitRightArea,
  deriveRightAreaVisualState,
  measureMainAreaWidthPx,
  openRightArea,
  closeRightArea,
  toggleRightAreaMaximize,
  reconcileRightAreaOnMainAreaResize,
} from "@/lib/workspace/right-area-layout";
import { RESIZE_FILL_PX } from "@/lib/workspace/layout-constants";

function mockPanel(state: { px: number; collapsed: boolean }): PanelImperativeHandle {
  return {
    collapse: vi.fn(() => {
      state.collapsed = true;
      state.px = 0;
    }),
    expand: vi.fn(() => {
      state.collapsed = false;
    }),
    resize: vi.fn((n: number) => {
      state.px = n;
      state.collapsed = n < 30;
    }),
    getSize: vi.fn(() => ({ inPixels: state.px })),
    isCollapsed: vi.fn(() => state.collapsed),
  } as unknown as PanelImperativeHandle;
}

describe("right-area-layout", () => {
  beforeEach(() => {
    useLayoutStore.setState({
      rightAreaExpanded: false,
      editorMaximized: false,
      rightAreaWidth: 500,
      leftSidebarView: "sessions",
    });
    vi.stubGlobal("innerWidth", 1400);
  });

  it("deriveRightAreaVisualState", () => {
    expect(deriveRightAreaVisualState(false, false)).toBe("closed");
    expect(deriveRightAreaVisualState(true, false)).toBe("split");
    expect(deriveRightAreaVisualState(true, true)).toBe("maximize");
  });

  it("computeCanSplitRightArea respects 720px main-area floor", () => {
    vi.stubGlobal("innerWidth", 1000);
    const left = mockPanel({ px: 280, collapsed: false });
    expect(computeCanSplitRightArea(left)).toBe(true);

    vi.stubGlobal("innerWidth", 700);
    expect(computeCanSplitRightArea(left)).toBe(false);
  });

  it("openRightArea uses split on wide window", () => {
    vi.stubGlobal("innerWidth", 1400);
    const center = mockPanel({ px: 900, collapsed: false });
    const right = mockPanel({ px: 0, collapsed: true });
    openRightArea({ centerRef: center, rightAreaRef: right });
    const st = useLayoutStore.getState();
    expect(st.rightAreaExpanded).toBe(true);
    expect(st.editorMaximized).toBe(false);
    expect(right.resize).toHaveBeenCalledWith(500);
    expect(center.expand).toHaveBeenCalled();
  });

  it("openRightArea maximizes on narrow main-area", () => {
    vi.stubGlobal("innerWidth", 700);
    const left = mockPanel({ px: 0, collapsed: true });
    const center = mockPanel({ px: 700, collapsed: false });
    const right = mockPanel({ px: 0, collapsed: true });
    openRightArea({ centerRef: center, rightAreaRef: right, leftSidebarRef: left });
    const st = useLayoutStore.getState();
    expect(st.editorMaximized).toBe(true);
    expect(center.collapse).toHaveBeenCalled();
    expect(right.resize).toHaveBeenCalledWith(RESIZE_FILL_PX);
  });

  it("closeRightArea syncs store and panels", () => {
    useLayoutStore.setState({ rightAreaExpanded: true, editorMaximized: false, rightAreaWidth: 400 });
    const center = mockPanel({ px: 600, collapsed: false });
    const right = mockPanel({ px: 400, collapsed: false });
    closeRightArea({ centerRef: center, rightAreaRef: right });
    const st = useLayoutStore.getState();
    expect(st.rightAreaExpanded).toBe(false);
    expect(st.editorMaximized).toBe(false);
    expect(right.collapse).toHaveBeenCalled();
    expect(center.resize).toHaveBeenCalledWith(RESIZE_FILL_PX);
  });

  it("toggleRightAreaMaximize opens maximized when closed", () => {
    vi.stubGlobal("innerWidth", 1400);
    const center = mockPanel({ px: 900, collapsed: false });
    const right = mockPanel({ px: 0, collapsed: true });
    toggleRightAreaMaximize({ centerRef: center, rightAreaRef: right });
    const st = useLayoutStore.getState();
    expect(st.rightAreaExpanded).toBe(true);
    expect(st.editorMaximized).toBe(true);
    expect(center.collapse).toHaveBeenCalled();
    expect(right.resize).toHaveBeenCalledWith(RESIZE_FILL_PX);
  });

  it("toggleRightAreaMaximize restores split when maximized and wide enough", () => {
    vi.stubGlobal("innerWidth", 1400);
    useLayoutStore.setState({ rightAreaExpanded: true, editorMaximized: true, rightAreaWidth: 500 });
    const left = mockPanel({ px: 280, collapsed: false });
    const center = mockPanel({ px: 0, collapsed: true });
    const right = mockPanel({ px: 1100, collapsed: false });
    toggleRightAreaMaximize({
      centerRef: center,
      rightAreaRef: right,
      leftSidebarRef: left,
    });
    const st = useLayoutStore.getState();
    expect(st.rightAreaExpanded).toBe(true);
    expect(st.editorMaximized).toBe(false);
    expect(center.expand).toHaveBeenCalled();
    expect(right.resize).toHaveBeenCalledWith(500);
  });

  it("toggleRightAreaMaximize closes when narrow and already maximized", () => {
    vi.stubGlobal("innerWidth", 700);
    useLayoutStore.setState({ rightAreaExpanded: true, editorMaximized: true });
    const center = mockPanel({ px: 0, collapsed: true });
    const right = mockPanel({ px: 700, collapsed: false });
    toggleRightAreaMaximize({ centerRef: center, rightAreaRef: right });
    expect(useLayoutStore.getState().rightAreaExpanded).toBe(false);
  });

  it("reconcileRightAreaOnMainAreaResize closes split workspace when too narrow", () => {
    useLayoutStore.setState({ rightAreaExpanded: true, editorMaximized: false });
    vi.stubGlobal("innerWidth", 700);
    const center = mockPanel({ px: 400, collapsed: false });
    const right = mockPanel({ px: 300, collapsed: false });
    reconcileRightAreaOnMainAreaResize({ centerRef: center, rightAreaRef: right });
    const st = useLayoutStore.getState();
    expect(st.rightAreaExpanded).toBe(false);
    expect(st.editorMaximized).toBe(false);
    expect(right.collapse).toHaveBeenCalled();
    expect(center.resize).toHaveBeenCalledWith(RESIZE_FILL_PX);
  });

  it("reconcileRightAreaOnMainAreaResize keeps maximize when already maximized", () => {
    useLayoutStore.setState({ rightAreaExpanded: true, editorMaximized: true });
    vi.stubGlobal("innerWidth", 700);
    const center = mockPanel({ px: 0, collapsed: true });
    const right = mockPanel({ px: 700, collapsed: false });
    reconcileRightAreaOnMainAreaResize({ centerRef: center, rightAreaRef: right });
    const st = useLayoutStore.getState();
    expect(st.rightAreaExpanded).toBe(true);
    expect(st.editorMaximized).toBe(true);
    expect(center.collapse).toHaveBeenCalled();
    expect(right.resize).toHaveBeenCalledWith(RESIZE_FILL_PX);
  });

  it("measureMainAreaWidthPx subtracts inline left sidebar", () => {
    vi.stubGlobal("innerWidth", 1200);
    const left = mockPanel({ px: 280, collapsed: false });
    expect(measureMainAreaWidthPx(left)).toBe(920);
  });
});
