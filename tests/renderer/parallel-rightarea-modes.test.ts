import { beforeEach, describe, expect, it, vi } from "vitest";
import { focusedModeId } from "../../src/renderer/lib/workspace/modes-from-tabs";
import type { RightTab } from "../../src/renderer/lib/workspace/mode-registry";

let layoutState: {
  rightAreaExpanded: boolean;
  editorMaximized: boolean;
  setLeftSidebarView: ReturnType<typeof vi.fn>;
  revealRightSidebar: ReturnType<typeof vi.fn>;
  setRightAreaExpanded: ReturnType<typeof vi.fn>;
  setEditorMaximized: ReturnType<typeof vi.fn>;
};

let panelState: {
  tabs: RightTab[];
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
  openRightAreaForDeepLink: vi.fn(() => {
    if (!layoutState.rightAreaExpanded) {
      layoutState.rightAreaExpanded = true;
      layoutState.editorMaximized = false;
      return;
    }
    if (layoutState.editorMaximized) return;
  }),
  closeRightArea: vi.fn(() => {
    layoutState.rightAreaExpanded = false;
    layoutState.editorMaximized = false;
    layoutState.setRightAreaExpanded(false);
    layoutState.setEditorMaximized(false);
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
    findByTabKind: (kind: string) => {
      if (kind === "texworkspace") return { id: "texworkspace" };
      if (kind === "literature") return { id: "literature" };
      if (kind === "experiments") return { id: "experiments" };
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
import { closeRightArea, openRightAreaForDeepLink } from "../../src/renderer/lib/workspace/right-area-layout";

describe("parallel RightArea modes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    layoutState = {
      rightAreaExpanded: false,
      editorMaximized: false,
      setLeftSidebarView: vi.fn(),
      revealRightSidebar: vi.fn(),
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
        panelState.tabs = [
          ...panelState.tabs,
          { id, kind, title: kind, isInitial: true } as RightTab,
        ];
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
    openTexWorkspaceSplit();
    openLiteratureSplit();

    expect(panelState.tabs.map((t) => t.kind)).toEqual([
      "texworkspace",
      "literature",
    ]);
    expect(focusedModeId(panelState.tabs, panelState.activeTabId)).toBe("literature");
    expect(layoutState.rightAreaExpanded).toBe(true);
    expect(openRightAreaForDeepLink).toHaveBeenCalled();
    expect(panelState.closeTabsOfKind).not.toHaveBeenCalled();
  });

  it("dismisses only the focused mode and keeps sibling tabs", () => {
    focusModeInRightArea("texworkspace");
    focusModeInRightArea("literature");

    dismissModeFromRightArea("literature");

    expect(panelState.tabs.map((t) => t.kind)).toEqual(["texworkspace"]);
    expect(layoutState.rightAreaExpanded).toBe(true);
    expect(closeRightArea).not.toHaveBeenCalled();
  });

  it("collapses RightArea only when the last mode tab is dismissed", () => {
    focusModeInRightArea("texworkspace");
    dismissModeFromRightArea("texworkspace");

    expect(panelState.tabs).toHaveLength(0);
    expect(layoutState.setRightAreaExpanded).toHaveBeenCalledWith(false);
    expect(closeRightArea).toHaveBeenCalled();
  });
});
