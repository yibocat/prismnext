// prism-next/src/renderer/actions/builtin-actions.ts
//
// Register ALL built-in action command handlers here.
// This file is side-effect-imported by ChatComposer on mount so that
// every handler is registered before the first user sends a command.
//
// ─── ADDING A NEW BUILTIN ACTION ─────────────────────────────────────
//
//   1. Define the command as a markdown file under resources/commands/
//      (app-level) or a writable team's commands/ directory.
//
//   2. Add a register() call below following the existing pattern:
//
//      // ── my-action-key ──
//      actionRegistry.register("my-action-key", () => {
//        // Your synchronous or asynchronous logic here.
//        // Import what you need — this is a standard renderer module.
//        return "Human-readable feedback shown in the action-status card";
//      });
//
//   3. That's it. The ChatComposer and command engine need no changes.
//
//   The `action` key string must match EXACTLY between:
//     - frontmatter `action:` on the command markdown
//     - actionRegistry.register() call  (in this file)
//
//   If they don't match, execute() throws an Error and the user sees
//   an error status card instead of a successful execution.
//
// ─── HANDLER RULES ───────────────────────────────────────────────────
//
//   - Handlers can be sync or async (the registry awaits both).
//   - A handler's return string is shown in the action-status card as
//     the result text. Keep it concise (1-2 sentences).
//   - If your handler throws, the error message becomes the result text
//     and the status card shows the error state.
//   - Do NOT import from main-process modules — this runs in the renderer.

import { actionRegistry } from "./registry";
import { compileCurrentDocument } from "@/stores/compile-store";
import { formatCitationHealthReport } from "../../shared/format-citation-health-report";

// ── compile-document ──
actionRegistry.register("compile-document", async () => {
  await compileCurrentDocument();
  return "Compilation completed.";
});

// ── bib-check ──
actionRegistry.register("bib-check", async () => {
  const { useDocumentStore } = await import("@/stores/document-store");
  const projectRoot = useDocumentStore.getState().projectRoot;
  if (!projectRoot) {
    throw new Error("Open a project first.");
  }
  const report = await window.electronAPI.literatureCitationHealth(projectRoot);
  return formatCitationHealthReport(report);
});

// ── ensure-research-brief ──
actionRegistry.register("ensure-research-brief", async () => {
  const { useDocumentStore } = await import("@/stores/document-store");
  const projectRoot = useDocumentStore.getState().projectRoot;
  if (!projectRoot) {
    throw new Error("Open a project first.");
  }
  const result = await window.electronAPI.researchBriefEnsure(projectRoot);
  const verb = result.created ? "Created" : "Loaded";
  return (
    `${verb} ${result.path}. ` +
    "Edit in Files (from Settings → Prompts & Rules → Research brief → Edit), or let the agent update sections via research-brief-update."
  );
});

// ── setup-agents-md ──
actionRegistry.register("setup-agents-md", async () => {
  const { useDocumentStore } = await import("@/stores/document-store");
  const projectRoot = useDocumentStore.getState().projectRoot;
  if (!projectRoot) {
    throw new Error("Open a project first.");
  }

  const result = await window.electronAPI.projectScaffoldAgentsMd(projectRoot);
  await window.electronAPI.fsWrite(result.agentsMdPath, result.content);

  const verb = result.updated ? "Updated" : "Created";
  return `${verb} .workbench/agent/AGENTS.md from a local project scan (${result.stats.dirsListed} dirs, ${result.stats.filesListed} files). Add text after /setup to ask AI to refine it.`;
});

// ── compact-context ──
actionRegistry.register("compact-context", async () => {
  const { useChatStore } = await import("@/stores/chat-store");
  const { useDocumentStore } = await import("@/stores/document-store");

  const chatState = useChatStore.getState();
  const conversationId = chatState.activeTabId || chatState.sessionId;
  const projectPath = useDocumentStore.getState().projectRoot;

  if (!conversationId || !projectPath) {
    throw new Error("No active session — start a conversation first.");
  }

  const result = await window.electronAPI.agentCompact({ conversationId });
  if (!result.ok) {
    throw new Error(result.error || "Failed to compact context.");
  }
  const tabId = useChatStore.getState().activeTabId;
  if (tabId && typeof result.throughTurnIndex === "number") {
    useChatStore.getState().applyConversationCompact(tabId, {
      throughTurnIndex: result.throughTurnIndex,
      ...(result.summary ? { summary: result.summary } : {}),
    });
  }
  useChatStore.getState()._setContextTokens(tabId, null, { clearOccupancy: true });
  return "Context compacted. Old messages have been summarized to free token space.";
});

// Rollback / regret live in the chat RestoreUndoBar (checkpoint store), not
// as Core slash commands (removed: /undo, /redo).

// ── enter-plan-mode ──
// Prefer slash Modes → Plan (immediate mode switch, no command chip / no send).
// Kept for any leftover command chip that still carries this action.
actionRegistry.register("enter-plan-mode", async () => {
  const { useChatStore } = await import("@/stores/chat-store");
  useChatStore.getState().setSessionAgent("plan");
  return "Plan mode on — draft a plan first; Approve & Execute when ready.";
});
