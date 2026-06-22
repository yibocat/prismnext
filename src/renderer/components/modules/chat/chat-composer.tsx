import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { flushSync } from "react-dom";
import {
  ArrowUpIcon,
  SquareIcon,
  XIcon,
  FileTextIcon,
  ImageIcon,
  PlusIcon,
  LinkIcon,
  Code2Icon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/chat-store";
import { useLayoutStore } from "@/stores/layout-store";
import { useDocumentStore } from "@/stores/document-store";
import { ComposerToolbar } from "./agent-settings/composer-toolbar";
import { PermissionAskPanel, usePermissionAskOpen } from "./permission-ask-panel";
import { useCommandStore } from "@/stores/command-store";
import { actionRegistry } from "@/actions/registry";
import "@/actions/builtin-actions";
import type { AgentProfileInfo } from "@shared/agent-profiles";
import {
  InlineComposerEditor,
  compileComposerPrompt,
  shouldSendPromptToAgent,
  isComposerEmpty,
  loadDraftParts,
  saveDraftFromParts,
  type ComposerPart,
  type InlineComposerEditorHandle,
} from "./inline-composer";

function offsetToLineCol(
  text: string,
  offset: number,
): { line: number; col: number } {
  const lines = text.slice(0, offset).split("\n");
  return { line: lines.length, col: lines[lines.length - 1].length + 1 };
}

interface PinnedContext {
  label: string;
  filePath: string;
  selectedText: string;
}

export function ChatComposer() {
  const [draftParts, setDraftParts] = useState<ComposerPart[]>([{ type: "text", text: "" }]);
  const draftPartsRef = useRef(draftParts);
  draftPartsRef.current = draftParts;
  const editorRef = useRef<InlineComposerEditorHandle>(null);

  const sendPrompt = useChatStore((s) => s.sendPrompt);
  const cancelExecution = useChatStore((s) => s.cancelExecution);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const activeSessionId = useChatStore((s) => s.sessionId);
  const archivedSessionIds = useLayoutStore((s) => s.archivedSessionIds);
  const isArchived = activeSessionId ? archivedSessionIds.includes(activeSessionId) : false;
  const activeTabId = useChatStore((s) => s.activeTabId);
  const chatMode = useChatStore(
    (s) => s.tabs.find((t) => t.id === s.activeTabId)?.chatMode ?? "agent",
  );
  const permissionAskOpen = usePermissionAskOpen();

  const commands = useCommandStore((s) => s.commands);
  const searchCommands = useCommandStore((s) => s.searchCommands);
  const expandCommand = useCommandStore((s) => s.expandCommand);
  const loadCommands = useCommandStore((s) => s.loadCommands);

  const files = useDocumentStore((s) => s.files);
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const activeFileId = useDocumentStore((s) => s.activeFileId);
  const selectionRange = useDocumentStore((s) => s.selectionRange);

  const [profiles, setProfiles] = useState<AgentProfileInfo[]>([]);

  useEffect(() => {
    if (!projectRoot) {
      setProfiles([]);
      return;
    }
    void window.electronAPI.agentListProfiles(projectRoot).then(setProfiles).catch(() => setProfiles([]));
  }, [projectRoot]);

  const [pinnedContexts, setPinnedContexts] = useState<PinnedContext[]>([]);
  const pinnedContextsRef = useRef(pinnedContexts);
  pinnedContextsRef.current = pinnedContexts;

  const prevTabIdRef = useRef(activeTabId);
  useEffect(() => {
    const prevTabId = prevTabIdRef.current;
    if (prevTabId !== activeTabId) {
      useChatStore.getState().saveDraft(prevTabId, saveDraftFromParts(draftPartsRef.current));
    }
    prevTabIdRef.current = activeTabId;

    const tab = useChatStore.getState().tabs.find((t) => t.id === activeTabId);
    setDraftParts(loadDraftParts(tab?.draft));
    setPinnedContexts([]);

    return () => {
      useChatStore.getState().saveDraft(activeTabId, saveDraftFromParts(draftPartsRef.current));
    };
  }, [activeTabId]);

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

  const handleSend = useCallback(async () => {
    const parts = editorRef.current?.getParts() ?? draftPartsRef.current;
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
      sendPrompt(promptToSend, compiled.displayBlocks, true, compiled.selectedProfileId);
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
    useChatStore.getState().saveDraft(tabId, saveDraftFromParts([{ type: "text", text: "" }]));
    editorRef.current?.focus();
  }, [isStreaming, sendPrompt, commands, expandCommand]);

  return (
    <div className="relative mx-auto w-full min-w-0 max-w-3xl px-3 pt-1 pb-1 overflow-hidden">
      <div className="flex w-full flex-col">
        <PermissionAskPanel />

        <div
          className={cn(
            "flex w-full flex-col overflow-hidden border border-border bg-card",
            "shadow-[0_0_2px_rgba(0,0,0,0.03)] transition-colors focus-within:border-ring",
            permissionAskOpen ? "rounded-b-lg rounded-t-none" : "rounded-lg",
          )}
        >
          {pinnedContexts.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 px-4 pt-3 pb-0">
              {pinnedContexts.map((ctx, i) => (
                <span
                  key={`${ctx.label}-${i}`}
                  className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 font-mono text-[length:var(--font-chat-meta)] text-muted-foreground"
                >
                  {ctx.label}
                  <button
                    type="button"
                    aria-label="Remove context"
                    onClick={() => setPinnedContexts((prev) => prev.filter((_, idx) => idx !== i))}
                    className="ml-0.5 rounded-sm p-0.5 transition-colors hover:bg-muted-foreground/20"
                  >
                    <XIcon className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {isArchived ? (
            <div className="px-4 py-3 text-center text-[length:var(--font-chat-meta)] text-muted-foreground">
              This session is archived — read only. Restore it to continue the conversation.
            </div>
          ) : (
            <>
              <InlineComposerEditor
                ref={editorRef}
                parts={draftParts}
                onChange={setDraftParts}
                profiles={profiles}
                files={files}
                searchCommands={searchCommands}
                onEnter={handleSend}
                placeholder={
                  chatMode === "expert-team"
                    ? "@ experts to collaborate — model per expert preset"
                    : "@ agent or file, / for commands"
                }
              />

              <ComposerToolbar
                addMenu={
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                        title="Add context"
                      >
                        <PlusIcon className="size-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-48">
                      <DropdownMenuItem className="text-[length:var(--font-chat-meta)]">
                        <FileTextIcon className="size-3.5" />
                        <span>Select file</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-[length:var(--font-chat-meta)]">
                        <ImageIcon className="size-3.5" />
                        <span>Upload image</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-[length:var(--font-chat-meta)]" disabled>
                        <LinkIcon className="size-3.5" />
                        <span>Add link</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-[length:var(--font-chat-meta)]" disabled>
                        <Code2Icon className="size-3.5" />
                        <span>Add code snippet</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                }
                sendControls={
                  isStreaming ? (
                    <button
                      type="button"
                      onClick={cancelExecution}
                      className="flex size-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      <SquareIcon className="size-3 fill-current" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSend}
                      disabled={!canSend}
                      className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-30"
                    >
                      <ArrowUpIcon className="size-3.5" />
                    </button>
                  )
                }
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
