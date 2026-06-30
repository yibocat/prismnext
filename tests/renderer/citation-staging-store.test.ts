import { describe, it, expect, beforeEach } from "vitest";
import { useCitationStagingStore } from "../../src/renderer/stores/citation-staging-store";
import type { StageResult } from "../../src/shared/citation-staging";

const SESSION = "chat-tab-1";

function verifiedResult(overrides: Partial<StageResult> = {}): StageResult {
  return {
    staged: true,
    verified: true,
    citation: {
      title: "Some Paper",
      authors: "Smith, J.",
      year: 2024,
      venue: "Nature",
      type: "article-journal",
      doi: "10.1038/test.2024.001",
      arxivId: null,
      abstract: null,
      cslJson: null,
      sourceUrl: "https://example.com/paper",
      catalogSource: "crossref",
      catalogVerified: true,
      verifyError: null,
      discoveredFrom: "agent",
      libraryPaperId: null,
      libraryBibkey: null,
    },
    alreadyInLibrary: false,
    libraryBibkey: null,
    hint: "Cite as [n].",
    ...overrides,
  };
}

describe("citationStagingStore", () => {
  beforeEach(() => {
    useCitationStagingStore.getState().clearAll();
  });

  it("assigns sequential refIds per session", () => {
    const { upsertFromStageResult, getCitationsForSession } = useCitationStagingStore.getState();
    const id1 = upsertFromStageResult(SESSION, verifiedResult());
    const id2 = upsertFromStageResult(
      SESSION,
      verifiedResult({
        citation: {
          ...verifiedResult().citation!,
          title: "Second Paper",
          doi: "10.1038/test.2024.002",
        },
      }),
    );
    const list = getCitationsForSession(SESSION);
    expect(list).toHaveLength(2);
    expect(list.find((c) => c.id === id1)?.refId).toBe(1);
    expect(list.find((c) => c.id === id2)?.refId).toBe(2);
  });

  it("reuses refId when same DOI is staged again", () => {
    const { upsertFromStageResult, getCitationsForSession } = useCitationStagingStore.getState();
    upsertFromStageResult(SESSION, verifiedResult());
    const secondId = upsertFromStageResult(
      SESSION,
      verifiedResult({ citation: { ...verifiedResult().citation!, title: "Updated Title" } }),
    );
    const list = getCitationsForSession(SESSION);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(secondId);
    expect(list[0].refId).toBe(1);
    expect(list[0].title).toBe("Updated Title");
  });

  it("returns null for unverified results", () => {
    const id = useCitationStagingStore.getState().upsertFromStageResult(SESSION, {
      staged: false,
      verified: false,
      error: "not found",
    });
    expect(id).toBeNull();
    expect(useCitationStagingStore.getState().getCitationsForSession(SESSION)).toHaveLength(0);
  });

  it("marks addedToLibrary when stage result already matches library entry", () => {
    const id = useCitationStagingStore.getState().upsertFromStageResult(
      SESSION,
      verifiedResult({
        citation: {
          ...verifiedResult().citation!,
          libraryPaperId: "p-existing",
          libraryBibkey: "smith2024",
        },
        alreadyInLibrary: true,
        libraryBibkey: "smith2024",
      }),
    );
    const c = useCitationStagingStore.getState().getCitationsForSession(SESSION)[0];
    expect(c.id).toBe(id);
    expect(c.addedToLibrary).toBe(true);
    expect(c.libraryBibkey).toBe("smith2024");
  });

  it("markAddedToLibrary updates the citation across sessions", () => {
    const id = useCitationStagingStore.getState().upsertFromStageResult(SESSION, verifiedResult());
    useCitationStagingStore.getState().markAddedToLibrary(id, "p-new", "smith2024");
    const c = useCitationStagingStore.getState().getCitationsForSession(SESSION)[0];
    expect(c.addedToLibrary).toBe(true);
    expect(c.libraryPaperId).toBe("p-new");
  });

  it("removeBySession clears only that session and suppresses transcript backfill", () => {
    useCitationStagingStore.getState().upsertFromStageResult(SESSION, verifiedResult());
    useCitationStagingStore.getState().upsertFromStageResult(
      "other-session",
      verifiedResult({ citation: { ...verifiedResult().citation!, doi: "10.1038/other" } }),
    );
    useCitationStagingStore.getState().removeBySession(SESSION);
    expect(useCitationStagingStore.getState().getCitationsForSession(SESSION)).toHaveLength(0);
    expect(useCitationStagingStore.getState().getCitationsForSession("other-session")).toHaveLength(1);
    expect(useCitationStagingStore.getState().backfillSuppressedSessions[SESSION]).toBe(true);
  });

  it("clearPanelForSession hides panel list but keeps citation data for chat links", () => {
    const id = useCitationStagingStore.getState().upsertFromStageResult(SESSION, verifiedResult());
    useCitationStagingStore.getState().clearPanelForSession(SESSION);
    expect(useCitationStagingStore.getState().panelHiddenSessions[SESSION]).toBe(true);
    expect(useCitationStagingStore.getState().getCitationsForSession(SESSION)).toHaveLength(1);
    expect(useCitationStagingStore.getState().getCitationsForSession(SESSION)[0].id).toBe(id);
    useCitationStagingStore.getState().revealPanelForSession(SESSION);
    expect(useCitationStagingStore.getState().panelHiddenSessions[SESSION]).toBeUndefined();
  });
});
