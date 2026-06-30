import { describe, it, expect, beforeEach } from "vitest";
import { useCitationStagingStore } from "../../src/renderer/stores/citation-staging-store";
import {
  resetCitationStagingBackfillForTests,
  syncCitationStagingFromMessages,
} from "../../src/renderer/lib/literature/sync-citation-staging-from-messages";
import type { ChatStreamMessage } from "../../src/renderer/stores/chat-store";

const SESSION = "sess-abc";

describe("syncCitationStagingFromMessages", () => {
  beforeEach(() => {
    useCitationStagingStore.getState().clearAll();
    resetCitationStagingBackfillForTests();
  });

  it("backfills from literature-stage tool_use + tool_result pairs", () => {
    const toolId = "tool-1";
    const messages: ChatStreamMessage[] = [
      {
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              id: toolId,
              name: "literature-stage",
              input: { arxivId: "2405.00133" },
            },
          ],
        },
      },
    ];
    const toolResultMap = new Map([
      [
        toolId,
        {
          type: "tool_result",
          tool_use_id: toolId,
          content: JSON.stringify({
            output: JSON.stringify({
              staged: true,
              verified: true,
              refId: 1,
              citation: {
                title: "World Models RL",
                authors: null,
                year: 2024,
                venue: "arXiv",
                type: "article",
                doi: null,
                arxivId: "2405.00133",
                abstract: null,
                cslJson: null,
                sourceUrl: null,
                catalogSource: "arxiv",
                catalogVerified: true,
                verifyError: null,
                discoveredFrom: "agent",
                libraryPaperId: null,
                libraryBibkey: null,
              },
            }),
          }),
        },
      ],
    ]);

    syncCitationStagingFromMessages(SESSION, messages, toolResultMap);
    const list = useCitationStagingStore.getState().getCitationsForSession(SESSION);
    expect(list).toHaveLength(1);
    expect(list[0].refId).toBe(1);
    expect(list[0].title).toBe("World Models RL");
    expect(useCitationStagingStore.getState().activeSessionId).toBe(SESSION);
  });

  it("does not backfill after user deletes session citations", () => {
    const toolId = "tool-1";
    const messages: ChatStreamMessage[] = [
      {
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              id: toolId,
              name: "literature-stage",
              input: { arxivId: "2405.00133" },
            },
          ],
        },
      },
    ];
    const toolResultMap = new Map([
      [
        toolId,
        {
          type: "tool_result",
          tool_use_id: toolId,
          content: JSON.stringify({
            output: JSON.stringify({
              staged: true,
              verified: true,
              refId: 1,
              citation: {
                title: "World Models RL",
                authors: null,
                year: 2024,
                venue: "arXiv",
                type: "article",
                doi: null,
                arxivId: "2405.00133",
                abstract: null,
                cslJson: null,
                sourceUrl: null,
                catalogSource: "arxiv",
                catalogVerified: true,
                verifyError: null,
                discoveredFrom: "agent",
                libraryPaperId: null,
                libraryBibkey: null,
              },
            }),
          }),
        },
      ],
    ]);

    syncCitationStagingFromMessages(SESSION, messages, toolResultMap);
    expect(useCitationStagingStore.getState().getCitationsForSession(SESSION)).toHaveLength(1);

    useCitationStagingStore.getState().removeBySession(SESSION);
    expect(useCitationStagingStore.getState().getCitationsForSession(SESSION)).toHaveLength(0);

    resetCitationStagingBackfillForTests();
    syncCitationStagingFromMessages(SESSION, messages, toolResultMap);
    expect(useCitationStagingStore.getState().getCitationsForSession(SESSION)).toHaveLength(0);
  });
});
