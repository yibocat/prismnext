import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";
import { getMentionableFiles } from "@/lib/files/mentionable-files";
import { pickComposerAttachments, projectFileToAttachment, attachmentsFromAbsolutePaths, type ComposerAttachment } from "@/lib/chat/composer-attach-file";
import { isComposerEmpty, type ComposerPart, COMPOSER_PLACEHOLDER } from "@/lib/chat/composer-parts";
import { loadSlashCatalog } from "@/lib/chat/slash-catalog";
import { useChatStore } from "@/stores/chat-store";
import { useLayoutStore } from "@/stores/layout-store";
import { useComposerInsertStore } from "@/stores/composer-insert-store";
import { useComposerEditorStore } from "@/stores/composer-editor-store";
import { useDocumentStore } from "@/stores/document-store";
import { useCommandStore } from "@/stores/command-store";
import { useSettingsStore } from "@/stores/settings-store";
import { actionRegistry } from "@/actions/registry";
import "@/actions/builtin-actions";
import type { ExpertInfo } from "@shared/agent-experts";
import { getModel, modelSupportsVision, resolveProviderConfig } from "@/lib/providers";
import type { ContentBlock } from "@/stores/chat-store";
import {
  compileComposerPrompt,
  shouldSendPromptToAgent,
  buildComposerDisplayBlocks,
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
  const composerAttachNonce = useComposerInsertStore((s) => s.attachNonce);

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

  const [experts, setExperts] = useState<ExpertInfo[]>([]);
  const [slashSkills, setSlashSkills] = useState<{ id: string; name: string; enabled: boolean }[]>([]);
  const [slashMcps, setSlashMcps] = useState<{ name: string }[]>([]);
  const [pinnedContexts, setPinnedContexts] = useState<PinnedContext[]>([]);
  const pinnedContextsRef = useRef(pinnedContexts);
  pinnedContextsRef.current = pinnedContexts;
  const [pendingAttachments, setPendingAttachments] = useState<ComposerAttachment[]>([]);
  const pendingAttachmentsRef = useRef(pendingAttachments);
  pendingAttachmentsRef.current = pendingAttachments;

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
      setExperts([]);
      setSlashSkills([]);
      setSlashMcps([]);
      return;
    }
    const loadMentions = async () => {
      try {
        const expertList = await window.electronAPI.expertsList(projectRoot);
        setExperts(expertList.filter((e) => e.enabled));
      } catch {
        setExperts([]);
      }
    };
    void loadMentions();
    void refreshSlashCatalog();
  }, [projectRoot, refreshSlashCatalog]);

  const activeTabId = useChatStore((s) => s.activeTabId);
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

  const canSend =
    !isComposerEmpty(draftParts) ||
    pinnedContexts.length > 0 ||
    pendingAttachments.length > 0;

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

  const handleSend = useCallback(async () => {
    const parts = editorRef.current?.getParts() ?? draftParts;
    const attachments = pendingAttachmentsRef.current;
    if (isComposerEmpty(parts) && pinnedContextsRef.current.length === 0 && attachments.length === 0) {
      return;
    }
    if (isStreaming) return;

    const store = useChatStore.getState();
    const tabId = store.activeTabId;
    const pinnedAtSend = pinnedContextsRef.current.map((c) => ({
      filePath: c.filePath,
      selectedText: c.selectedText,
    }));
    const pinnedCountAtSend = pinnedAtSend.length;
    const attachmentCountAtSend = attachments.length;

    // Fast path: show the user bubble + clear composer before any disk/network work.
    const quickDisplay = buildComposerDisplayBlocks(parts, attachments);
    let skipUserAppend = false;
    if (quickDisplay.length > 0) {
      flushSync(() => {
        store._appendMessage(tabId, {
          type: "user",
          message: { content: quickDisplay },
        });
        store._setStreaming(tabId, true);
      });
      skipUserAppend = true;
      setDraftParts([{ type: "text", text: "" }]);
      setPinnedContexts([]);
      setPendingAttachments([]);
      editorRef.current?.focus();
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

    // Stopped while compiling attachments.
    if (!useChatStore.getState().tabs.find((t) => t.id === tabId)?.isStreaming && skipUserAppend) {
      return;
    }

    const settings = useSettingsStore.getState().settings;
    const currentProviderId = settings.aiProvider || "anthropic";
    const currentProvider = resolveProviderConfig(currentProviderId, settings.aiCustomProviders);
    const currentModelId = settings.aiModel ?? currentProvider?.defaultModel ?? "";
    const currentModel = currentModelId
      ? getModel(
          currentProviderId,
          currentModelId,
          settings.aiCustomModelsData,
          settings.aiCustomProviders,
        )
      : undefined;
    const currentSupportsVision = modelSupportsVision(currentModel);

    let promptImages = compiled.promptImages;
    let promptFiles = compiled.promptFiles;
    let promptText = compiled.promptText;
    let displayBlocks = compiled.displayBlocks;

    if (compiled.promptImages.length > 0 && !currentSupportsVision) {
      const helperRef = settings.aiVisionFallbackModel?.trim();
      if (!helperRef) {
        store._setStreaming(tabId, false);
        toast.error("当前模型不支持图片输入，请先在 Settings 里配置多模态辅助模型。");
        return;
      }

      const slash = helperRef.indexOf("/");
      if (slash <= 0 || slash >= helperRef.length - 1) {
        store._setStreaming(tabId, false);
        toast.error("多模态辅助模型配置无效，请重新选择。");
        return;
      }

      const helperProviderId = helperRef.slice(0, slash);
      const helperModelId = helperRef.slice(slash + 1);
      const helperApiKey = settings.aiApiKeys?.[helperProviderId]?.trim();
      if (!helperApiKey) {
        store._setStreaming(tabId, false);
        toast.error("多模态辅助模型对应的 Provider 未配置 API Key，请先在 Settings 中配置。");
        return;
      }
      const helperModel = getModel(
        helperProviderId,
        helperModelId,
        settings.aiCustomModelsData,
        settings.aiCustomProviders,
      );
      if (!modelSupportsVision(helperModel)) {
        store._setStreaming(tabId, false);
        toast.error("所选多模态辅助模型没有标记 Vision 能力，请在 Settings 里检查模型能力。");
        return;
      }

      const helperLabel = helperModel?.name ?? helperModelId;
      try {
        const result = await window.electronAPI.chatDescribeImages({
          providerId: helperProviderId,
          modelId: helperModelId,
          images: compiled.promptImages,
        });
        if (!useChatStore.getState().tabs.find((t) => t.id === tabId)?.isStreaming) {
          return;
        }
        const descriptionBlocks = result.descriptions.map((desc, i) =>
          [
            `### Image ${i + 1}: ${desc.name}`,
            desc.cached ? `- via: ${helperLabel} (cached)` : `- via: ${helperLabel}`,
            desc.text.trim(),
          ].join("\n\n"),
        );
        promptText = [
          "## Attached images (via vision fallback)",
          "",
          ...descriptionBlocks,
          "",
          compiled.promptText,
        ].join("\n");
        promptImages = [];
        displayBlocks = withImageAttachmentNotes(
          compiled.displayBlocks,
          `已通过 ${helperLabel} 识图`,
        );
        patchTabUserImageNotes(tabId, `已通过 ${helperLabel} 识图`);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "图片识别失败，请检查多模态辅助模型配置。";
        store._setStreaming(tabId, false);
        toast.error(`图片识别失败：${message}`);
        return;
      }
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

    if (shouldSendPromptToAgent(compiled, parts, pinnedCountAtSend + attachmentCountAtSend)) {
      const hadSetup = compiled.actionCommands.some((c) => c.commandName === "setup");
      let promptToSend = promptText;
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
      sendPrompt(promptToSend, displayBlocks, skipUserAppend, {
        mcpServerAllowlist: compiled.mcpServerNames,
        skillIds: compiled.skillIds,
        hasPaperSnippets: compiled.paperSnippetCount > 0,
        selectedExpertIds: compiled.selectedExpertIds,
        orchestratorId: store.tabs.find((t) => t.id === tabId)?.orchestratorId ?? null,
        promptImages,
        promptFiles,
      });
    } else if (displayBlocks.length > 0 || skipUserAppend) {
      const projectPath = useDocumentStore.getState().projectRoot;
      const sessionId = store.tabs.find((t) => t.id === tabId)?.sessionId;
      if (projectPath && sessionId && displayBlocks.length > 0) {
        void window.electronAPI.sessionAppendUserDisplay(
          projectPath,
          sessionId,
          displayBlocks,
        );
      }
      store._setStreaming(tabId, false);
    }

    if (!skipUserAppend) {
      setDraftParts([{ type: "text", text: "" }]);
      setPinnedContexts([]);
      setPendingAttachments([]);
      editorRef.current?.focus();
    }
  }, [draftParts, isStreaming, sendPrompt, commands, expandCommand, setDraftParts]);

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
    placeholder,
    handleSend,
    handleAddFile,
    handleAddImage,
    cancelExecution,
  };
}
