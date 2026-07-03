import { describe, it, expect, beforeEach } from "vitest";
import { useCitationStagingStore } from "../../src/renderer/stores/citation-staging-store";
import type { SubAgentRun } from "../../src/renderer/stores/chat-store";
import {
  resetCitationStagingBackfillForTests,
  syncCitationStagingFromMessages,
} from "../../src/renderer/lib/literature/sync-citation-staging-from-messages";
import type { ChatStreamMessage } from "../../src/renderer/stores/chat-store";

const SESSION = "sess-abc";

const STAGE_RESULT_CONTENT = JSON.stringify({
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
});

function makeLiteratureStageMessages(toolId: string): ChatStreamMessage[] {
  return [
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
}

function makeLiteratureStageToolResultMap(toolId: string) {
  return new Map([
    [
      toolId,
      {
        type: "tool_result" as const,
        tool_use_id: toolId,
        content: STAGE_RESULT_CONTENT,
      },
    ],
  ]);
}

function makeSubAgentRunWithLiteratureStage(toolId: string): SubAgentRun {
  return {
    expertId: "literature-scout",
    prompt: "Find papers",
    status: "done",
    blocks: [
      {
        type: "tool_use",
        id: toolId,
        name: "literature-stage",
        input: { arxivId: "2405.00133" },
      },
      {
        type: "tool_result",
        tool_use_id: toolId,
        content: STAGE_RESULT_CONTENT,
      },
    ],
  };
}

describe("syncCitationStagingFromMessages", () => {
  beforeEach(() => {
    useCitationStagingStore.getState().clearAll();
    resetCitationStagingBackfillForTests();
  });

  it("backfills from literature-stage tool_use + tool_result pairs", () => {
    const toolId = "tool-1";
    const messages = makeLiteratureStageMessages(toolId);
    const toolResultMap = makeLiteratureStageToolResultMap(toolId);

    syncCitationStagingFromMessages(SESSION, messages, toolResultMap);
    const list = useCitationStagingStore.getState().getCitationsForSession(SESSION);
    expect(list).toHaveLength(1);
    expect(list[0].refId).toBe(1);
    expect(list[0].title).toBe("World Models RL");
    expect(useCitationStagingStore.getState().activeSessionId).toBe(SESSION);
  });

  it("does not backfill after user deletes session citations", () => {
    const toolId = "tool-1";
    const messages = makeLiteratureStageMessages(toolId);
    const toolResultMap = makeLiteratureStageToolResultMap(toolId);

    syncCitationStagingFromMessages(SESSION, messages, toolResultMap);
    expect(useCitationStagingStore.getState().getCitationsForSession(SESSION)).toHaveLength(1);

    useCitationStagingStore.getState().removeBySession(SESSION);
    expect(useCitationStagingStore.getState().getCitationsForSession(SESSION)).toHaveLength(0);

    resetCitationStagingBackfillForTests();
    syncCitationStagingFromMessages(SESSION, messages, toolResultMap);
    expect(useCitationStagingStore.getState().getCitationsForSession(SESSION)).toHaveLength(0);
  });

  it("backfills from subAgent Task activity blocks", () => {
    const toolId = "sub-tool-1";
    const taskToolUseId = "task-1";
    const subAgentRuns: Record<string, SubAgentRun> = {
      [taskToolUseId]: makeSubAgentRunWithLiteratureStage(toolId),
    };

    syncCitationStagingFromMessages(SESSION, [], new Map(), { subAgentRuns });
    const list = useCitationStagingStore.getState().getCitationsForSession(SESSION);
    expect(list).toHaveLength(1);
    expect(list[0].refId).toBe(1);
    expect(list[0].title).toBe("World Models RL");
    expect(useCitationStagingStore.getState().activeSessionId).toBe(SESSION);
  });
});
