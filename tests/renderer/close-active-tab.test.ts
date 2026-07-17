import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/stores/chat-store", () => ({
  useChatStore: { getState: vi.fn() },
}));
vi.mock("@/stores/layout-store", () => ({
  useLayoutStore: { getState: vi.fn() },
}));
vi.mock("@/stores/right-panel-store", () => ({
  useRightPanelStore: { getState: vi.fn() },
}));
vi.mock("@/lib/workspace/mode-registry", () => ({
  modeRegistry: { get: vi.fn(() => null) },
}));

import { closeActiveTabFromShortcut } from "@/lib/workspace/close-active-tab";
import { useChatStore } from "@/stores/chat-store";
import { useLayoutStore } from "@/stores/layout-store";
import { useRightPanelStore } from "@/stores/right-panel-store";

const chatGet = useChatStore.getState as ReturnType<typeof vi.fn>;
const layoutGet = useLayoutStore.getState as ReturnType<typeof vi.fn>;
const rpGet = useRightPanelStore.getState as ReturnType<typeof vi.fn>;

function emptyTab(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    isStreaming: false,
    sessionId: null,
    isLoadingSession: false,
    messages: [],
    streamingMessage: null,
    draft: { input: "", parts: [] },
    ...overrides,
  };
}

describe("closeActiveTabFromShortcut", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("closes RightArea tab when expanded", () => {
    const requestCloseTab = vi.fn();
    layoutGet.mockReturnValue({
      rightAreaExpanded: true,
      focusedMode: "files",
      editorMaximized: false,
      setEditorMaximized: vi.fn(),
      setRightAreaExpanded: vi.fn(),
    });
    rpGet.mockReturnValue({
      tabs: [{ id: "t1", kind: "file" }],
      activeTabId: "t1",
      requestCloseTab,
    });

    expect(closeActiveTabFromShortcut()).toBe("handled");
    expect(requestCloseTab).toHaveBeenCalledWith("t1", expect.objectContaining({
      onAfterClose: expect.any(Function),
    }));
  });

  it("collapses RightArea when expanded with no tabs", () => {
    const setRightAreaExpanded = vi.fn();
    const setEditorMaximized = vi.fn();
    layoutGet.mockReturnValue({
      rightAreaExpanded: true,
      focusedMode: "dashboard",
      editorMaximized: true,
      setEditorMaximized,
      setRightAreaExpanded,
      clearPendingRightAreaRestore: vi.fn(),
      setRightAreaWidth: vi.fn(),
      rightAreaWidth: 400,
    });
    rpGet.mockReturnValue({ tabs: [], activeTabId: null, requestCloseTab: vi.fn() });

    expect(closeActiveTabFromShortcut()).toBe("handled");
    expect(setEditorMaximized).toHaveBeenCalledWith(false);
    expect(setRightAreaExpanded).toHaveBeenCalledWith(false);
  });

  it("closes chat tab when RightArea collapsed and multiple tabs", () => {
    const closeTab = vi.fn();
    layoutGet.mockReturnValue({ rightAreaExpanded: false });
    rpGet.mockReturnValue({ tabs: [], activeTabId: null });
    chatGet.mockReturnValue({
      tabs: [
        emptyTab("c1", { messages: [{ role: "user" }] }),
        emptyTab("c2"),
      ],
      activeTabId: "c1",
      closeTab,
      createTab: vi.fn(),
    });

    expect(closeActiveTabFromShortcut()).toBe("handled");
    expect(closeTab).toHaveBeenCalledWith("c1");
  });

  it("requests close-window for last disposable empty chat tab", () => {
    layoutGet.mockReturnValue({ rightAreaExpanded: false });
    rpGet.mockReturnValue({ tabs: [], activeTabId: null });
    chatGet.mockReturnValue({
      tabs: [emptyTab("c1")],
      activeTabId: "c1",
      closeTab: vi.fn(),
      createTab: vi.fn(),
    });

    expect(closeActiveTabFromShortcut()).toBe("close-window");
  });

  it("replaces last content chat tab with a fresh session", () => {
    const closeTab = vi.fn();
    const createTab = vi.fn(() => "c2");
    layoutGet.mockReturnValue({ rightAreaExpanded: false });
    rpGet.mockReturnValue({ tabs: [], activeTabId: null });
    chatGet.mockReturnValue({
      tabs: [emptyTab("c1", { messages: [{ role: "user", content: "hi" }] })],
      activeTabId: "c1",
      closeTab,
      createTab,
    });

    expect(closeActiveTabFromShortcut()).toBe("handled");
    expect(createTab).toHaveBeenCalled();
    expect(closeTab).toHaveBeenCalledWith("c1");
  });

  it("skips streaming-only chat and closes window", () => {
    layoutGet.mockReturnValue({ rightAreaExpanded: false });
    rpGet.mockReturnValue({ tabs: [], activeTabId: null });
    chatGet.mockReturnValue({
      tabs: [emptyTab("c1", { isStreaming: true })],
      activeTabId: "c1",
      closeTab: vi.fn(),
      createTab: vi.fn(),
    });

    expect(closeActiveTabFromShortcut()).toBe("close-window");
  });
});
