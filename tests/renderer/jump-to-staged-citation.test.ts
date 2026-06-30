import { describe, it, expect, vi, beforeEach } from "vitest";
import { jumpToStagedCitation } from "../../src/renderer/lib/literature/jump-to-staged-citation";
import { useCitationStagingStore } from "../../src/renderer/stores/citation-staging-store";
import { useRightPanelStore } from "../../src/renderer/stores/right-panel-store";
import { useLiteratureStore } from "../../src/renderer/stores/literature-store";
import { useLayoutStore } from "../../src/renderer/stores/layout-store";

vi.mock("@/stores/right-panel-store", () => ({
  useRightPanelStore: {
    getState: vi.fn(),
  },
}));

vi.mock("@/stores/literature-store", () => ({
  useLiteratureStore: {
    getState: vi.fn(),
  },
}));

vi.mock("@/stores/layout-store", () => ({
  useLayoutStore: {
    getState: vi.fn(),
  },
}));

const mockRightPanel = useRightPanelStore.getState as unknown as ReturnType<typeof vi.fn>;
const mockLiterature = useLiteratureStore.getState as unknown as ReturnType<typeof vi.fn>;
const mockLayout = useLayoutStore.getState as unknown as ReturnType<typeof vi.fn>;

describe("jumpToStagedCitation", () => {
  beforeEach(() => {
    useCitationStagingStore.getState().clearAll();
    mockRightPanel.mockReset();
    mockLiterature.mockReset();
    mockLayout.mockReset();
  });

  it("expands RightArea, activates literature, switches subview, and queues highlight", () => {
    const activateMode = vi.fn();
    const requestRightAreaExpand = vi.fn();
    const setLibrarySubview = vi.fn();
    const setPendingCitationJump = vi.fn();
    const setActiveTab = vi.fn();

    mockLayout.mockReturnValue({
      activateMode,
      requestRightAreaExpand,
      editorMaximized: false,
      rightAreaExpanded: false,
    });
    mockRightPanel.mockReturnValue({
      tabs: [{ id: "lit-tab-1", kind: "literature" }],
      ensureTab: vi.fn(),
      setActiveTab,
    });
    mockLiterature.mockReturnValue({ setLibrarySubview, setPendingCitationJump });

    jumpToStagedCitation("chat-session-xyz", 3);

    expect(useCitationStagingStore.getState().activeSessionId).toBe("chat-session-xyz");
    expect(activateMode).toHaveBeenCalledWith("literature");
    expect(requestRightAreaExpand).toHaveBeenCalled();
    expect(setLibrarySubview).toHaveBeenCalledWith("session-citations");
    expect(setPendingCitationJump).toHaveBeenCalledWith(3);
    expect(setActiveTab).toHaveBeenCalledWith("lit-tab-1");
  });

  it("creates a literature tab when none exists", () => {
    const ensureTab = vi.fn(() => "new-lit-tab");
    const setActiveTab = vi.fn();

    mockLayout.mockReturnValue({
      activateMode: vi.fn(),
      requestRightAreaExpand: vi.fn(),
      editorMaximized: false,
    });
    mockRightPanel.mockReturnValueOnce({
      tabs: [],
      ensureTab,
      setActiveTab,
    }).mockReturnValueOnce({
      tabs: [{ id: "new-lit-tab", kind: "literature" }],
      ensureTab,
      setActiveTab,
    });
    mockLiterature.mockReturnValue({
      setLibrarySubview: vi.fn(),
      setPendingCitationJump: vi.fn(),
    });

    jumpToStagedCitation("s1", 1);

    expect(ensureTab).toHaveBeenCalledWith("literature");
    expect(setActiveTab).toHaveBeenCalledWith("new-lit-tab");
  });

  it("does not expand RightArea when already open", () => {
    const requestRightAreaExpand = vi.fn();
    mockLayout.mockReturnValue({
      activateMode: vi.fn(),
      requestRightAreaExpand,
      editorMaximized: false,
      rightAreaExpanded: true,
    });
    mockRightPanel.mockReturnValue({
      tabs: [{ id: "lit-tab-1", kind: "literature" }],
      ensureTab: vi.fn(),
      setActiveTab: vi.fn(),
    });
    mockLiterature.mockReturnValue({
      setLibrarySubview: vi.fn(),
      setPendingCitationJump: vi.fn(),
    });

    jumpToStagedCitation("s1", 2);

    expect(requestRightAreaExpand).not.toHaveBeenCalled();
  });

  it("reveals panel when jumping from chat", () => {
    mockLayout.mockReturnValue({
      activateMode: vi.fn(),
      requestRightAreaExpand: vi.fn(),
      editorMaximized: false,
      rightAreaExpanded: false,
    });
    mockRightPanel.mockReturnValue({
      tabs: [{ id: "lit-tab-1", kind: "literature" }],
      ensureTab: vi.fn(),
      setActiveTab: vi.fn(),
    });
    mockLiterature.mockReturnValue({
      setLibrarySubview: vi.fn(),
      setPendingCitationJump: vi.fn(),
    });

    useCitationStagingStore.getState().clearPanelForSession("chat-session-xyz");
    expect(
      useCitationStagingStore.getState().panelHiddenSessions["chat-session-xyz"],
    ).toBe(true);

    jumpToStagedCitation("chat-session-xyz", 3);

    expect(useCitationStagingStore.getState().panelHiddenSessions["chat-session-xyz"]).toBeUndefined();
  });
});
