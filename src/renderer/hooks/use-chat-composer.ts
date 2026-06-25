import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { getMentionableFiles } from "@/lib/files/mentionable-files";
import { pickComposerAttachments } from "@/lib/chat/composer-attach-file";
import { isComposerEmpty, type ComposerPart } from "@/lib/chat/composer-parts";
import { loadSlashCatalog } from "@/lib/chat/slash-catalog";
import { useChatStore } from "@/stores/chat-store";
import { useLayoutStore } from "@/stores/layout-store";
import { useComposerInsertStore } from "@/stores/composer-insert-store";
import { useComposerEditorStore } from "@/stores/composer-editor-store";
import { useDocumentStore } from "@/stores/document-store";
import { useCommandStore } from "@/stores/command-store";
import { actionRegistry } from "@/actions/registry";
import "@/actions/builtin-actions";
import type { AgentProfileInfo } from "@shared/agent-profiles";
import {
  compileComposerPrompt,
  shouldSendPromptToAgent,
  loadDraftParts,
  saveDraftFromParts,
  type InlineComposerEditorHandle,
} from "@/components/modules/chat/inline-composer";

function offsetToLineCol(
  text: string,
  offset: number,
): { line: number; col: number } {
  const lines = text.slice(0, offset).split("\n");
  return { line: lines.length, col: lines[lines.length - 1].length + 1 };
}

export interface PinnedContext {
  label: string;
  filePath: string;
  selectedText: string;
}

/** Expand capsule layout only for explicit multi-line text — not @/ tokens alone. */
export function composerNeedsExpandedLayout(parts: ComposerPart[]): boolean {
  return parts.some((p) => p.type === "text" && p.text.includes("\n"));
}

export function useChatComposer() {
  const editorRef = useRef<InlineComposerEditorHandle>(null);
  const flushPendingInsert = useComposerEditorStore((s) => s.flushPendingInsert);

  const sendPrompt = useChatStore((s) => s.sendPrompt);
  const cancelExecution = useChatStore((s) => s.cancelExecution);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const activeSessionId = useChatStore((s) => s.sessionId);
  const archivedSessionIds = useLayoutStore((s) => s.archivedSessionIds);
  const isArchived = activeSessionId ? archivedSessionIds.includes(activeSessionId) : false;
  const tabDraft = useChatStore(
    (s) => s.tabs.find((t) => t.id === s.activeTabId)?.draft,
  );
  const composerInsertNonce = useComposerInsertStore((s) => s.nonce);
  const chatMode = useChatStore(
    (s) => s.tabs.find((t) => t.id === s.activeTabId)?.chatMode ?? "agent",
  );

  const commands = useCommandStore((s) => s.commands);
  const searchCommands = useCommandStore((s) => s.searchCommands);
  const expandCommand = useCommandStore((s) => s.expandCommand);
  const loadCommands = useCommandStore((s) => s.loadCommands);

  const files = useDocumentStore((s) => s.files);
  const fileMetadata = useDocumentStore((s) => s.fileMetadata);
  const mentionableFiles = useMemo(
    () => getMentionableFiles(files, fileMetadata),
    [files, fileMetadata],
  );
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const activeFileId = useDocumentStore((s) => s.activeFileId);
  const selectionRange = useDocumentStore((s) => s.selectionRange);

  const [profiles, setProfiles] = useState<AgentProfileInfo[]>([]);
  const [slashSkills, setSlashSkills] = useState<{ id: string; name: string; enabled: boolean }[]>([]);
  const [slashMcps, setSlashMcps] = useState<{ name: string }[]>([]);
  const [pinnedContexts, setPinnedContexts] = useState<PinnedContext[]>([]);
  const pinnedContextsRef = useRef(pinnedContexts);
  pinnedContextsRef.current = pinnedContexts;

  const draftParts = useMemo(() => loadDraftParts(tabDraft), [tabDraft]);

  const setDraftParts = useCallback((parts: ComposerPart[]) => {
    const tabId = useChatStore.getState().activeTabId;
    useChatStore.getState().saveDraft(tabId, saveDraftFromParts(parts));
  }, []);

  const refreshSlashCatalog = useCallback(async () => {
    const { skills, mcps } = await loadSlashCatalog(projectRoot);
    setSlashSkills(skills);
    setSlashMcps(mcps);
  }, [projectRoot]);

  useEffect(() => {
    if (!projectRoot) {
      setProfiles([]);
      setSlashSkills([]);
      setSlashMcps([]);
      return;
    }
    void window.electronAPI.agentListProfiles(projectRoot).then(setProfiles).catch(() => setProfiles([]));
    void refreshSlashCatalog();
  }, [projectRoot, refreshSlashCatalog]);

  const activeTabId = useChatStore((s) => s.activeTabId);
  useEffect(() => {
    setPinnedContexts([]);
  }, [activeTabId]);

  useEffect(() => {
    flushPendingInsert();
  }, [composerInsertNonce, flushPendingInsert]);

  const currentContextLabel = useMemo(() => {
    if (!selectionRange) return null;
    const file = files.find((f) => f.id === activeFileId);
    if (!file) return null;
    const content = useDocumentStore.getState().getContent(activeFileId!);
    if (!content) return null;
    const start = offsetToLineCol(content, selectionRange.start);
    const end = offsetToLineCol(content, selectionRange.end);
    return `@${file.relativePath}:${start.line}:${start.col}-${end.line}:${end.col}`;
  }, [selectionRange, activeFileId, files]);

  useEffect(() => {
    if (!selectionRange || !currentContextLabel) {
      setPinnedContexts((prev) => prev.filter((c) => !c.label.includes(":")));
      return;
    }

    const file = files.find((f) => f.id === activeFileId);
    if (!file) return;
    const content = useDocumentStore.getState().getContent(activeFileId!);
    if (!content) return;

    const selectedText = content.slice(selectionRange.start, selectionRange.end);

    setPinnedContexts((prev) => {
      const filtered = prev.filter((c) => !c.label.includes(":"));
      return [
        ...filtered,
        { label: currentContextLabel, filePath: file.relativePath, selectedText },
      ];
    });
  }, [selectionRange, currentContextLabel, activeFileId, files]);

  useEffect(() => {
    const root = useDocumentStore.getState().projectRoot;
    if (root) loadCommands();
  }, [loadCommands]);

  const canSend = !isComposerEmpty(draftParts) || pinnedContexts.length > 0;

  const handleAddFile = useCallback(async () => {
    const picked = await pickComposerAttachments();
    for (const file of picked) {
      editorRef.current?.insertFileMention(file);
    }
  }, []);

  const handleAddImage = useCallback(async () => {
    const picked = await pickComposerAttachments({ imagesOnly: true });
    for (const file of picked) {
      editorRef.current?.insertFileMention(file);
    }
  }, []);

  const handleSend = useCallback(async () => {
    const parts = editorRef.current?.getParts() ?? draftParts;
    if (isComposerEmpty(parts) && pinnedContextsRef.current.length === 0) return;
    if (isStreaming) return;

    const compiled = await compileComposerPrompt(
      parts,
      expandCommand,
      pinnedContextsRef.current.map((c) => ({
        filePath: c.filePath,
        selectedText: c.selectedText,
      })),
    );

    const store = useChatStore.getState();
    const tabId = store.activeTabId;

    if (compiled.displayBlocks.length > 0) {
      store._appendMessage(tabId, {
        type: "user",
        message: { content: compiled.displayBlocks },
      });
    }

    for (const actionCmd of compiled.actionCommands) {
      const cmd = commands.find(
        (c) => c.name === actionCmd.commandName && c.action === actionCmd.action,
      );
      if (!cmd?.action) continue;

      flushSync(() => {
        store._appendMessage(tabId, {
          type: "action-status",
          action: cmd.action,
          actionName: cmd.name,
          status: "running",
        });
      });

      const startTime = performance.now();
      try {
        const feedback = await actionRegistry.execute(cmd.action!);
        await new Promise((r) => setTimeout(r, 300));

        useChatStore.setState((s) => {
          const tabs = s.tabs.map((t) => {
            if (t.id !== tabId) return t;
            const msgs = t.messages.map((m) => {
              if (
                m.type === "action-status" &&
                m.action === cmd.action &&
                m.status === "running"
              ) {
                return {
                  ...m,
                  status: "success" as const,
                  result: feedback,
                  duration_ms: performance.now() - startTime,
                };
              }
              return m;
            });
            return { ...t, messages: msgs };
          });
          const activeTab = tabs.find((t) => t.id === s.activeTabId);
          return { tabs, messages: activeTab?.messages ?? s.messages };
        });
      } catch (err: any) {
        useChatStore.setState((s) => {
          const tabs = s.tabs.map((t) => {
            if (t.id !== tabId) return t;
            const msgs = t.messages.map((m) => {
              if (
                m.type === "action-status" &&
                m.action === cmd.action &&
                m.status === "running"
              ) {
                return {
                  ...m,
                  status: "error" as const,
                  result: err?.message || String(err),
                  duration_ms: performance.now() - startTime,
                };
              }
              return m;
            });
            return { ...t, messages: msgs };
          });
          const activeTab = tabs.find((t) => t.id === s.activeTabId);
          return { tabs, messages: activeTab?.messages ?? s.messages };
        });
      }
    }

    const pinnedCount = pinnedContextsRef.current.length;

    if (shouldSendPromptToAgent(compiled, parts, pinnedCount)) {
      const hadSetup = compiled.actionCommands.some((c) => c.commandName === "setup");
      let promptToSend = compiled.promptText;
      if (hadSetup) {
        promptToSend = [
          "Refine `.prismnext/agent/AGENTS.md` based on the user request below.",
          "The file was just scaffolded by `/setup` from a local project scan.",
          "",
          "Rules:",
          "- Read `.prismnext/agent/AGENTS.md` first, then update it in one write.",
          "- Do NOT re-explore the repository (no glob/grep/list unless the user explicitly asked).",
          "- Keep sections concise; this file is for AI agents, not end-user docs.",
          "",
          `User request: ${compiled.promptText}`,
        ].join("\n");
      }
      sendPrompt(promptToSend, compiled.displayBlocks, true, compiled.selectedProfileId, {
        mcpServerAllowlist: compiled.mcpServerNames,
        skillIds: compiled.skillIds,
      });
    } else if (compiled.displayBlocks.length > 0) {
      const projectPath = useDocumentStore.getState().projectRoot;
      const sessionId = store.tabs.find((t) => t.id === tabId)?.sessionId;
      if (projectPath && sessionId) {
        void window.electronAPI.sessionAppendUserDisplay(
          projectPath,
          sessionId,
          compiled.displayBlocks,
        );
      }
    }

    setDraftParts([{ type: "text", text: "" }]);
    setPinnedContexts([]);
    editorRef.current?.focus();
  }, [draftParts, isStreaming, sendPrompt, commands, expandCommand, setDraftParts]);

  const placeholder =
    chatMode === "expert-team"
      ? "@ experts to collaborate — model per expert preset"
      : "@ agent or file, / for commands, skills & MCPs";

  return {
    editorRef,
    draftParts,
    setDraftParts,
    profiles,
    mentionableFiles,
    searchCommands,
    slashSkills,
    slashMcps,
    pinnedContexts,
    setPinnedContexts,
    isArchived,
    isStreaming,
    canSend,
    placeholder,
    handleSend,
    handleAddFile,
    handleAddImage,
    cancelExecution,
  };
}
