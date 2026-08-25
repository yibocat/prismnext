import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyConversation } from "../../src/shared/agent/conversation";

const renameSession = vi.fn().mockResolvedValue(undefined);
const tabs: Array<{
  id: string;
  sessionId: string | null;
  conversation: ReturnType<typeof emptyConversation>;
}> = [];

vi.mock("@/stores/chat-store", () => ({
  useChatStore: {
    getState: () => ({ renameSession, tabs }),
  },
}));

import {
  archiveSessionAction,
  copySessionIdAction,
  copySessionTranscriptAction,
  pinSessionAction,
  renameSessionAction,
  setSessionUnreadAction,
} from "../../src/renderer/lib/chat/session-context-actions";
import { isSessionUnread } from "../../src/renderer/lib/chat/session-chrome";
import { getPinnedSessionIdsForProject } from "../../src/renderer/lib/chat/session-ui-prefs";
import { useSettingsStore } from "../../src/renderer/stores/settings-store";
import { useLayoutStore } from "../../src/renderer/stores/layout-store";

const PROJECT = "/Users/test/project-a";
const SESSION = "sess-1";

describe("session-context-actions", () => {
  const writeText = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    renameSession.mockClear();
    tabs.length = 0;
    writeText.mockClear();
    writeText.mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    useSettingsStore.setState({
      settings: {},
      loaded: true,
    });
    useLayoutStore.setState({
      archivedSessionIds: [],
      pinnedSessionIds: [],
    });
    vi.stubGlobal("electronAPI", {
      settingsSet: vi.fn().mockResolvedValue(undefined),
      agentLoadSession: vi.fn().mockResolvedValue({ ok: false }),
    });
  });

  it("toggles unread through session chrome", async () => {
    await setSessionUnreadAction(PROJECT, SESSION, true);
    expect(isSessionUnread(PROJECT, SESSION)).toBe(true);

    await setSessionUnreadAction(PROJECT, SESSION, false);
    expect(isSessionUnread(PROJECT, SESSION)).toBe(false);
  });

  it("pins through session ui prefs", async () => {
    await pinSessionAction(PROJECT, SESSION);
    expect(getPinnedSessionIdsForProject(PROJECT)).toEqual([SESSION]);
    expect(useLayoutStore.getState().pinnedSessionIds).toEqual([SESSION]);
  });

  it("archives through session ui prefs", async () => {
    await archiveSessionAction(PROJECT, SESSION);
    expect(useLayoutStore.getState().archivedSessionIds).toEqual([SESSION]);
  });

  it("renames through chatStore.renameSession", async () => {
    await renameSessionAction(SESSION, "New title");
    expect(renameSession).toHaveBeenCalledWith(SESSION, "New title");
  });

  it("copies the session id", async () => {
    expect(await copySessionIdAction(SESSION)).toBe("copied");
    expect(writeText).toHaveBeenCalledWith(SESSION);
  });

  it("copies transcript from an open tab without loading a session", async () => {
    const conversation = emptyConversation({ conversationId: SESSION, title: "Open" });
    conversation.turns.push({
      turnId: "t1",
      turnIndex: 0,
      status: "completed",
      user: { blocks: [{ type: "text", text: "Hi" }] },
      assistant: { blocks: [{ type: "text", text: "Hello" }] },
    });
    tabs.push({ id: SESSION, sessionId: SESSION, conversation });

    expect(await copySessionTranscriptAction({
      sessionId: SESSION,
      projectRoot: PROJECT,
      title: "Open",
    })).toBe("copied");
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("## User"));
    expect(window.electronAPI.agentLoadSession).not.toHaveBeenCalled();
  });

  it("loads a closed session for transcript without switching tabs", async () => {
    const conversation = emptyConversation({ conversationId: SESSION, title: "Closed" });
    conversation.turns.push({
      turnId: "t1",
      turnIndex: 0,
      status: "completed",
      user: { blocks: [{ type: "text", text: "Hi" }] },
      assistant: { blocks: [{ type: "text", text: "Hello" }] },
    });
    vi.mocked(window.electronAPI.agentLoadSession).mockResolvedValue({
      ok: true,
      conversation,
    });

    expect(await copySessionTranscriptAction({
      sessionId: SESSION,
      projectRoot: PROJECT,
      title: "Closed",
    })).toBe("copied");
    expect(window.electronAPI.agentLoadSession).toHaveBeenCalledWith({
      conversationId: SESSION,
      projectRoot: PROJECT,
    });
  });
});
