import { describe, expect, it, beforeEach } from "vitest";
import { isTabDirty, tabDisplayTitle } from "@/lib/workspace/tab-lifecycle";
import { useDocumentStore } from "@/stores/document-store";
import { useLiteratureReaderStore } from "@/stores/literature-reader-store";
import type { RightTab } from "@/lib/workspace/mode-registry";

describe("literature tab lifecycle", () => {
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
