import { beforeEach, describe, expect, it, vi } from "vitest";

const expand = vi.fn();
const collapse = vi.fn();
const resize = vi.fn();
const isCollapsed = vi.fn(() => false);

const panelRefs = {
  centerRef: { current: { expand, collapse, resize, isCollapsed } },
  rightAreaRef: { current: { expand, collapse, resize, isCollapsed } },
};

let layoutState: {
  rightAreaExpanded: boolean;
  editorMaximized: boolean;
  focusedMode: string;
  activeModes: string[];
  setLeftSidebarView: ReturnType<typeof vi.fn>;
  activateMode: ReturnType<typeof vi.fn>;
  deactivateMode: ReturnType<typeof vi.fn>;
  setRightAreaExpanded: ReturnType<typeof vi.fn>;
  setEditorMaximized: ReturnType<typeof vi.fn>;
};

let panelState: {
  tabs: { id: string; kind: string; isInitial?: boolean }[];
  activeTabId: string | null;
  ensureTab: ReturnType<typeof vi.fn>;
  closeTabsOfKind: ReturnType<typeof vi.fn>;
  setActiveTab: ReturnType<typeof vi.fn>;
};

vi.mock("../../src/renderer/stores/layout-store", () => ({
  useLayoutStore: {
    getState: () => layoutState,
  },
}));

vi.mock("../../src/renderer/stores/right-panel-store", () => ({
  useRightPanelStore: {
    getState: () => panelState,
    setState: vi.fn(),
  },
}));

vi.mock("../../src/renderer/stores/literature-store", () => ({
  useLiteratureStore: {
    getState: () => ({ setLibrarySubview: vi.fn() }),
  },
}));

vi.mock("../../src/renderer/lib/workspace/right-area-layout", () => ({
  openRightArea: vi.fn(() => {
    layoutState.rightAreaExpanded = true;
    layoutState.editorMaximized = false;
  }),
  openRightAreaMaximized: vi.fn(() => {
    layoutState.rightAreaExpanded = true;
    layoutState.editorMaximized = true;
  }),
}));

vi.mock("../../src/renderer/lib/workspace/mode-registry", () => ({
  modeRegistry: {
    get: (id: string) => {
      if (id === "texworkspace") return { id, tabKinds: ["texworkspace"], onDeactivate: undefined };
      if (id === "literature") return { id, tabKinds: ["literature"], onDeactivate: undefined };
      if (id === "experiments") return { id, tabKinds: ["experiments"], onDeactivate: undefined };
      return undefined;
    },
  },
}));

import {
  dismissModeFromRightArea,
  focusModeInRightArea,
  openLiteratureSplit,
  openTexWorkspaceSplit,
} from "../../src/renderer/lib/workspace/left-nav/panel-utils";
import { openRightArea } from "../../src/renderer/lib/workspace/right-area-layout";

describe("parallel RightArea modes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    layoutState = {
      rightAreaExpanded: false,
      editorMaximized: false,
      focusedMode: "dashboard",
      activeModes: [],
      setLeftSidebarView: vi.fn(),
      activateMode: vi.fn((mode: string) => {
        if (!layoutState.activeModes.includes(mode)) {
          layoutState.activeModes = [...layoutState.activeModes, mode];
        }
        layoutState.focusedMode = mode;
      }),
      deactivateMode: vi.fn((mode: string) => {
        layoutState.activeModes = layoutState.activeModes.filter((m) => m !== mode);
        if (layoutState.focusedMode === mode) {
          layoutState.focusedMode =
            layoutState.activeModes[layoutState.activeModes.length - 1] ?? "dashboard";
        }
      }),
      setRightAreaExpanded: vi.fn((v: boolean) => {
        layoutState.rightAreaExpanded = v;
      }),
      setEditorMaximized: vi.fn((v: boolean) => {
        layoutState.editorMaximized = v;
      }),
    };

    panelState = {
      tabs: [],
      activeTabId: null,
      ensureTab: vi.fn((kind: string) => {
        const existing = panelState.tabs.find((t) => t.kind === kind);
        if (existing) {
          panelState.activeTabId = existing.id;
          return existing.id;
        }
        const id = `${kind}-1`;
        panelState.tabs = [...panelState.tabs, { id, kind, isInitial: true }];
        panelState.activeTabId = id;
        return id;
      }),
      closeTabsOfKind: vi.fn((kind: string, options?: { onClosed?: () => void }) => {
        panelState.tabs = panelState.tabs.filter((t) => t.kind !== kind);
        options?.onClosed?.();
      }),
      setActiveTab: vi.fn((id: string) => {
        panelState.activeTabId = id;
      }),
    };
  });

  it("keeps TeX tabs when opening Literature", () => {
    const ctx = { panelRefs };
    openTexWorkspaceSplit(ctx);
    openLiteratureSplit(ctx);

    expect(panelState.tabs.map((t) => t.kind)).toEqual([
      "texworkspace",
      "literature",
    ]);
    expect(layoutState.focusedMode).toBe("literature");
    expect(layoutState.rightAreaExpanded).toBe(true);
    expect(openRightArea).toHaveBeenCalled();
    expect(panelState.closeTabsOfKind).not.toHaveBeenCalled();
  });

  it("dismisses only the focused mode and keeps sibling tabs", () => {
    const ctx = { panelRefs };
    focusModeInRightArea("texworkspace", ctx);
    focusModeInRightArea("literature", ctx);

    dismissModeFromRightArea("literature", ctx);

    expect(panelState.tabs.map((t) => t.kind)).toEqual(["texworkspace"]);
    expect(layoutState.rightAreaExpanded).toBe(true);
    expect(collapse).not.toHaveBeenCalled();
  });

  it("collapses RightArea only when the last mode tab is dismissed", () => {
    const ctx = { panelRefs };
    focusModeInRightArea("texworkspace", ctx);
    dismissModeFromRightArea("texworkspace", ctx);

    expect(panelState.tabs).toHaveLength(0);
    expect(layoutState.setRightAreaExpanded).toHaveBeenCalledWith(false);
    expect(collapse).toHaveBeenCalled();
  });
});
