import { useState, useRef, useCallback, useLayoutEffect, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  ArrowUpIcon,
  SquareIcon,
  ZapIcon,
  SparklesIcon,
  RabbitIcon,
  CheckIcon,
  ChevronDownIcon,
  XIcon,
  FileTextIcon,
  FileCodeIcon,
  FileIcon,
  ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Z_TOP } from "@/styles/constants";
import { useClaudeChatStore } from "@/stores/claude-chat-store";
import { useDocumentStore, type ProjectFile } from "@/stores/document-store";
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
  const sendPrompt = useClaudeChatStore((s) => s.sendPrompt);
  const cancelExecution = useClaudeChatStore((s) => s.cancelExecution);
  const isStreaming = useClaudeChatStore((s) => s.isStreaming);
  const selectedModel = useClaudeChatStore((s) => s.selectedModel);
  const setSelectedModel = useClaudeChatStore((s) => s.setSelectedModel);
  const effortLevel = useClaudeChatStore((s) => s.effortLevel);
  const setEffortLevel = useClaudeChatStore((s) => s.setEffortLevel);
  const activeTabId = useClaudeChatStore((s) => s.activeTabId);

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

  // Model picker state
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const modelPickerRef = useRef<HTMLDivElement>(null);
  const modelButtonRef = useRef<HTMLButtonElement>(null);
  const [pickerPos, setPickerPos] = useState<{ left: number; bottom: number }>({ left: 0, bottom: 0 });

  // ─── Tab switch: save/restore draft ───
  const prevTabIdRef = useRef(activeTabId);
  useEffect(() => {
    const prevTabId = prevTabIdRef.current;
    if (prevTabId !== activeTabId) {
      useClaudeChatStore.getState().saveDraft(prevTabId, { input: inputRef.current });
    }
    prevTabIdRef.current = activeTabId;

    const tab = useClaudeChatStore.getState().tabs.find((t) => t.id === activeTabId);
    setInput(tab?.draft?.input ?? "");
    setPinnedContexts([]);
    setMentionQuery(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [activeTabId]);

  // ─── Model picker position ───
  useLayoutEffect(() => {
    if (!modelPickerOpen || !modelButtonRef.current) return;
    const rect = modelButtonRef.current.getBoundingClientRect();
    setPickerPos({ left: rect.left, bottom: window.innerHeight - rect.top + 4 });
  }, [modelPickerOpen]);

  useEffect(() => {
    if (!modelPickerOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        modelPickerRef.current && !modelPickerRef.current.contains(target) &&
        modelButtonRef.current && !modelButtonRef.current.contains(target)
      ) {
        setModelPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [modelPickerOpen]);

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
      useClaudeChatStore.getState().newSession();
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

      // Detect / slash command (only at start of input)
      if (value.match(/^\/(\w*)$/)) {
        const match = value.match(/^\/(\w*)$/)!;
        setSlashQuery(match[1] || "");
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
  const modelLabel =
    selectedModel === "sonnet" ? "Sonnet"
    : selectedModel === "opus" ? "Opus"
    : selectedModel === "haiku" ? "Haiku"
    : "Default";

  return (
    <div className="relative shrink-0 p-3 max-w-3xl mx-auto w-full">
      {/* Model picker popup */}
      {modelPickerOpen &&
        createPortal(
          <div
            ref={modelPickerRef}
            className="fixed w-64 rounded-lg border border-border bg-background shadow-lg"
            style={{ left: pickerPos.left, bottom: pickerPos.bottom, zIndex: Z_TOP }}
          >
            <div className="p-1">
              <div className="px-2 py-1 font-medium text-muted-foreground text-[length:var(--font-chat-meta)]">Model</div>
              {[
                { id: null as null, name: "Default", desc: "Use system Claude Code setting", icon: <SparklesIcon className="size-3.5" /> },
                { id: "sonnet" as const, name: "Sonnet", desc: "Fast, efficient for most tasks", icon: <ZapIcon className="size-3.5" /> },
                { id: "opus" as const, name: "Opus", desc: "Most capable, complex reasoning", icon: <SparklesIcon className="size-3.5" /> },
                { id: "haiku" as const, name: "Haiku", desc: "Fastest, simple tasks", icon: <RabbitIcon className="size-3.5" /> },
              ].map((m) => (
                <button
                  key={m.id ?? "default"}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-[length:var(--font-composer)] transition-colors",
                    selectedModel === m.id ? "bg-accent text-accent-foreground" : "hover:bg-muted",
                  )}
                  onClick={() => setSelectedModel(m.id)}
                >
                  {m.icon}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-[length:var(--font-chat-meta)]">{m.name}</div>
                    <div className="truncate text-muted-foreground text-[length:var(--font-chat-meta)]">{m.desc}</div>
                  </div>
                  {selectedModel === m.id && <CheckIcon className="size-3 shrink-0" />}
                </button>
              ))}
            </div>
            <div className="border-border border-t" />
            <div className="p-2">
              <div className="mb-1.5 flex items-center justify-between px-1">
                <span className="font-medium text-muted-foreground text-[length:var(--font-chat-meta)]">Effort</span>
                <span className="text-muted-foreground text-[length:var(--font-chat-meta)]">
                  {effortLevel === "low" ? "Low" : effortLevel === "medium" ? "Medium" : "High"}
                </span>
              </div>
              <div className="flex gap-1">
                {(["low", "medium", "high"] as const).map((level) => (
                  <button
                    key={level}
                    className={cn(
                      "flex-1 rounded-md py-1 text-center font-medium text-[length:var(--font-chat-meta)] transition-colors",
                      effortLevel === level ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80",
                    )}
                    onClick={() => setEffortLevel(level)}
                  >
                    {level === "low" ? "L" : level === "medium" ? "M" : "H"}
                  </button>
                ))}
              </div>
            </div>
          </div>,
          document.body,
        )}

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

      <div className="flex w-full flex-col rounded-2xl border border-input bg-muted/30 transition-colors focus-within:border-ring focus-within:bg-background">
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

        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Ask me anything... (@ to mention files, / for commands)"
          className="max-h-40 min-h-10 w-full resize-none bg-transparent px-4 py-2 text-[length:var(--font-composer)] outline-none placeholder:text-muted-foreground"
          rows={1}
        />

        <div className="flex items-center justify-between px-2 pb-2">
          <button
            ref={modelButtonRef}
            type="button"
            onClick={() => setModelPickerOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-muted-foreground text-[length:var(--font-chat-meta)] transition-colors hover:bg-muted hover:text-foreground"
          >
            <span>{modelLabel}</span>
            <span className="text-muted-foreground/60">
              {effortLevel === "low" ? "L" : effortLevel === "medium" ? "M" : "H"}
            </span>
            <ChevronDownIcon className="size-3" />
          </button>

          {isStreaming ? (
            <button
              onClick={cancelExecution}
              className="flex size-8 items-center justify-center rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <SquareIcon className="size-3 fill-current" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="flex size-8 items-center justify-center rounded-full bg-foreground text-background hover:bg-foreground/90 disabled:opacity-30"
            >
              <ArrowUpIcon className="size-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
