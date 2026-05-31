import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  ArrowUpIcon,
  SquareIcon,
  XIcon,
  FileTextIcon,
  FileCodeIcon,
  FileIcon,
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
import { useDocumentStore, type ProjectFile } from "@/stores/document-store";
import { AgentSettingsBar } from "./agent-settings/agent-settings-bar";
import { compileCurrentDocument } from "@/stores/compile-store";

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

// ─── Composer ───

export function ChatComposer() {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputRef = useRef(input);
  inputRef.current = input;

  // Store subscriptions
  const sendPrompt = useChatStore((s) => s.sendPrompt);
  const cancelExecution = useChatStore((s) => s.cancelExecution);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const activeSessionId = useChatStore((s) => s.sessionId);
  const archivedSessionIds = useLayoutStore((s) => s.archivedSessionIds);
  const isArchived = activeSessionId ? archivedSessionIds.includes(activeSessionId) : false;
  const activeTabId = useChatStore((s) => s.activeTabId);

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
  const mentionRef = useRef<HTMLDivElement>(null);

  // ─── Tab switch: save/restore draft ───
  const prevTabIdRef = useRef(activeTabId);
  useEffect(() => {
    const prevTabId = prevTabIdRef.current;
    if (prevTabId !== activeTabId) {
      useChatStore.getState().saveDraft(prevTabId, { input: inputRef.current });
    }
    prevTabIdRef.current = activeTabId;

    const tab = useChatStore.getState().tabs.find((t) => t.id === activeTabId);
    setInput(tab?.draft?.input ?? "");
    setPinnedContexts([]);
    setMentionQuery(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    return () => {
      // Save draft on unmount or before switching away
      useChatStore.getState().saveDraft(activeTabId, { input: inputRef.current });
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

  // ─── Send ───
  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;

    let finalPrompt = trimmed;
    if (pinnedContexts.length > 0) {
      const ctx = pinnedContexts.map((c) => `\`\`\`${c.filePath}\n${c.selectedText}\n\`\`\``).join("\n\n");
      finalPrompt = `${ctx}\n\n${trimmed}`;
    }

    sendPrompt(finalPrompt);
    setInput("");
    setPinnedContexts([]);
    setMentionQuery(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [input, isStreaming, sendPrompt, pinnedContexts]);

  // ─── Keyboard ───
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
        // Execute first matching slash command
        if (input.startsWith("/") && slashCommands.length > 0) {
          slashCommands[0].action();
          return;
        }
        handleSend();
      }
      if (e.key === "Backspace" && pinnedContexts.length > 0 && input === "") {
        e.preventDefault();
        setPinnedContexts((prev) => prev.slice(0, -1));
      }
    },
    [handleSend, pinnedContexts, input, mentionQuery, mentionFiles, mentionIndex],
  );

  // ─── Slash commands ───
  const builtinCommands: Array<{ name: string; desc: string; action: () => void }> = [
    { name: "clear", desc: "Clear current conversation", action: () => {
      useChatStore.getState().newSession();
      setInput("");
    }},
    { name: "compile", desc: "Compile the current LaTeX document", action: () => {
      compileCurrentDocument();
      setInput("");
    }},
  ];

  const [slashQuery, setSlashQuery] = useState<string | null>(null);
  const slashCommands = useMemo(() => {
    if (slashQuery === null) return [];
    const q = slashQuery.toLowerCase();
    return builtinCommands.filter((c) => c.name.toLowerCase().includes(q));
  }, [slashQuery]);

  // ─── Input handler with @ and / detection ───
  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setInput(value);

      // Detect / slash command (prefix match at start of input)
      const slashMatch = value.match(/^\/(\w+)/);
      if (slashMatch) {
        setSlashQuery(slashMatch[1]);
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
        } else {
          setMentionQuery(null);
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
      const textBefore = input.slice(0, cursorPos);
      const atIndex = textBefore.lastIndexOf("@");
      if (atIndex === -1) return;
      const newInput = input.slice(0, atIndex) + input.slice(cursorPos);
      setInput(newInput);
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
    [input],
  );

  // ─── Render ───
  return (
    <div className="relative pt-2 pb-1 px-3 max-w-3xl mx-auto w-full">
      {/* / slash command dropdown */}
      {slashQuery !== null && (
        <div className="absolute right-3 bottom-full left-3 z-20 mb-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-background shadow-lg">
          {slashCommands.length > 0 ? (
            slashCommands.map((cmd) => (
              <button
                key={cmd.name}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[length:var(--font-composer)] transition-colors hover:bg-muted"
                onMouseDown={(e) => {
                  e.preventDefault();
                  cmd.action();
                }}
              >
                <span className="font-mono font-medium text-[length:var(--font-chat-meta)] text-primary">/{cmd.name}</span>
                <span className="text-muted-foreground text-[length:var(--font-chat-meta)]">{cmd.desc}</span>
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

      <div className="flex w-full flex-col rounded-2xl border border-input bg-card transition-colors focus-within:border-ring">
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

        {isArchived ? (
          <div className="px-4 py-3 text-[length:var(--font-chat-meta)] text-muted-foreground text-center">
            This session is archived — read only. Restore it to continue the conversation.
          </div>
        ) : (
          <>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder="Ask me anything... (@ to mention files, / for commands)"
              className="max-h-40 min-h-12 w-full resize-none bg-transparent px-4 py-2 text-[length:var(--font-composer)] outline-none placeholder:text-muted-foreground"
              rows={2}
            />

            <div className="flex items-center justify-between px-2 pb-1.5">
              <div className="flex items-center gap-1">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
                  disabled={!input.trim()}
                  className="flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-30 shrink-0"
                >
                  <ArrowUpIcon className="size-3.5" />
                </button>
              )}
            </div>
          </>
        )}
      </div>

    </div>
  );
}
