import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { flushSync } from "react-dom";
import {
  ArrowUpIcon,
  SquareIcon,
  XIcon,
  FileTextIcon,
  FileCodeIcon,
  FileIcon,
  ImageIcon,
  PlusIcon,
  ZapIcon,
  Loader2Icon,
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
import { useDocumentStore, type ProjectFile } from "@/stores/document-store";
import { AgentSettingsBar } from "./agent-settings/agent-settings-bar";
import { PermissionModeSelect } from "./agent-settings/permission-mode-select";
import { PermissionAskPanel, usePermissionAskOpen } from "./permission-ask-panel";
import { useCommandStore } from "@/stores/command-store";
import { actionRegistry } from "@/actions/registry";
import "@/actions/builtin-actions";
import type { CommandDef } from "@commands/types";
// ─── Helpers ───

function offsetToLineCol(
  text: string,
  offset: number,
): { line: number; col: number } {
  const lines = text.slice(0, offset).split("\n");
  return { line: lines.length, col: lines[lines.length - 1].length + 1 };
}

function getFileIcon(file: ProjectFile) {
  if (file.type === "image")
    return <ImageIcon className="size-3.5 shrink-0 text-muted-foreground" />;
  if (file.type === "style")
    return <FileCodeIcon className="size-3.5 shrink-0 text-muted-foreground" />;
  if (file.type === "other")
    return <FileIcon className="size-3.5 shrink-0 text-muted-foreground" />;
  return <FileTextIcon className="size-3.5 shrink-0 text-muted-foreground" />;
}

// ─── Pinned Context ───

interface PinnedContext {
  label: string;
  filePath: string;
  selectedText: string;
}

// ─── Command Chip ───

interface CommandChip {
  id: string;
  commandName: string;
  action?: string;
  source: string;
}

/** Chip color: action commands get a warm tint, AI commands get a cool tint */
function chipColorClass(action: string | undefined): string {
  return action
    ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
    : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
}

// ─── Composer ───

export function ChatComposer() {
  const [chips, setChips] = useState<CommandChip[]>([]);
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const textRef = useRef(text);
  textRef.current = text;
  const chipsRef = useRef(chips);
  chipsRef.current = chips;

  // Store subscriptions
  const sendPrompt = useChatStore((s) => s.sendPrompt);
  const cancelExecution = useChatStore((s) => s.cancelExecution);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const activeSessionId = useChatStore((s) => s.sessionId);
  const archivedSessionIds = useLayoutStore((s) => s.archivedSessionIds);
  const isArchived = activeSessionId ? archivedSessionIds.includes(activeSessionId) : false;
  const activeTabId = useChatStore((s) => s.activeTabId);
  const permissionAskOpen = usePermissionAskOpen();

  // Command store
  const commands = useCommandStore((s) => s.commands);
  const searchCommands = useCommandStore((s) => s.searchCommands);
  const expandCommand = useCommandStore((s) => s.expandCommand);
  const loadCommands = useCommandStore((s) => s.loadCommands);

  // Document store (for @ mentions and selection)
  const files = useDocumentStore((s) => s.files);
  const activeFileId = useDocumentStore((s) => s.activeFileId);
  const selectionRange = useDocumentStore((s) => s.selectionRange);

  // Pinned contexts
  const [pinnedContexts, setPinnedContexts] = useState<PinnedContext[]>([]);
  const pinnedContextsRef = useRef(pinnedContexts);
  pinnedContextsRef.current = pinnedContexts;

  // @ mention state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionAtPosRef = useRef(-1); // cursor-tracked @ position for correct replacement
  const mentionRef = useRef<HTMLDivElement>(null);

  // ─── Tab switch: save/restore draft ───
  const prevTabIdRef = useRef(activeTabId);
  useEffect(() => {
    const prevTabId = prevTabIdRef.current;
    if (prevTabId !== activeTabId) {
      useChatStore.getState().saveDraft(prevTabId, {
        input: textRef.current,
        chips: chipsRef.current,
      });
    }
    prevTabIdRef.current = activeTabId;

    const tab = useChatStore.getState().tabs.find((t) => t.id === activeTabId);
    setText(tab?.draft?.input ?? "");
    setChips(tab?.draft?.chips ?? []);
    setPinnedContexts([]);
    setMentionQuery(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    return () => {
      // Save draft on unmount or before switching away
      useChatStore.getState().saveDraft(activeTabId, {
        input: textRef.current,
        chips: chipsRef.current,
      });
    };
  }, [activeTabId]);

  // ─── Selection context auto-pin ───
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
    // Remove selection context when no selection
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
      // Replace previous selection-based context (keep file-level @mentions)
      const filtered = prev.filter((c) => !c.label.includes(":"));
      return [
        ...filtered,
        { label: currentContextLabel, filePath: file.relativePath, selectedText },
      ];
    });
  }, [selectionRange, currentContextLabel, activeFileId, files]);

  // ─── @ mention matching ───
  const mentionFiles = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return files
      .filter((f) => f.relativePath.toLowerCase().includes(q) || f.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [mentionQuery, files]);

  useEffect(() => {
    setMentionIndex(0);
  }, [mentionFiles]);

  // Scroll mention into view
  useEffect(() => {
    if (mentionRef.current) {
      const active = mentionRef.current.querySelector("[data-active=true]");
      active?.scrollIntoView({ block: "nearest" });
    }
  }, [mentionIndex]);

  // ─── Load commands on mount ───
  useEffect(() => {
    const projectRoot = useDocumentStore.getState().projectRoot;
    if (projectRoot) loadCommands();
  }, [loadCommands]);

  // ─── Command selection → insert chip ───
  const handleCommandSelect = useCallback(
    (cmd: CommandDef) => {
      setSlashQuery(null);

      // Remove the /partial text from the textarea (e.g. "/com" → "")
      setText((prev) => {
        const match = prev.match(/^\/\w*/);
        if (match) {
          return prev.slice(match[0].length);
        }
        return prev;
      });

      // Add the command as a chip
      const chip: CommandChip = {
        id: `chip-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        commandName: cmd.name,
        action: cmd.action,
        source: cmd.source,
      };
      setChips((prev) => [...prev, chip]);

      // Focus back on textarea
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 0);
    },
    [],
  );

  // ─── Send ───
  const handleSend = useCallback(async () => {
    const trimmedText = text.trim();
    if (!trimmedText && chips.length === 0) return;
    if (isStreaming) return;

    // Separate chips by type
    const actionChips = chips.filter((c) => c.action);
    const aiChips = chips.filter((c) => !c.action);

    // Build AI prompt from non-action chips (background template expansion)
    const promptParts: string[] = [];
    for (const chip of aiChips) {
      try {
        const projectRoot = useDocumentStore.getState().projectRoot;
        if (!projectRoot) continue;
        const expanded = await expandCommand(chip.commandName, `/${chip.commandName}`);
        promptParts.push(expanded);
      } catch (err) {
        console.error("[chat-composer] Failed to expand command:", err);
        promptParts.push(`/${chip.commandName}`);
      }
    }

    // Prepend pinned contexts
    if (pinnedContexts.length > 0) {
      const ctx = pinnedContexts
        .map((c) => `\`\`\`${c.filePath}\n${c.selectedText}\n\`\`\``)
        .join("\n\n");
      promptParts.unshift(ctx);
    }

    if (trimmedText) {
      promptParts.push(trimmedText);
    }
    const aiPrompt = promptParts.join("\n");

    // Build content blocks for ALL chips + text (shown in sent message)
    const contentBlocks: import("@/stores/chat-store").ContentBlock[] = [
      ...chips.map((c) => ({
        type: "command" as const,
        name: c.commandName,
        action: c.action,
      })),
      ...(trimmedText ? [{ type: "text" as const, text: trimmedText }] : []),
    ];

    const store = useChatStore.getState();
    const tabId = store.activeTabId;

    // STEP 1: Insert user message FIRST — chips + text visible immediately
    store._appendMessage(tabId, {
      type: "user",
      message: { content: contentBlocks },
    });

    // STEP 2: Execute action chips — status messages appear BELOW user message
    for (const chip of actionChips) {
      const cmd = commands.find(
        (c) => c.name === chip.commandName && c.action === chip.action,
      );
      if (!cmd?.action) continue;

      // Insert "running" — force React to render it before action completes
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

        // Small delay so user actually sees "running" → "success" transition
        await new Promise((r) => setTimeout(r, 300));

        // Replace running → success
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
        // Replace running with error
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

    // STEP 3: Send AI prompt — skip user message (already inserted in step 1)
    if (aiPrompt) {
      const hadSetup = actionChips.some((c) => c.commandName === "setup");
      let promptToSend = aiPrompt;
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
          `User request: ${aiPrompt}`,
        ].join("\n");
      }
      sendPrompt(promptToSend, undefined, true);
    }

    // Clear input
    setChips([]);
    setText("");
    setPinnedContexts([]);
    setMentionQuery(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [text, chips, isStreaming, sendPrompt, pinnedContexts, commands, expandCommand]);

  const [slashQuery, setSlashQuery] = useState<string | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const slashRef = useRef<HTMLDivElement>(null);
  const slashCommands = useMemo(() => {
    if (slashQuery === null) return [];
    return searchCommands(slashQuery);
  }, [slashQuery, searchCommands]);

  // Reset slash index when results change
  useEffect(() => { setSlashIndex(0); }, [slashCommands]);

  // Scroll slash selection into view
  useEffect(() => {
    if (slashRef.current) {
      const active = slashRef.current.querySelector("[data-active=true]");
      active?.scrollIntoView({ block: "nearest" });
    }
  }, [slashIndex]);

  // ─── Keyboard ───
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // / slash command navigation
      if (slashQuery !== null && slashCommands.length > 0) {
        if (e.key === "ArrowDown") { e.preventDefault(); setSlashIndex((i) => Math.min(i + 1, slashCommands.length - 1)); return; }
        if (e.key === "ArrowUp") { e.preventDefault(); setSlashIndex((i) => Math.max(i - 1, 0)); return; }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          handleCommandSelect(slashCommands[slashIndex]);
          return;
        }
        if (e.key === "Escape") { e.preventDefault(); setSlashQuery(null); return; }
      }

      // @ mention navigation
      if (mentionQuery !== null && mentionFiles.length > 0) {
        if (e.key === "ArrowDown") { e.preventDefault(); setMentionIndex((i) => Math.min(i + 1, mentionFiles.length - 1)); return; }
        if (e.key === "ArrowUp") { e.preventDefault(); setMentionIndex((i) => Math.max(i - 1, 0)); return; }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          const file = mentionFiles[mentionIndex];
          if (file) selectMention(file);
          return;
        }
        if (e.key === "Escape") { e.preventDefault(); setMentionQuery(null); return; }
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
      if (e.key === "Backspace" && text === "" && chips.length > 0) {
        e.preventDefault();
        setChips((prev) => prev.slice(0, -1));
        return;
      }
      if (e.key === "Backspace" && text === "" && pinnedContexts.length > 0) {
        e.preventDefault();
        setPinnedContexts((prev) => prev.slice(0, -1));
        return;
      }
    },
    [handleSend, pinnedContexts, text, chips, mentionQuery, mentionFiles, mentionIndex, slashQuery, slashCommands, slashIndex, handleCommandSelect],
  );


  // ─── Input handler with @ and / detection ───
  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setText(value);

      // Detect / slash command (prefix match at start of input)
      // Trigger on "/" alone (show all) or "/partial" (filter)
      if (value.startsWith("/")) {
        const afterSlash = value.slice(1);
        // Only enter slash mode if the user hasn't typed a space yet
        // (space means they're typing a message, not a command)
        const queryMatch = afterSlash.match(/^(\w*)/);
        const query = queryMatch ? queryMatch[1] : "";
        setSlashQuery(query);
        setMentionQuery(null);
      } else {
        setSlashQuery(null);
      }

      // Detect @ mention (only when not in slash mode)
      if (!value.startsWith("/")) {
        const cursorPos = e.target.selectionStart;
        const textBefore = value.slice(0, cursorPos);
        const atMatch = textBefore.match(/(?:^|[\s])@([^\s]*)$/);
        if (atMatch) {
          setMentionQuery(atMatch[1]);
          // Store the exact @ position for correct replacement in selectMention
          mentionAtPosRef.current = cursorPos - atMatch[0].length;
        } else {
          setMentionQuery(null);
          mentionAtPosRef.current = -1;
        }
      }

      // Auto-resize
      const el = e.target;
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    },
    [],
  );

  const selectMention = useCallback(
    (file: ProjectFile) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const cursorPos = textarea.selectionStart;
      const textBefore = text.slice(0, cursorPos);
      // Use cursor-tracked @ position from handleInput — correct even with
      // multiple @ mentions in the same input (e.g. "see @file1 and @file2").
      const atIndex = mentionAtPosRef.current;
      if (atIndex === -1) return;
      const newInput = text.slice(0, atIndex) + text.slice(cursorPos);
      setText(newInput);
      setMentionQuery(null);

      const content = useDocumentStore.getState().getContent(file.id);
      setPinnedContexts((prev) => [
        ...prev,
        {
          label: `@${file.relativePath}`,
          filePath: file.relativePath,
          selectedText: content || `[${file.type} file: ${file.relativePath}]`,
        },
      ]);

      setTimeout(() => textarea.focus(), 0);
    },
    [text],
  );

  // ─── Render ───
  return (
    <div className="relative pt-1 pb-1 px-3 max-w-3xl mx-auto w-full">
      {/* / slash command dropdown */}
      {slashQuery !== null && (
        <div
          ref={slashRef}
          className="absolute right-3 bottom-full left-3 z-20 mb-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-background shadow-lg"
        >
          {slashCommands.length > 0 ? (
            slashCommands.map((cmd, i) => (
              <button
                key={cmd.name}
                data-active={i === slashIndex}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors",
                  i === slashIndex ? "bg-accent text-accent-foreground" : "hover:bg-muted",
                )}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleCommandSelect(cmd);
                }}
                onMouseEnter={() => setSlashIndex(i)}
              >
                <span className="font-mono font-medium text-[length:var(--font-chat-meta)] text-primary shrink-0">/{cmd.name}</span>
                <span className="text-muted-foreground text-[length:var(--font-chat-meta)] truncate">{cmd.description}</span>
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-muted-foreground text-[length:var(--font-chat-meta)] text-center">
              No commands found
            </div>
          )}
        </div>
      )}

      {/* @ mention dropdown */}
      {slashQuery === null && mentionQuery !== null && mentionFiles.length > 0 && (
        <div
          ref={mentionRef}
          className="absolute right-3 bottom-full left-3 z-20 mb-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-background shadow-lg"
        >
          {mentionFiles.map((file, i) => {
            const parts = file.relativePath.split("/");
            const fileName = parts.pop()!;
            const dirPath = parts.length > 0 ? `${parts.join("/")}/` : "";
            return (
              <button
                key={file.id}
                data-active={i === mentionIndex}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors",
                  i === mentionIndex ? "bg-accent text-accent-foreground" : "hover:bg-muted",
                )}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectMention(file);
                }}
                onMouseEnter={() => setMentionIndex(i)}
              >
                {getFileIcon(file)}
                <span className="truncate font-mono text-[length:var(--font-composer)]">{fileName}</span>
                {dirPath && (
                  <span className="ml-auto shrink-0 font-mono text-muted-foreground text-[length:var(--font-chat-meta)]">{dirPath}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex w-full flex-col">
        <PermissionAskPanel />

        <div
          className={cn(
            "flex w-full flex-col overflow-hidden border border-border bg-card",
            "shadow-[0_0_2px_rgba(0,0,0,0.03)] transition-colors focus-within:border-ring",
            permissionAskOpen ? "rounded-b-lg rounded-t-none" : "rounded-lg",
          )}
        >
        {/* Pinned context chips */}
        {pinnedContexts.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 px-4 pt-3 pb-0">
            {pinnedContexts.map((ctx, i) => (
              <span
                key={`${ctx.label}-${i}`}
                className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 font-mono text-muted-foreground text-[length:var(--font-chat-meta)]"
              >
                {ctx.label}
                <button
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

        {/* Command chips */}
        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 px-4 pt-2 pb-0">
            {chips.map((chip) => (
              <span
                key={chip.id}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono font-medium text-[length:var(--font-chat-meta)]",
                  chipColorClass(chip.action),
                )}
              >
                /{chip.commandName}
                <button
                  aria-label={`Remove /${chip.commandName} command`}
                  onClick={() =>
                    setChips((prev) => prev.filter((c) => c.id !== chip.id))
                  }
                  className="ml-0.5 rounded-sm p-0.5 opacity-60 transition-opacity hover:opacity-100"
                >
                  <XIcon className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {isArchived ? (
          <div className="px-4 py-3 text-[length:var(--font-chat-meta)] text-muted-foreground text-center">
            This session is archived — read only. Restore it to continue the conversation.
          </div>
        ) : (
          <>
            <textarea
              ref={textareaRef}
              value={text}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder="anything, @ to mention, / for commands"
              className="max-h-40 min-h-12 w-full resize-none bg-transparent px-4 py-2 text-[length:var(--font-composer)] outline-none placeholder:text-muted-foreground"
              rows={2}
            />

            <div className="flex items-center justify-between px-2 pb-1.5">
              <div className="flex items-center gap-1">
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

                <AgentSettingsBar />
              </div>

              <div className="flex items-center gap-1">
                <PermissionModeSelect />

                {isStreaming ? (
                  <button
                    onClick={cancelExecution}
                    className="flex size-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    <SquareIcon className="size-3 fill-current" />
                  </button>
                ) : (
                  <button
                    onClick={handleSend}
                    disabled={!text.trim() && chips.length === 0}
                    className="flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-30 shrink-0"
                  >
                    <ArrowUpIcon className="size-3.5" />
                  </button>
                )}
              </div>
            </div>
          </>
        )}
        </div>
      </div>

    </div>
  );
}
