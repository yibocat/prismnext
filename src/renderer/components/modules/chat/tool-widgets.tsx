import { useState, useEffect } from "react";
import type { ContentBlock } from "@/stores/claude-chat-store";
import { useClaudeChatStore } from "@/stores/claude-chat-store";
import {
  Loader2Icon,
  CheckIcon,
  AlertCircleIcon,
  CircleIcon,
  ChevronDownIcon,
  FileEditIcon,
  FileIcon,
  TerminalIcon,
  ListTodoIcon,
  BrainIcon,
  MessageCircleQuestionIcon,
  WrenchIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Status Icon ───

function StatusIcon({ isLoading, isError }: { isLoading: boolean; isError: boolean }) {
  if (isLoading) return <Loader2Icon className="size-3.5 animate-spin text-muted-foreground" />;
  if (isError) return <AlertCircleIcon className="size-3.5 text-destructive" />;
  return <CheckIcon className="size-3.5 text-emerald-500" />;
}

// ─── Edit Widget ───

function EditWidget({
  toolUse,
  toolResult,
}: {
  toolUse: ContentBlock;
  toolResult?: ContentBlock;
}) {
  const [expanded, setExpanded] = useState(false);
  const filePath = toolUse.input?.file_path || toolUse.input?.path || "unknown";
  const fileName = filePath.split("/").pop() || filePath;
  const isError = toolResult?.is_error;
  const isLoading = !toolResult;

  return (
    <div className="my-2 rounded-lg border border-border bg-card text-[length:var(--font-code)] overflow-hidden">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <StatusIcon isLoading={isLoading} isError={!!isError} />
        <FileEditIcon className="size-3.5 text-blue-500" />
        <span className="truncate font-medium">{fileName}</span>
        <span className="text-muted-foreground/60 shrink-0">
          {isLoading ? "Editing..." : isError ? "Failed" : "Edited"}
        </span>
        <ChevronDownIcon
          className={cn("ml-auto size-3.5 text-muted-foreground transition-transform", expanded && "rotate-180")}
        />
      </button>
      {expanded && (
        <div className="border-t border-border bg-muted/30 px-3 py-2 font-mono text-[length:var(--font-code)] space-y-1">
          {toolUse.input?.old_string && (
            <div>
              <span className="text-red-500 select-none">- </span>
              <span className="text-red-400 line-through">
                {toolUse.input.old_string.slice(0, 300)}
                {toolUse.input.old_string.length > 300 ? "..." : ""}
              </span>
            </div>
          )}
          {toolUse.input?.new_string && (
            <div>
              <span className="text-emerald-500 select-none">+ </span>
              <span className="text-emerald-400">
                {toolUse.input.new_string.slice(0, 300)}
                {toolUse.input.new_string.length > 300 ? "..." : ""}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Write Widget ───

function WriteWidget({
  toolUse,
  toolResult,
}: {
  toolUse: ContentBlock;
  toolResult?: ContentBlock;
}) {
  const filePath = toolUse.input?.file_path || toolUse.input?.path || "unknown";
  const fileName = filePath.split("/").pop() || filePath;
  const isError = toolResult?.is_error;
  const isLoading = !toolResult;

  return (
    <div className="my-2 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-[length:var(--font-code)]">
      <StatusIcon isLoading={isLoading} isError={!!isError} />
      <FileIcon className="size-3.5 text-blue-500" />
      <span className="font-medium truncate">{fileName}</span>
      <span className="ml-auto text-muted-foreground/60 shrink-0">
        {isLoading ? "Writing..." : isError ? "Failed" : "Written"}
      </span>
    </div>
  );
}

// ─── Bash Widget ───

function BashWidget({
  toolUse,
  toolResult,
}: {
  toolUse: ContentBlock;
  toolResult?: ContentBlock;
}) {
  const [expanded, setExpanded] = useState(false);
  const command = toolUse.input?.command || "";
  const isError = toolResult?.is_error;
  const isLoading = !toolResult;

  return (
    <div className="my-2 rounded-lg border border-border bg-card text-[length:var(--font-code)] overflow-hidden">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <StatusIcon isLoading={isLoading} isError={!!isError} />
        <TerminalIcon className="size-3.5 text-amber-500" />
        <span className="truncate font-mono">{command.slice(0, 80)}</span>
        <ChevronDownIcon
          className={cn("ml-auto size-3.5 text-muted-foreground transition-transform", expanded && "rotate-180")}
        />
      </button>
      {expanded && toolResult?.content && (
        <div className="border-t border-border bg-zinc-950 px-3 py-2 font-mono text-[length:var(--font-code)] text-zinc-300 whitespace-pre-wrap">
          {typeof toolResult.content === "string"
            ? toolResult.content.slice(0, 500)
            : JSON.stringify(toolResult.content, null, 2).slice(0, 500)}
        </div>
      )}
    </div>
  );
}

// ─── TodoWrite Widget ───

function TodoWriteWidget({ toolUse }: { toolUse: ContentBlock }) {
  const todos: Array<{ content: string; status: string }> = toolUse.input?.todos || [];

  if (todos.length === 0) return null;

  return (
    <div className="my-2 rounded-lg border border-border bg-card text-[length:var(--font-code)] overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/60">
        <ListTodoIcon className="size-3.5 text-purple-500" />
        <span className="font-medium">Task Plan</span>
        <span className="text-muted-foreground/60">
          {todos.filter((t) => t.status === "completed").length}/{todos.length}
        </span>
      </div>
      <div className="py-1">
        {todos.map((todo) => (
          <div key={todo.content} className="flex items-center gap-2 px-3 py-1.5">
            {todo.status === "completed" ? (
              <CheckIcon className="size-3.5 text-emerald-500 shrink-0" />
            ) : todo.status === "in_progress" ? (
              <Loader2Icon className="size-3.5 animate-spin text-blue-500 shrink-0" />
            ) : (
              <CircleIcon className="size-3.5 text-muted-foreground shrink-0" />
            )}
            <span className={cn(todo.status === "completed" && "line-through text-muted-foreground")}>
              {todo.content}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Thinking Widget ───

export function ThinkingWidget({ thinking }: { thinking: string }) {
  const [expanded, setExpanded] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const isStreaming = useClaudeChatStore((s) => s.isStreaming);

  useEffect(() => {
    if (!isStreaming) return;
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [isStreaming]);

  const summary = thinking.length > 80 ? thinking.slice(0, 80).replace(/\n/g, " ") + "..." : thinking.replace(/\n/g, " ");

  return (
    <div className="my-1.5">
      <button
        type="button"
        className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors group"
        onClick={() => setExpanded(!expanded)}
      >
        <BrainIcon className="size-3.5" />
        <span className="text-[length:var(--font-code)]">
          {isStreaming ? "Thinking..." : `Thought for ${elapsed}s`}
        </span>
        {!expanded && summary && (
          <span className="text-[length:var(--font-code)] text-muted-foreground/60 truncate max-w-[200px]">
            {summary}
          </span>
        )}
        <ChevronDownIcon
          className={cn("size-3.5 transition-transform ml-auto", expanded && "rotate-180")}
        />
      </button>
      {expanded && (
        <div className="mt-1.5 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-[length:var(--font-code)] text-muted-foreground whitespace-pre-wrap leading-relaxed animate-in fade-in slide-in-from-top-1 duration-150">
          {thinking}
        </div>
      )}
    </div>
  );
}

// ─── AskUserQuestion Widget ───

function AskUserQuestionWidget({
  toolUse,
  toolResult,
}: {
  toolUse: ContentBlock;
  toolResult?: ContentBlock;
}) {
  const [answered, setAnswered] = useState(false);
  const isStreaming = useClaudeChatStore((s) => s.isStreaming);
  const isLoading = !toolResult;
  const isError = toolResult?.is_error;
  const needsUserAnswer = !answered && !isStreaming && toolResult && !isError;

  const question = toolUse.input?.question || "";
  const options: string[] = toolUse.input?.options || [];

  const handleSelectOption = (label: string) => {
    if (!needsUserAnswer) return;
    setAnswered(true);
    const tabId = useClaudeChatStore.getState().activeTabId;
    window.electronAPI.agentAnswer(tabId, label);
  };

  if (!question && !options.length) {
    return (
      <div className="my-2 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-[length:var(--font-code)]">
        <StatusIcon isLoading={isLoading} isError={!!isError} />
        <MessageCircleQuestionIcon className="size-3.5 text-blue-500" />
        <span className="font-medium">{isLoading ? "Asking question..." : "Asked question"}</span>
      </div>
    );
  }

  return (
    <div className={cn(
      "my-2 rounded-lg border px-4 py-3 text-[length:var(--font-code)] transition-colors",
      needsUserAnswer ? "border-blue-500/40 bg-blue-500/5" : "border-blue-500/20 bg-blue-500/[0.02]",
    )}>
      <div className="flex items-center gap-2 mb-2">
        <MessageCircleQuestionIcon className="size-3.5 text-blue-500" />
        <span className="font-medium text-blue-600 dark:text-blue-400">
          {needsUserAnswer ? "Choose an option:" : answered ? "Answer sent" : "Question answered"}
        </span>
      </div>
      {question && <p className="mb-2 text-foreground">{question}</p>}
      <div className="flex flex-col gap-1">
        {options.map((opt, i) => (
          <button
            key={i}
            type="button"
            disabled={!needsUserAnswer}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-left text-[length:var(--font-code)] transition-colors",
              needsUserAnswer && "hover:bg-blue-500/10 cursor-pointer",
              !needsUserAnswer && "cursor-default opacity-60",
            )}
            onClick={() => handleSelectOption(opt)}
          >
            <CircleIcon className="size-2.5 shrink-0 text-muted-foreground" />
            <span>{opt}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Generic Widget ───

function GenericWidget({
  toolUse,
  toolResult,
}: {
  toolUse: ContentBlock;
  toolResult?: ContentBlock;
}) {
  const isLoading = !toolResult;
  const isError = toolResult?.is_error;

  return (
    <div className="my-2 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-[length:var(--font-code)]">
      <StatusIcon isLoading={isLoading} isError={!!isError} />
      <WrenchIcon className="size-3.5 text-muted-foreground" />
      <span className="font-medium">{toolUse.name}</span>
    </div>
  );
}

// ─── Tool Widget Router ───

export function ToolWidget({
  toolUse,
  toolResult,
}: {
  toolUse: ContentBlock;
  toolResult?: ContentBlock;
}) {
  const name = toolUse.name?.toLowerCase() || "";

  if (name === "edit" || name === "multiedit") {
    return <EditWidget toolUse={toolUse} toolResult={toolResult} />;
  }
  if (name === "write") {
    return <WriteWidget toolUse={toolUse} toolResult={toolResult} />;
  }
  if (name === "bash") {
    return <BashWidget toolUse={toolUse} toolResult={toolResult} />;
  }
  if (name === "todowrite") {
    return <TodoWriteWidget toolUse={toolUse} />;
  }
  if (name === "askuserquestion") {
    return <AskUserQuestionWidget toolUse={toolUse} toolResult={toolResult} />;
  }
  return <GenericWidget toolUse={toolUse} toolResult={toolResult} />;
}
