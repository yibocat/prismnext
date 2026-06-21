// prism-next/src/renderer/actions/builtin-actions.ts
//
// Register ALL built-in action command handlers here.
// This file is side-effect-imported by ChatComposer on mount so that
// every handler is registered before the first user sends a command.
//
// ─── ADDING A NEW BUILTIN ACTION ─────────────────────────────────────
//
//   1. Define the command entry in:
//      src/main/commands/builtin-commands.ts
//      (see the doc comment at the top of that file for the exact format)
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
//     - CommandDef.action   (in builtin-commands.ts)
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

// ── compile-document ──
actionRegistry.register("compile-document", async () => {
  await compileCurrentDocument();
  return "Compilation completed.";
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
  return `${verb} .prismnext/agent/AGENTS.md from a local project scan (${result.stats.dirsListed} dirs, ${result.stats.filesListed} files). Add text after /setup to ask AI to refine it.`;
});

// ── compact-context ──
actionRegistry.register("compact-context", async () => {
  const { useChatStore } = await import("@/stores/chat-store");
  const { useDocumentStore } = await import("@/stores/document-store");

  const chatState = useChatStore.getState();
  const sessionId = chatState.sessionId;
  const projectPath = useDocumentStore.getState().projectRoot;

  if (!sessionId || !projectPath) {
    throw new Error("No active session — start a conversation first.");
  }

  await window.electronAPI.chatCompact(sessionId, projectPath);
  return "Context compacted. Old messages have been summarized to free token space.";
});

// ── restore-previous-turn ──
actionRegistry.register("restore-previous-turn", async () => {
  const { useChatStore } = await import("@/stores/chat-store");
  const { useCheckpointStore } = await import("@/stores/checkpoint-store");

  const tabId = useChatStore.getState().activeTabId;
  const restored = await useCheckpointStore.getState().restorePreviousTurn(tabId);

  if (restored == null) {
    throw new Error("No checkpoint to restore — complete a turn that modified files first.");
  }

  return `Restored ${restored} file(s) to the previous turn. Files and chat history were rolled back.`;
});

// ── undo-last-restore ──
actionRegistry.register("undo-last-restore", async () => {
  const { useChatStore } = await import("@/stores/chat-store");
  const { useCheckpointStore } = await import("@/stores/checkpoint-store");

  const tabId = useChatStore.getState().activeTabId;
  const ok = await useCheckpointStore.getState().undoLastRestore(tabId);

  if (!ok) {
    throw new Error("Nothing to undo — restore workspace files to an earlier turn first.");
  }

  return "Restore undone. Workspace files and chat history are back to their pre-restore state.";
});
