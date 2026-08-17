import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  emptyConversation,
  type ConversationBinding,
} from "../../src/shared/agent-conversation";
import type { SessionCreatedEvent } from "../../src/shared/agent-runtime";

const REPO = join(__dirname, "../..");

function walkTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      out.push(...walkTsFiles(path));
      continue;
    }
    if (name.endsWith(".ts")) out.push(path);
  }
  return out;
}

function sourceOf(rel: string): string {
  return readFileSync(join(REPO, rel), "utf-8");
}

describe("Pi-first agent core boundaries", () => {
  it("keeps conversationId independent from session_created.sessionId", () => {
    const binding: ConversationBinding = {
      conversationId: "conv-1",
      tabId: "tab-1",
      runtimeSessionId: "rt-1",
      backend: "pi",
    };
    const created: SessionCreatedEvent = {
      type: "session_created",
      runtimeSessionId: "rt-1",
      tabId: "tab-1",
      turnId: "turn-0",
      sessionId: "rt-1",
    };
    const conv = emptyConversation({ conversationId: binding.conversationId });

    expect(conv.conversationId).toBe("conv-1");
    expect(conv.conversationId).not.toBe(created.sessionId);
    expect(binding.runtimeSessionId).toBe(created.sessionId);
  });

  it("keeps OpenCode ChatStream mapping out of the Pi agent core", () => {
    const files = walkTsFiles(join(REPO, "src/main/agent"));
    for (const file of files) {
      const src = readFileSync(file, "utf-8");
      expect(src, file).not.toMatch(/mapChatStreamToAgentEvent|broadcastChatStream|ChatStreamDeltaTracker|ChatStreamEnvelope|OPENCODE_BUILTIN_REBUILD|lab_busy|lab_session_missing/);
    }
  });

  it("forbids official agent core from importing ipc, renderer stores, or EventMapper", () => {
    const files = walkTsFiles(join(REPO, "src/main/agent"));
    expect(files.length).toBeGreaterThan(0);

    const forbidden = [
      /from\s+["'][^"']*\/ipc\//,
      /from\s+["']@\/stores/,
      /from\s+["'][^"']*renderer\/stores/,
      /from\s+["'][^"']*acp\/event-mapper/,
    ];

    for (const file of files) {
      const src = readFileSync(file, "utf-8");
      for (const pattern of forbidden) {
        expect(src, `${file} matches ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it("keeps Conversation contracts free of Pi and ACP types", () => {
    const files = [
      "src/shared/agent-conversation.ts",
      "src/renderer/lib/chat/conversation-reducer.ts",
    ];
    for (const rel of files) {
      expect(existsSync(join(REPO, rel)), rel).toBe(true);
      const src = sourceOf(rel);
      expect(src).not.toMatch(/@earendil-works\/pi-/);
      expect(src).not.toMatch(/@agentclientprotocol/);
      expect(src).not.toMatch(/ChatStreamMessage/);
      expect(src).not.toMatch(/from\s+["'][^"']*acp\//);
      expect(src).not.toMatch(/from\s+["'][^"']*pi-lab/);
    }
  });

  it("exposes the production runtime through agent IPC without Lab channels", () => {
    const ipc = sourceOf("src/main/ipc/agent.ts");
    const preload = sourceOf("src/preload/index.ts");

    expect(ipc).toContain("\"agent:send\"");
    expect(ipc).toContain("\"agent:cancel\"");
    expect(ipc).toContain("\"agent:dispose\"");
    expect(ipc).toContain("\"agent:resolvePermission\"");
    expect(ipc).toContain("\"agent:listSessions\"");
    expect(ipc).toContain("\"agent:loadSession\"");
    expect(ipc).toContain("\"agent:renameSession\"");
    expect(ipc).toContain("\"agent:deleteSession\"");
    expect(ipc).toContain("\"agent:answerQuestion\"");
    expect(ipc).toContain("\"agent:resolvePlanSuggest\"");
    expect(preload).toContain("\"agent:event\"");
    expect(preload).toContain("\"agent:listSessions\"");
    expect(preload).toContain("\"agent:loadSession\"");
    expect(preload).toContain("\"agent:deleteSession\"");
    expect(ipc).not.toContain("pi-lab:");
    expect(preload).not.toContain("pi-lab:");
  });

  it("does not subscribe to or prewarm the OpenCode runtime for the product shell", () => {
    const leftMain = sourceOf("src/renderer/components/layout/left-main-area.tsx");
    const documents = sourceOf("src/renderer/stores/document-store.ts");
    const main = sourceOf("src/main/index.ts");

    expect(leftMain).not.toContain("useOpenCodeEvents");
    expect(documents).not.toContain("chatPrewarm");
    expect(main).not.toContain("ensureProjectChatPrewarm");
  });

  it("routes product permission decisions only through the Agent API", () => {
    const permissions = sourceOf("src/renderer/stores/permission-actions.ts");
    expect(permissions).toContain("agentResolvePermission");
    expect(permissions).not.toContain("chatAnswerPermission");
  });

  it("does not cancel product conversations through OpenCode", () => {
    const chatStore = sourceOf("src/renderer/stores/chat-store.ts");
    const rightPanel = sourceOf("src/renderer/stores/right-panel-store.ts");
    expect(chatStore).not.toContain("electronAPI.chatCancel");
    expect(rightPanel).not.toContain("electronAPI.chatCancel");
  });

  it("lists and loads product history through the Agent API, not OpenCode ACP", () => {
    const chatStore = sourceOf("src/renderer/stores/chat-store.ts");
    const sidebar = sourceOf("src/renderer/components/layout/left-sidebar.tsx");
    const palette = sourceOf("src/renderer/components/modules/shared/command-palette.tsx");
    const tray = sourceOf("src/renderer/hooks/use-tray-status-sync.ts");

    expect(chatStore).toContain("agentLoadSession");
    expect(chatStore).toContain("agentRenameSession");
    expect(sidebar).toContain("agentListSessions");
    expect(palette).toContain("agentListSessions");
    expect(tray).toContain("agentListSessions");

    for (const [name, src] of [
      ["chat-store", chatStore],
      ["left-sidebar", sidebar],
      ["command-palette", palette],
      ["tray", tray],
    ] as const) {
      expect(src, name).not.toContain("electronAPI.sessionList");
      expect(src, name).not.toContain("electronAPI.sessionLoad");
    }

    expect(chatStore).not.toContain("electronAPI.chatRegisterTab");
    expect(chatStore).not.toContain("electronAPI.chatSetSessionAgent");
    expect(chatStore).not.toContain("electronAPI.chatGetSubAgentActivity");
    expect(chatStore).not.toContain("electronAPI.chatStopSubAgent");
    expect(chatStore).not.toContain("electronAPI.sessionRename");
    expect(chatStore).not.toContain("electronAPI.sessionGetDirectory");
    expect(chatStore).not.toContain("electronAPI.sessionGetUserDisplays");
  });
});
