import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  emptyConversation,
  type ConversationBinding,
} from "../../src/shared/agent/conversation";
import type { SessionCreatedEvent } from "../../src/shared/agent/runtime";

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

function preloadSources(): string {
  return walkTsFiles(join(REPO, "src/preload"))
    .map((file) => readFileSync(file, "utf-8"))
    .join("\n");
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
      "src/shared/agent/conversation.ts",
      "src/shared/agent/conversation-reducer.ts",
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
    const preload = preloadSources();

    expect(ipc).toContain("\"agent:send\"");
    expect(ipc).toContain("\"agent:cancel\"");
    expect(ipc).toContain("\"agent:cancelSubagent\"");
    expect(ipc).toContain("\"agent:dispose\"");
    expect(ipc).toContain("\"agent:resolvePermission\"");
    expect(ipc).toContain("\"agent:listSessions\"");
    expect(ipc).toContain("\"agent:loadSession\"");
    expect(ipc).toContain("\"agent:renameSession\"");
    expect(ipc).toContain("\"agent:deleteSession\"");
    expect(ipc).toContain("\"agent:answerQuestion\"");
    expect(ipc).toContain("\"agent:resolvePlanSuggest\"");
    expect(ipc).toContain("\"agent:listModels\"");
    expect(ipc).toContain("\"agent:listModelsCatalog\"");
    expect(ipc).toContain("\"agent:testConnection\"");
    expect(ipc).toContain("\"agent:getModelEffort\"");
    expect(ipc).toContain("\"agent:getEffortCatalog\"");
    expect(ipc).toContain("\"agent:compact\"");
    expect(ipc).toContain("\"agent:describeImages\"");
    expect(ipc).toContain("\"agent:truncateToTurn\"");
    expect(ipc).toContain("\"agent:undoTruncate\"");
    expect(ipc).toContain("\"agent:reassignDirectory\"");
    expect(ipc).toContain("\"agent:syncIntensiveReading\"");
    expect(ipc).toContain("\"agent:upsertPlanArtifact\"");
    expect(ipc).toContain("\"agent:appendPlanDecision\"");
    expect(ipc).toContain("\"agent:upsertTurnMeta\"");
    expect(preload).toContain("\"agent:event\"");
    expect(preload).toContain("\"agent:listSessions\"");
    expect(preload).toContain("\"agent:loadSession\"");
    expect(preload).toContain("\"agent:deleteSession\"");
    expect(preload).not.toContain("\"chat:send\"");
    expect(preload).not.toContain("\"session:load\"");
    expect(ipc).not.toContain("pi-lab:");
    expect(preload).not.toContain("pi-lab:");
  });

  it("does not start OpenCode file-bridge pollers or expose dead chat/session APIs", () => {
    const main = sourceOf("src/main/index.ts");
    const preload = preloadSources();
    const types = sourceOf("src/renderer/types/electron.d.ts");
    const sidebar = sourceOf("src/renderer/components/layout/left-sidebar.tsx");

    expect(main).not.toContain("startTerminalBridge");
    expect(main).not.toContain("stopTerminalBridge");
    expect(main).not.toContain("stopLiteratureBridge");
    expect(main).not.toContain("stopLatexBridge");
    expect(main).not.toContain("stopResearchBriefBridge");
    expect(main).not.toContain("stopExperimentLogBridge");
    expect(main).not.toContain("stopInteractionBridge");
    expect(main).not.toContain("stopImageDescribeBridge");
    expect(main).not.toContain("setTerminalBridgeWindow");
    expect(main).not.toContain("startLiteratureBridge");
    expect(main).not.toContain("startLatexBridge");
    expect(main).not.toContain("startResearchBriefBridge");
    expect(main).not.toContain("startExperimentLogBridge");
    expect(main).not.toContain("startInteractionBridge");
    expect(main).not.toContain("startImageDescribeBridge");
    expect(preload).not.toContain("chatSend");
    expect(preload).not.toContain("sessionLoad");
    expect(preload).not.toContain("onChatSessionCreated");
    expect(preload).not.toContain("onAgentStatusChanged");
    expect(preload).not.toContain("removeChatListeners");
    expect(types).not.toContain("chatSend");
    expect(types).not.toContain("sessionLoad");
    expect(types).not.toContain("onChatSessionCreated");
    expect(sidebar).not.toContain("onChatSessionCreated");
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
    const chatTabs = sourceOf("src/renderer/stores/chat/tabs.ts");
    const chatStore = sourceOf("src/renderer/stores/chat-store.ts");
    const sidebar = sourceOf("src/renderer/components/layout/left-sidebar.tsx");
    const palette = sourceOf("src/renderer/components/modules/shared/command-palette.tsx");
    const tray = sourceOf("src/renderer/hooks/use-tray-status-sync.ts");

    expect(chatTabs).toContain("agentLoadSession");
    expect(chatTabs).toContain("agentRenameSession");
    expect(sidebar).toContain("agentListSessions");
    expect(palette).toContain("agentListSessions");
    expect(tray).toContain("agentListSessions");

    for (const [name, src] of [
      ["chat-tabs", chatTabs],
      ["chat-store", chatStore],
      ["left-sidebar", sidebar],
      ["command-palette", palette],
      ["tray", tray],
    ] as const) {
      expect(src, name).not.toContain("electronAPI.sessionList");
      expect(src, name).not.toContain("electronAPI.sessionLoad");
    }

    expect(chatTabs).not.toContain("electronAPI.chatRegisterTab");
    expect(chatTabs).not.toContain("electronAPI.chatSetSessionAgent");
    expect(chatTabs).not.toContain("electronAPI.chatGetSubAgentActivity");
    expect(chatTabs).not.toContain("electronAPI.chatStopSubAgent");
    expect(chatTabs).not.toContain("electronAPI.sessionRename");
    expect(chatTabs).not.toContain("electronAPI.sessionGetDirectory");
    expect(chatTabs).not.toContain("electronAPI.sessionGetUserDisplays");
  });

  it("loads Settings model catalog and connection tests through the Agent API", () => {
    const editor = sourceOf("src/renderer/components/modules/settings/provider-editor-panel.tsx");
    const catalog = sourceOf("src/renderer/lib/providers/pi-model-catalog.ts");
    const providers = sourceOf("src/renderer/lib/providers/index.ts");
    const settings = sourceOf("src/renderer/stores/settings-store.ts");
    const catalogModule = sourceOf("src/main/agent/model-catalog.ts");

    expect(editor).toContain("agentTestConnection");
    expect(editor).toContain("agentListModels");
    expect(editor).not.toContain("chatTestConnection");
    expect(editor).not.toContain("chatFetchProviderModels");
    expect(catalog).toContain("agentListModelsCatalog");
    expect(catalog).toContain("prefetchPiModelsCatalog");
    expect(catalog).not.toContain("chatGetOpenCodeModelsCatalog");
    expect(catalog).not.toContain("OpenCode");
    expect(providers).toContain("agentGetModelEffort");
    expect(providers).toContain("agentGetEffortCatalog");
    expect(providers).not.toContain("chatGetModelEffort");
    expect(providers).not.toContain("chatGetEffortCatalog");
    expect(settings).toContain("agentGetModelEffort");
    expect(settings).not.toContain("chatGetModelEffort");
    expect(catalogModule).not.toMatch(/from\s+["'][^"']*acp\//);
    expect(catalogModule).not.toContain("cache/opencode");
  });

  it("injects project skills through Pi and does not write OpenCode config", () => {
    const refresh = sourceOf("src/main/skills/project-skills-refresh.ts");
    const prewarm = sourceOf("src/main/session/project-chat-prewarm.ts");
    const loader = sourceOf("src/main/agent/skill-loader.ts");
    const runtime = sourceOf("src/main/agent/pi-sdk-runtime.ts");

    expect(refresh).not.toMatch(/from\s+["'][^"']*acp\/service/);
    expect(refresh).not.toContain("applyProjectSkillsIntegration");
    expect(refresh).not.toContain("reloadAfterSkillsIntegration");
    expect(prewarm).not.toContain("syncProjectPromptFile");
    expect(prewarm).not.toContain("applyProjectPromptIntegration");
    expect(prewarm).not.toContain("reloadAfterSkillsIntegration");
    expect(existsSync(join(REPO, "src/main/ipc/chat.ts"))).toBe(false);
    expect(loader).toContain("loadSkillsFromDir");
    expect(runtime).toContain("loadPiSkillsFromDirs");
  });

  it("closes projects, checkpoints, plan cards, and intensive reading through the Agent API", () => {
    const lifecycle = sourceOf("src/renderer/lib/workspace/project-lifecycle.ts");
    const checkpoint = sourceOf("src/renderer/stores/checkpoint-store.ts");
    const chatStore = sourceOf("src/renderer/stores/chat-store.ts");
    const chatTabs = sourceOf("src/renderer/stores/chat/tabs.ts");
    const chatPlan = sourceOf("src/renderer/stores/chat/plan.ts");
    const chatModel = sourceOf("src/renderer/stores/chat/model.ts");
    const intensive = sourceOf("src/renderer/lib/literature/sync-intensive-reading.ts");
    const worktree = sourceOf("src/renderer/lib/git/worktree-sessions.ts");
    const question = sourceOf("src/renderer/hooks/use-question-prompt.ts");
    const ask = sourceOf("src/renderer/components/modules/chat/tools/ask-question-widget.tsx");
    const composer = sourceOf("src/renderer/hooks/use-chat-composer.ts");

    expect(lifecycle).not.toMatch(/agentDispose\(\s*\)/);
    expect(lifecycle).not.toContain("chatDispose");
    expect(chatTabs).toContain("agentDispose");
    expect(checkpoint).toContain("agentTruncateToTurn");
    expect(checkpoint).toContain("agentUndoTruncate");
    expect(checkpoint).not.toContain("sessionTruncateToTurn");
    expect(checkpoint).not.toContain("sessionUndoTruncate");
    expect(chatPlan).toContain("agentUpsertPlanArtifact");
    expect(chatPlan).toContain("agentAppendPlanDecision");
    expect(chatModel).toContain("agentUpsertTurnMeta");
    expect(chatStore).not.toContain("sessionGetPlanEvents");
    expect(chatPlan).not.toContain("sessionGetPlanEvents");
    expect(chatPlan).not.toContain("sessionUpsertPlanArtifact");
    expect(chatModel).not.toContain("sessionUpsertTurnMeta");
    expect(intensive).toContain("agentSyncIntensiveReading");
    expect(intensive).not.toContain("chatSyncIntensiveReading");
    expect(worktree).toContain("agentReassignDirectory");
    expect(worktree).not.toContain("sessionReassignDirectory");
    expect(question).not.toContain("chatReadPendingQuestion");
    expect(ask).not.toContain("chatAnswerQuestion");
    expect(composer).not.toContain("sessionAppendUserDisplay");
  });

  it("compacts and describes images through the Agent API", () => {
    const compactAction = sourceOf("src/renderer/actions/builtin-actions.ts");
    const indicator = sourceOf("src/renderer/components/modules/chat/context-window-indicator.tsx");
    const vision = sourceOf("src/renderer/lib/chat/vision-fallback-send.ts");

    expect(compactAction).toContain("agentCompact");
    expect(compactAction).not.toContain("chatCompact");
    expect(indicator).toContain("agentCompact");
    expect(indicator).not.toContain("chatCompact");
    expect(vision).toContain("agentDescribeImages");
    expect(vision).not.toContain("chatDescribeImages");
  });

  it("hosts MCP on Pi and does not push mcp.json through AcpService", () => {
    const mcpIpc = sourceOf("src/main/ipc/mcp.ts");
    const host = sourceOf("src/main/agent/mcp-host.ts");
    const chatSend = sourceOf("src/renderer/stores/chat/send.ts");
    const experts = sourceOf("src/main/teams/project-subagents-refresh.ts");

    expect(mcpIpc).not.toMatch(/from\s+["'][^"']*acp\//);
    expect(mcpIpc).not.toContain("AcpService");
    expect(mcpIpc).not.toContain("prewarmProject");
    expect(mcpIpc).not.toContain("applyProjectMcpConfig");
    expect(host).not.toMatch(/from\s+["'][^"']*acp\//);
    expect(host).toContain("selectMcpServers");
    expect(chatSend).toContain("mcpServerAllowlist");
    expect(experts).not.toContain("applyProjectMcpConfig");
  });

  it("stops a Pi subagent through the Agent API, not OpenCode Task", () => {
    const chatSend = sourceOf("src/renderer/stores/chat/send.ts");
    const runtime = sourceOf("src/main/agent/pi-subsession-runtime.ts");
    const factory = sourceOf("src/main/agent/pi-sdk-runtime.ts");
    const reducer = sourceOf("src/shared/agent/conversation-reducer.ts");

    expect(chatSend).toContain("agentCancelSubagent");
    expect(chatSend).not.toContain("chatStopSubAgent");
    expect(chatSend).not.toContain("chatGetSubAgentActivity");
    expect(runtime).toContain("cancelByParentToolCallId");
    expect(factory).toContain("createPiSubagentRunnerFactory");
    expect(reducer).toContain("applySubagentEvent");
    expect(reducer).not.toMatch(/if \(event\.subagent\) \{\s*return marked;/);
  });

  it("does not start OpenCode on the product boot or conversation path", () => {
    const ipcIndex = sourceOf("src/main/ipc/index.ts");
    const main = sourceOf("src/main/index.ts");
    const settings = sourceOf("src/main/ipc/settings.ts");
    const prewarm = sourceOf("src/main/session/project-chat-prewarm.ts");
    const experts = sourceOf("src/main/teams/project-subagents-refresh.ts");
    const resolver = sourceOf("src/main/teams/resolver.ts");
    const experiment = sourceOf("src/main/ipc/experiment.ts");
    const registry = sourceOf("src/main/session/chat-session-registry.ts");
    const literature = sourceOf("src/main/literature/citation/literature-citation-staging.ts");
    const citations = sourceOf("src/main/session/session-citations-context.ts");
    const libraryTask = sourceOf("src/main/session/library-task-context.ts");

    expect(ipcIndex).not.toContain("registerChatHandlers");
    expect(ipcIndex).not.toMatch(/from\s+["']\.\/chat["']/);
    expect(main).not.toMatch(/from\s+["'][^"']*acp\/service/);
    expect(main).not.toContain("AcpService");
    expect(main).not.toMatch(/from\s+["']\.\/ipc\/chat["']/);
    expect(main).not.toContain("startPlanSuggestBridge");
    expect(settings).not.toMatch(/from\s+["'][^"']*acp\/service/);
    expect(settings).not.toContain("reloadAfter");
    expect(prewarm).not.toMatch(/from\s+["'][^"']*acp\/service/);
    expect(prewarm).not.toContain("reloadAfterSkillsIntegration");
    expect(experts).not.toMatch(/from\s+["'][^"']*acp\/service/);
    expect(experts).not.toContain("reloadAfterExpertsIntegration");
    expect(resolver).not.toMatch(/from\s+["'][^"']*acp\/service/);
    expect(experiment).not.toMatch(/from\s+["'][^"']*acp\/service/);
    expect(registry).not.toMatch(/from\s+["'][^"']*acp\//);
    expect(literature).not.toMatch(/from\s+["'][^"']*acp\/service/);
    expect(citations).not.toMatch(/from\s+["'][^"']*acp\/service/);
    expect(libraryTask).not.toMatch(/from\s+["'][^"']*acp\/service/);
    expect(existsSync(join(REPO, "src/main/acp"))).toBe(false);
    expect(existsSync(join(REPO, "src/main/ipc/chat.ts"))).toBe(false);
    expect(existsSync(join(REPO, "src/main/tools/index.ts"))).toBe(false);
    expect(existsSync(join(REPO, "src/renderer/hooks/use-opencode-events.ts"))).toBe(false);
    expect(existsSync(join(REPO, "src/main/services/opencode-binary.ts"))).toBe(false);
    expect(existsSync(join(REPO, "src/shared/opencode-version.ts"))).toBe(false);
    expect(existsSync(join(REPO, "scripts/download-opencode.sh"))).toBe(false);
    expect(existsSync(join(REPO, "scripts/opencode-version.txt"))).toBe(false);

    const builder = sourceOf("electron-builder.yml");
    expect(builder).not.toMatch(/bin\/opencode/);
    expect(builder).toMatch(/bin\/tectonic/);

    const agentFiles = walkTsFiles(join(REPO, "src/main/agent"));
    for (const file of agentFiles) {
      const src = readFileSync(file, "utf-8");
      expect(src, file).not.toMatch(/from\s+["'][^"']*acp\//);
    }
  });
});
