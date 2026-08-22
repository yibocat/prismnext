import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";
import { useMentionableFiles } from "@/lib/files/mentionable-files";
import { pickComposerAttachments, projectFileToAttachment, attachmentsFromAbsolutePaths, type ComposerAttachment } from "@/lib/chat/composer-attach-file";
import { isComposerEmpty, type ComposerPart, COMPOSER_PLACEHOLDER, composerNeedsExpandedLayout } from "@/lib/chat/composer-parts";
import { loadSlashCatalog } from "@/lib/chat/slash-catalog";
import { listProjectSubagents } from "@/lib/settings";
import { useChatStore } from "@/stores/chat-store";
import { useLayoutStore } from "@/stores/layout-store";
import { useComposerInsertStore } from "@/stores/composer-insert-store";
import { useComposerEditorStore } from "@/stores/composer-editor-store";
import { useDocumentStore } from "@/stores/document-store";
import { useCommandStore } from "@/stores/command-store";
import { useSettingsStore } from "@/stores/settings-store";
import { actionRegistry } from "@/actions/registry";
import "@/actions/builtin-actions";
import type { SubagentInfo } from "@shared/agent/subagents";
import type { ContentBlock } from "@/stores/chat-store";
import { applyVisionFallbackForSend, visionFallbackErrorMessage } from "@/lib/chat/vision-fallback-send";
import {
  appendComposerParts,
  combineComposerQueueItems,
  createComposerQueueItemId,
  isComposerQueuePayloadEmpty,
  type ComposerQueueItem,
} from "@/lib/chat/composer-send-queue";
import {
  compileComposerPrompt,
  shouldSendPromptToAgent,
  buildComposerDisplayBlocks,
} from "@/components/modules/chat/inline-composer";
import { loadDraftParts, type InlineComposerEditorHandle } from "@/lib/chat/composer-draft";

function offsetToLineCol(
  text: string,
  offset: number,
): { line: number; col: number } {
  const lines = text.slice(0, offset).split("\n");
  return { line: lines.length, col: lines[lines.length - 1].length + 1 };
}

function withImageAttachmentNotes(
  blocks: ContentBlock[],
  note: string,
): ContentBlock[] {
  return blocks.map((block) => {
    if (block.type !== "text" || !block.attachments?.length) return block;
    return {
      ...block,
      attachments: block.attachments.map((att) =>
        att.kind === "image" ? { ...att, note } : att,
      ),
    };
  });
}

function patchTabUserImageNotes(tabId: string, note: string) {
  useChatStore.setState((s) => {
    const tabs = s.tabs.map((t) => {
      if (t.id !== tabId) return t;
      const messages = [...t.messages];
      for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        if (m.type !== "user" || !m.message?.content) continue;
        messages[i] = {
          ...m,
          message: {
            ...m.message,
            content: withImageAttachmentNotes(m.message.content, note),
          },
        };
        break;
      }
      return { ...t, messages };
    });
    const activeTab = tabs.find((t) => t.id === s.activeTabId);
    return { tabs, messages: activeTab?.messages ?? s.messages };
  });
}

export interface PinnedContext {
  label: string;
  filePath: string;
  selectedText: string;
}

/** Prevent duplicate auto-drain when Panel + AiBar both mount useChatComposer. */
let _queueDrainInFlight = false;

/** @deprecated import from `@/lib/chat/composer-parts` */
export { composerNeedsExpandedLayout } from "@/lib/chat/composer-parts";

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
  const draftEmpty = useComposerEditorStore((s) => s.draftEmpty);
  const composerInsertNonce = useComposerInsertStore((s) => s.nonce);
  const composerAttachNonce = useComposerInsertStore((s) => s.attachNonce);

  const commands = useCommandStore((s) => s.commands);
  const searchCommands = useCommandStore((s) => s.searchCommands);
  const expandCommand = useCommandStore((s) => s.expandCommand);
  const loadCommands = useCommandStore((s) => s.loadCommands);

  const files = useDocumentStore((s) => s.files);
  const fileMetadata = useDocumentStore((s) => s.fileMetadata);
  const mentionableFiles = useMentionableFiles(files, fileMetadata);
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const activeFileId = useDocumentStore((s) => s.activeFileId);
  const selectionRange = useDocumentStore((s) => s.selectionRange);

  const [experts, setExperts] = useState<SubagentInfo[]>([]);
  const [slashSkills, setSlashSkills] = useState<{ id: string; name: string; enabled: boolean }[]>([]);
  const [slashMcps, setSlashMcps] = useState<{ name: string }[]>([]);
  const [pinnedContexts, setPinnedContexts] = useState<PinnedContext[]>([]);
  const pinnedContextsRef = useRef(pinnedContexts);
  pinnedContextsRef.current = pinnedContexts;
  const [pendingAttachments, setPendingAttachments] = useState<ComposerAttachment[]>([]);
  const pendingAttachmentsRef = useRef(pendingAttachments);
  pendingAttachmentsRef.current = pendingAttachments;

  const draftParts = useMemo(() => loadDraftParts(tabDraft), [tabDraft]);

  const setDraftParts = useCallback((parts: ComposerPart[], immediate = false) => {
    const tabId = useChatStore.getState().activeTabId;
    const editorStore = useComposerEditorStore.getState();
    if (immediate) {
      editorStore.replaceDraftNow(tabId, parts);
    } else {
      editorStore.scheduleDraftPersist(tabId, parts);
    }
  }, []);

  const activeTabId = useChatStore((s) => s.activeTabId);
  useEffect(() => {
    useComposerEditorStore.getState().flushDraftPersist();
    const tab = useChatStore.getState().tabs.find((t) => t.id === activeTabId);
    const parts = loadDraftParts(tab?.draft);
    const empty = isComposerEmpty(parts);
    useComposerEditorStore.setState({
      draftEmpty: empty,
      draftNeedsExpanded: composerNeedsExpandedLayout(parts),
    });
  }, [activeTabId]);

  const refreshSlashCatalog = useCallback(async () => {
    const { skills, mcps } = await loadSlashCatalog(projectRoot);
    setSlashSkills(skills);
    setSlashMcps(mcps);
  }, [projectRoot]);

  useEffect(() => {
    if (!projectRoot) {
      setExperts([]);
      setSlashSkills([]);
      setSlashMcps([]);
      return;
    }
    const loadMentions = async () => {
      try {
        const expertList = await listProjectSubagents(projectRoot);
        setExperts(expertList.filter((e) => e.enabled));
      } catch {
        setExperts([]);
      }
    };
    void loadMentions();
    void refreshSlashCatalog();
  }, [projectRoot, refreshSlashCatalog]);

  useEffect(() => {
    setPinnedContexts([]);
    setPendingAttachments([]);
  }, [activeTabId]);

  useEffect(() => {
    flushPendingInsert();
  }, [composerInsertNonce, flushPendingInsert]);

  const addAttachmentsFromPaths = useCallback(async (paths: string[], opts?: { imagesOnly?: boolean }) => {
    const next = await attachmentsFromAbsolutePaths(paths, opts);
    if (next.length === 0) return;
    setPendingAttachments((prev) => {
      const seen = new Set(prev.map((a) => a.absolutePath));
      return [...prev, ...next.filter((a) => !seen.has(a.absolutePath))];
    });
  }, []);

  // Peek (don't consume yet) so React Strict Mode remount can still see the same paths.
  const handledAttachNonceRef = useRef(0);
  useEffect(() => {
    if (composerAttachNonce === 0) return;
    if (handledAttachNonceRef.current === composerAttachNonce) return;
    const paths = useComposerInsertStore.getState().pendingAttachPaths;
    if (!paths?.length) {
      handledAttachNonceRef.current = composerAttachNonce;
      return;
    }
    handledAttachNonceRef.current = composerAttachNonce;
    void addAttachmentsFromPaths(paths).finally(() => {
      const st = useComposerInsertStore.getState();
      if (st.attachNonce === composerAttachNonce && st.pendingAttachPaths?.length) {
        st.consumeAttachPaths();
      }
    });
  }, [composerAttachNonce, addAttachmentsFromPaths]);

  useEffect(() => {
    useComposerInsertStore.getState().setComposerAttachmentCount(pendingAttachments.length);
  }, [pendingAttachments.length]);

  const currentContextLabel = useMemo(() => {
    if (!selectionRange) return null;
    const file = files.find((f) => f.id === activeFileId);
    if (!file) return null;
    const content = useDocumentStore.getState().getAsset(activeFileId!);
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
    const content = useDocumentStore.getState().getAsset(activeFileId!);
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

  const queueLength = useChatStore(
    (s) => {
      const tab = s.tabs.find((t) => t.id === s.activeTabId);
      if (!tab) return 0;
      return tab.composerSendQueue.length + (tab.composerQueuePendingFlush ? 1 : 0);
    },
  );

  const canSend =
    !draftEmpty ||
    pinnedContexts.length > 0 ||
    pendingAttachments.length > 0 ||
    queueLength > 0;

  const appendAttachments = useCallback(async (files: Awaited<ReturnType<typeof pickComposerAttachments>>) => {
    if (files.length === 0) return;
    const next = await Promise.all(files.map((f) => projectFileToAttachment(f)));
    setPendingAttachments((prev) => {
      const seen = new Set(prev.map((a) => a.absolutePath));
      return [...prev, ...next.filter((a) => !seen.has(a.absolutePath))];
    });
  }, []);

  const handleAddFile = useCallback(async () => {
    const picked = await pickComposerAttachments();
    await appendAttachments(picked);
  }, [appendAttachments]);

  const handleAddImage = useCallback(async () => {
    const picked = await pickComposerAttachments({ imagesOnly: true });
    await appendAttachments(picked);
  }, [appendAttachments]);

  const removeAttachment = useCallback((id: string) => {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const clearComposerUi = useCallback(() => {
    setDraftParts([{ type: "text", text: "" }], true);
    setPinnedContexts([]);
    setPendingAttachments([]);
    editorRef.current?.focus();
  }, [setDraftParts]);

  const executeSendPayload = useCallback(async (payload: {
    parts: ComposerPart[];
    pinnedContexts: Array<{ label: string; filePath: string; selectedText: string }>;
    attachments: ComposerAttachment[];
  }) => {
    if (isComposerQueuePayloadEmpty(payload)) return;

    const store = useChatStore.getState();
    const tabId = store.activeTabId;
    const pinnedAtSend = payload.pinnedContexts.map((c) => ({
      filePath: c.filePath,
      selectedText: c.selectedText,
    }));
    const pinnedCountAtSend = pinnedAtSend.length;
    const attachmentCountAtSend = payload.attachments.length;
    const parts = payload.parts;
    const attachments = payload.attachments;

    const quickDisplay = buildComposerDisplayBlocks(parts, attachments);
    let skipUserAppend = false;
    if (quickDisplay.length > 0) {
      flushSync(() => {
        store._setStreaming(tabId, true);
        clearComposerUi();
      });
      skipUserAppend = true;
    }

    let compiled;
    try {
      compiled = await compileComposerPrompt(parts, expandCommand, pinnedAtSend, attachments);
    } catch (err) {
      store._setStreaming(tabId, false);
      toast.error(
        err instanceof Error ? `发送失败：${err.message}` : "发送失败：无法读取附件内容。",
      );
      return;
    }

    if (!useChatStore.getState().tabs.find((t) => t.id === tabId)?.isStreaming && skipUserAppend) {
      return;
    }

    const settings = useSettingsStore.getState().settings;

    let promptImages = compiled.promptImages;
    let promptFiles = compiled.promptFiles;
    let promptText = compiled.promptText;
    let displayBlocks = compiled.displayBlocks;

    if (compiled.promptImages.length > 0) {
      store._setPreparePhase(tabId, null);
      try {
        const applied = await applyVisionFallbackForSend({
          promptText: compiled.promptText,
          promptImages: compiled.promptImages,
          displayBlocks: compiled.displayBlocks,
          settings,
        });
        if (!useChatStore.getState().tabs.find((t) => t.id === tabId)?.isStreaming) {
          return;
        }
        promptText = applied.promptText;
        promptImages = applied.promptImages;
        displayBlocks = applied.displayBlocks;
        if (applied.note) {
          patchTabUserImageNotes(tabId, applied.note);
        }
      } catch (err) {
        store._setStreaming(tabId, false);
        toast.error(visionFallbackErrorMessage(err));
        return;
      }
    }

    for (const actionCmd of compiled.actionCommands) {
      const cmd = commands.find(
        (c) => c.name === actionCmd.commandName && c.action === actionCmd.action,
      );
      if (!cmd?.action) continue;

      const toastId = `action-${cmd.action}-${Date.now()}`;
      toast.loading(cmd.name, { id: toastId });
      try {
        const feedback = await actionRegistry.execute(cmd.action!);
        toast.success(typeof feedback === "string" && feedback.trim() ? feedback : cmd.name, {
          id: toastId,
        });
      } catch (err: any) {
        toast.error(err?.message || String(err), { id: toastId });
      }
    }

    if (shouldSendPromptToAgent(compiled, parts, pinnedCountAtSend + attachmentCountAtSend)) {
      const hadSetup = compiled.actionCommands.some((c) => c.commandName === "setup");
      let promptToSend = promptText;
      if (hadSetup) {
        promptToSend = [
          "Refine `.workbench/agent/AGENTS.md` based on the user request below.",
          "The file was just scaffolded by `/setup` from a local project scan.",
          "",
          "Rules:",
          "- Read `.workbench/agent/AGENTS.md` first, then update it in one write.",
          "- Do NOT re-explore the repository (no glob/grep/list unless the user explicitly asked).",
          "- Keep sections concise; this file is for AI agents, not end-user docs.",
          "",
          `User request: ${compiled.promptText}`,
        ].join("\n");
      }
      sendPrompt(promptToSend, displayBlocks, skipUserAppend, {
        mcpServerAllowlist: compiled.mcpServerNames,
        skillIds: compiled.skillIds,
        hasPaperSnippets: compiled.paperSnippetCount > 0,
        selectedExpertIds: compiled.selectedExpertIds,
        orchestratorId: store.tabs.find((t) => t.id === tabId)?.orchestratorId ?? null,
        sessionTeamId: store.tabs.find((t) => t.id === tabId)?.sessionTeamId ?? null,
        promptImages,
        promptFiles,
      });
    } else if (displayBlocks.length > 0 || skipUserAppend) {
      store._setStreaming(tabId, false);
    }

    if (!skipUserAppend) {
      clearComposerUi();
    }
  }, [clearComposerUi, commands, expandCommand, sendPrompt]);

  const executeSendPayloadRef = useRef(executeSendPayload);
  executeSendPayloadRef.current = executeSendPayload;

  const drainComposerQueue = useCallback(async () => {
    if (_queueDrainInFlight) return;
    const store = useChatStore.getState();
    const tabId = store.activeTabId;
    const tab = store.tabs.find((t) => t.id === tabId);
    if (!tab || tab.isStreaming) return;
    if (!tab.composerQueuePendingFlush && tab.composerSendQueue.length === 0) return;

    _queueDrainInFlight = true;
    try {
      // One-click / auto-drain = merge everything into a single turn (never N turns).
      const pending = store.takeComposerQueuePendingFlush(tabId);
      const rest = store.takeComposerSendQueueCombined(tabId);
      const payload = pending && rest
        ? combineComposerQueueItems([pending, rest])
        : (pending ?? rest);
      if (!payload) return;
      await executeSendPayloadRef.current(payload);
    } finally {
      _queueDrainInFlight = false;
    }
  }, []);

  const wasStreamingRef = useRef(isStreaming);
  useEffect(() => {
    const was = wasStreamingRef.current;
    wasStreamingRef.current = isStreaming;
    if (was && !isStreaming) {
      void drainComposerQueue();
    }
  }, [isStreaming, drainComposerQueue]);

  const handleSend = useCallback(async () => {
    useComposerEditorStore.getState().flushDraftPersist();
    const parts = editorRef.current?.getParts() ?? draftParts;
    const attachments = pendingAttachmentsRef.current;
    const pinned = pinnedContextsRef.current;
    const empty =
      isComposerEmpty(parts) && pinned.length === 0 && attachments.length === 0;

    const store = useChatStore.getState();
    const tabId = store.activeTabId;
    const tab = store.tabs.find((t) => t.id === tabId);
    const queue = tab?.composerSendQueue ?? [];

    // Empty Enter: flush queue. While streaming → stop turn, then send as next.
    if (empty) {
      if (queue.length === 0 && !tab?.composerQueuePendingFlush) return;
      if (isStreaming) {
        if (queue.length > 0) store.commitComposerQueueFlush(tabId);
        await cancelExecution();
        // cancel clears isStreaming → drainComposerQueue effect sends pendingFlush
        return;
      }
      // Idle: send pending flush and/or combine remaining queue immediately.
      const pending = store.takeComposerQueuePendingFlush(tabId);
      if (pending && queue.length === 0) {
        await executeSendPayload(pending);
        return;
      }
      if (pending && queue.length > 0) {
        const rest = store.takeComposerSendQueueCombined(tabId);
        const merged = rest
          ? combineComposerQueueItems([pending, rest])
          : pending;
        await executeSendPayload(merged);
        return;
      }
      const combined = store.takeComposerSendQueueCombined(tabId);
      if (combined) await executeSendPayload(combined);
      return;
    }

    // Streaming + content: enqueue and clear composer.
    if (isStreaming) {
      const item: ComposerQueueItem = {
        id: createComposerQueueItemId(),
        parts: structuredClone(parts),
        pinnedContexts: pinned.map((c) => ({ ...c })),
        attachments: attachments.map((a) => ({ ...a })),
        createdAt: Date.now(),
      };
      store.enqueueComposerSend(tabId, item);
      clearComposerUi();
      return;
    }

    await executeSendPayload({
      parts,
      pinnedContexts: pinned,
      attachments,
    });
  }, [cancelExecution, clearComposerUi, draftParts, executeSendPayload, isStreaming]);

  const handleQueueEdit = useCallback((itemId: string) => {
    const store = useChatStore.getState();
    const tabId = store.activeTabId;
    const tab = store.tabs.find((t) => t.id === tabId);
    const item = tab?.composerSendQueue.find((q) => q.id === itemId);
    if (!item) return;
    store.removeComposerSend(tabId, itemId);

    const currentParts = editorRef.current?.getParts() ?? draftParts;
    setDraftParts(appendComposerParts(currentParts, item.parts), true);
    setPinnedContexts((prev) => {
      const seen = new Set(prev.map((c) => `${c.filePath}\0${c.selectedText}`));
      const next = [...prev];
      for (const ctx of item.pinnedContexts) {
        const key = `${ctx.filePath}\0${ctx.selectedText}`;
        if (seen.has(key)) continue;
        seen.add(key);
        next.push(ctx);
      }
      return next;
    });
    setPendingAttachments((prev) => {
      const seen = new Set(prev.map((a) => a.absolutePath));
      return [
        ...prev,
        ...item.attachments.filter((a) => !seen.has(a.absolutePath)),
      ];
    });
    editorRef.current?.focus();
  }, [draftParts, setDraftParts]);

  const handleQueueSendOne = useCallback(async (itemId: string) => {
    const store = useChatStore.getState();
    const tabId = store.activeTabId;
    const tab = store.tabs.find((t) => t.id === tabId);
    const item = tab?.composerSendQueue.find((q) => q.id === itemId);
    if (!item) return;

    if (isStreaming) {
      store.promoteComposerSendToPendingFlush(tabId, itemId);
      await cancelExecution();
      return;
    }

    store.removeComposerSend(tabId, itemId);
    await executeSendPayload(item);
  }, [cancelExecution, executeSendPayload, isStreaming]);

  const handleQueueDelete = useCallback((itemId: string) => {
    const store = useChatStore.getState();
    store.removeComposerSend(store.activeTabId, itemId);
  }, []);

  /** Fallback; UI should prefer `t("chat.composer.placeholder")`. */
  const placeholder = COMPOSER_PLACEHOLDER;

  return {
    editorRef,
    draftParts,
    setDraftParts,
    experts,
    mentionableFiles,
    searchCommands,
    slashSkills,
    slashMcps,
    pinnedContexts,
    setPinnedContexts,
    pendingAttachments,
    removeAttachment,
    addAttachmentsFromPaths,
    isArchived,
    isStreaming,
    canSend,
    queueLength,
    placeholder,
    handleSend,
    handleAddFile,
    handleAddImage,
    cancelExecution,
    handleQueueEdit,
    handleQueueSendOne,
    handleQueueDelete,
  };
}
