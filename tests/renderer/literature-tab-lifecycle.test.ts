import { describe, expect, it, beforeEach } from "vitest";
import {
  buildInitialTabShell,
  getLiteratureTabCloseAction,
  isTabDirty,
  tabDisplayTitle,
} from "@/lib/workspace/tab-lifecycle";
import { useDocumentStore } from "@/stores/document-store";
import { useLiteratureReaderStore } from "@/stores/literature-reader-store";
import type { RightTab } from "@/lib/workspace/mode-registry";

describe("literature tab lifecycle", () => {
  const homeTab: RightTab = {
    id: "lit-home",
    kind: "literature",
    title: "Library",
    isInitial: true,
  };

  const litTab: RightTab = {
    id: "lit-1",
    kind: "literature",
    title: "Attention Is All You Need",
    isInitial: false,
    literaturePaperId: "paper-1",
  };

  beforeEach(() => {
    useLiteratureReaderStore.setState({ activeNotePathByPaper: {} });
    useDocumentStore.setState({
      openedContents: new Map(),
      dirtyVersion: 0,
    });
  });

  it("closing library home tab deactivates literature mode", () => {
    expect(getLiteratureTabCloseAction(homeTab, [homeTab, litTab])).toBe("deactivate-mode");
    expect(getLiteratureTabCloseAction(homeTab, [homeTab])).toBe("deactivate-mode");
  });

  it("closing sole paper tab recreates library home instead of morphing in place", () => {
    expect(getLiteratureTabCloseAction(litTab, [litTab])).toBe("remove-and-ensure-home");
  });

  it("closing paper tab with library home open uses normal tab removal", () => {
    expect(getLiteratureTabCloseAction(litTab, [homeTab, litTab])).toBeNull();
  });

  it("buildInitialTabShell drops literaturePaperId", () => {
    const reset = buildInitialTabShell(litTab, "Library");
    expect(reset).toEqual({
      id: "lit-1",
      kind: "literature",
      title: "Library",
      isInitial: true,
    });
    expect("literaturePaperId" in reset).toBe(false);
  });

  it("shows dirty literature tab when active note is unsaved", () => {
    useLiteratureReaderStore.setState({
      activeNotePathByPaper: { "paper-1": "notes/key/2026-06-30-note.md" },
    });
    const notePath = "notes/key/2026-06-30-note.md";
    useDocumentStore.setState({
      openedContents: new Map([[notePath, { content: "draft", isDirty: true }]]),
      dirtyVersion: 1,
    });

    const dirty = new Set([notePath]);
    expect(isTabDirty(litTab, dirty)).toBe(true);
    expect(tabDisplayTitle(litTab, dirty)).toBe("*Attention Is All You Need");
  });

  it("is clean when no active note", () => {
    expect(isTabDirty(litTab, new Set())).toBe(false);
    expect(tabDisplayTitle(litTab, new Set())).toBe("Attention Is All You Need");
  });
});
