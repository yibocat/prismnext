import { useState, useEffect, useMemo, memo } from "react";
import type { ContentBlock } from "@/stores/chat-store";
import { useChatStore } from "@/stores/chat-store";
import { useChangesStore } from "@/stores/changes-store";
import { diffLines } from "diff";
import {
  Loader2Icon,
  CheckIcon,
  XIcon,
  AlertCircleIcon,
  CircleIcon,
  ChevronDownIcon,
  FileEditIcon,
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

// ─── Edit / Write Widget ───

function EditWidget({
  toolUse,
  toolResult,
}: {
  toolUse: ContentBlock;
  toolResult?: ContentBlock;
}) {
  const [expanded, setExpanded] = useState(true);
  const [resolved, setResolved] = useState<"accepted" | "rejected" | null>(null);
  // Snapshot diff data before accept/reject so it remains after change is removed from store
  const [snapshot, setSnapshot] = useState<{ oldContent: string; newContent: string; filePath: string } | null>(
    () => {
      const c = useChangesStore.getState().changes.find((ch) => ch.id === toolUse.id);
      return c ? { oldContent: c.oldContent, newContent: c.newContent, filePath: c.filePath } : null;
    },
  );
  const change = useChangesStore((s) => s.changes.find((c) => c.id === toolUse.id));
  const acceptChange = useChangesStore((s) => s.acceptChange);
  const rejectChange = useChangesStore((s) => s.rejectChange);
  const isWrite = toolUse.name?.toLowerCase().startsWith("write");

  // When change appears, capture snapshot for post-resolution display
  useEffect(() => {
    if (change && !snapshot) {
      setSnapshot({ oldContent: change.oldContent, newContent: change.newContent, filePath: change.filePath });
    }
  }, [change, snapshot]);

  // Active data: change from store (pre-resolution) or snapshot (post-resolution) or tool input
  const activeFilePath = change?.filePath || snapshot?.filePath || toolUse.input?.file_path || toolUse.input?.path || "unknown";
  const activeOldText = change?.oldContent ?? snapshot?.oldContent ?? toolUse.input?.old_string ?? "";
  const activeNewText = change?.newContent ?? snapshot?.newContent ?? toolUse.input?.new_string ?? toolUse.input?.content ?? "";
  const fileName = activeFilePath.split("/").pop() || activeFilePath;
  const isError = toolResult?.is_error;
  const isLoading = !toolResult;
  const hasData = !!(change || snapshot?.oldContent || toolUse.input?.old_string || toolUse.input?.new_string);

  const handleAccept = async () => {
    if (!change) return;
    setSnapshot({ oldContent: change.oldContent, newContent: change.newContent, filePath: change.filePath });
    await acceptChange(change.id);
    setResolved("accepted");
  };

  const handleReject = async () => {
    if (!change) return;
    setSnapshot({ oldContent: change.oldContent, newContent: change.newContent, filePath: change.filePath });
    await rejectChange(change.id);
    setResolved("rejected");
  };

  return (
    <div className="my-2 rounded-lg border border-border bg-card overflow-hidden">
      {/* Header */}
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors text-[length:var(--font-code)]"
        onClick={() => setExpanded(!expanded)}
      >
        {resolved ? (
          <CheckIcon className="size-3.5 text-emerald-500" />
        ) : (
          <StatusIcon isLoading={isLoading} isError={!!isError} />
        )}
        <FileEditIcon className="size-3.5 text-blue-500" />
        <span className="truncate font-medium">{fileName}</span>
        {resolved ? (
          <span className="text-muted-foreground/60 shrink-0">{resolved === "accepted" ? "Accepted" : "Rejected"}</span>
        ) : (
          <span className="text-muted-foreground/60 shrink-0">
            {isLoading ? (isWrite ? "Writing..." : "Editing...") : isError ? "Failed" : (isWrite ? "Written" : "Edited")}
          </span>
        )}
        {!resolved && change && (
          <span className={cn(
            "text-[length:var(--font-badge)] font-mono shrink-0",
            activeNewText.length - activeOldText.length >= 0 ? "text-emerald-500" : "text-red-500",
          )}>
            {activeNewText.length - activeOldText.length >= 0 ? "+" : ""}{activeNewText.length - activeOldText.length}
          </span>
        )}
        <ChevronDownIcon
          className={cn("ml-auto size-3.5 text-muted-foreground transition-transform", expanded && "rotate-180")}
        />
      </button>

      {/* Diff content */}
      {expanded && hasData && (
        <div className="border-t border-border">
          <pre className="px-3 py-2 font-mono text-[length:var(--font-code)] whitespace-pre-wrap break-all overflow-x-auto max-h-80 overflow-y-auto">
            {(change || snapshot) ? (
              <DiffLines oldStr={activeOldText} newStr={activeNewText} />
            ) : (
              <>
                {toolUse.input?.old_string && (
                  <div className="text-red-400 line-through mb-1">{toolUse.input.old_string.slice(0, 500)}</div>
                )}
                {toolUse.input?.new_string && (
                  <div className="text-emerald-400">{toolUse.input.new_string.slice(0, 500)}</div>
                )}
                {toolUse.input?.content && (
                  <div className="text-muted-foreground">{toolUse.input.content.slice(0, 500)}</div>
                )}
              </>
            )}
          </pre>

          {!resolved && change && !isLoading && !isError && (
            <div className="flex items-center gap-2 px-3 py-2 border-t border-border bg-muted/30">
              <span className="text-[length:var(--font-chat-meta)] text-muted-foreground">
                {isWrite ? "Write" : "Edit"}
              </span>
              <div className="flex-1" />
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950 transition-colors"
                onClick={handleAccept}
              >
                <CheckIcon className="size-3" />
                Accept
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                onClick={handleReject}
              >
                <XIcon className="size-3" />
                Reject
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Diff renderer: uses proper Myers diff algorithm via the `diff` package.
// Handles insertions, deletions, and modifications correctly regardless of
// where the change occurs in the file.
function DiffLines({ oldStr, newStr }: { oldStr: string; newStr: string }) {
  const changes = useMemo(() => diffLines(oldStr, newStr), [oldStr, newStr]);

  let skipped = 0;
  const rows: { type: "same" | "del" | "add" | "skip"; text: string }[] = [];

  for (const change of changes) {
    const lines = change.value.split("\n");
    // Remove trailing empty line from split
    if (lines[lines.length - 1] === "") lines.pop();

    if (change.added) {
      skipped = 0;
      for (const line of lines) {
        rows.push({ type: "add", text: line });
      }
    } else if (change.removed) {
      skipped = 0;
      for (const line of lines) {
        rows.push({ type: "del", text: line });
      }
    } else {
      for (const line of lines) {
        skipped++;
        if (skipped === 3) {
          rows.push({ type: "skip", text: "" });
        }
      }
    }
  }

  // Limit total displayed lines
  const displayRows = rows.slice(0, 200);

  return (
    <>
      {displayRows.map((row, i) => {
        if (row.type === "skip") return (
          <div key={i} className="text-muted-foreground/40 select-none">···</div>
        );
        if (row.type === "del") return (
          <div key={i} className="text-red-400 bg-red-500/5">- {row.text}</div>
        );
        if (row.type === "add") return (
          <div key={i} className="text-emerald-400 bg-emerald-500/5">+ {row.text}</div>
        );
        return null;
      })}
      {rows.length > 200 && (
        <div className="text-muted-foreground/50 text-xs mt-1">··· {rows.length - 200} more lines</div>
      )}
    </>
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
        <div className="border-t border-border bg-muted/50 px-3 py-2 font-mono text-[length:var(--font-code)] whitespace-pre-wrap">
          {(() => {
            const raw = typeof toolResult.content === "string"
              ? toolResult.content
              : JSON.stringify(toolResult.content, null, 2);
            const truncated = raw.length > 500 ? raw.slice(0, 500) + `\n\n··· ${raw.length - 500} more chars` : raw;
            return truncated;
          })()}
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
        {todos.map((todo, i) => (
          <div key={i} className="flex items-center gap-2 px-3 py-1.5">
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

export function ThinkingWidget({ thinking, duration }: { thinking: string; duration?: number }) {
  const [expanded, setExpanded] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const isStreaming = useChatStore((s) => s.isStreaming);

  useEffect(() => {
    if (!isStreaming) return;
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [isStreaming]);

  // Duration: stored > live elapsed > estimated from text length
  const estimatedDuration = Math.max(1, Math.round(thinking.length / 50));
  const displayDuration = !isStreaming
    ? (duration != null ? duration : estimatedDuration)
    : elapsed;
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
          {isStreaming ? "Thinking..." : `Thought for ${displayDuration}s`}
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
  const isStreaming = useChatStore((s) => s.isStreaming);
  const isLoading = !toolResult;
  const isError = toolResult?.is_error;

  // Reset answered state when a new question appears (different toolUse id)
  useEffect(() => { setAnswered(false); }, [toolUse.id]);

  const needsUserAnswer = !answered && !isStreaming && toolResult && !isError;

  const question = toolUse.input?.question || "";
  const options: string[] = toolUse.input?.options || [];

  const handleSelectOption = (label: string) => {
    if (!needsUserAnswer) return;
    setAnswered(true);
    const tabId = useChatStore.getState().activeTabId;
    window.electronAPI.cliAnswer(tabId, label).catch(() => {
      setAnswered(false); // revert on failure so user can retry
    });
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
  const [expanded, setExpanded] = useState(false);
  const isLoading = !toolResult;
  const isError = toolResult?.is_error;

  const hasContent = toolResult?.content != null;

  return (
    <div className="my-2 rounded-lg border border-border bg-card text-[length:var(--font-code)] overflow-hidden">
      <button
        type="button"
        className={cn(
          "flex w-full items-center gap-2 px-3 py-2 text-left transition-colors",
          hasContent ? "hover:bg-muted/50 cursor-pointer" : "cursor-default",
        )}
        onClick={() => hasContent && setExpanded(!expanded)}
      >
        <StatusIcon isLoading={isLoading} isError={!!isError} />
        <WrenchIcon className="size-3.5 text-muted-foreground" />
        <span className="font-medium truncate">{toolUse.name}</span>
        {hasContent && (
          <ChevronDownIcon
            className={cn("ml-auto size-3.5 text-muted-foreground transition-transform", expanded && "rotate-180")}
          />
        )}
      </button>
      {expanded && hasContent && (
        <div className="border-t border-border bg-muted/30 px-3 py-2 font-mono whitespace-pre-wrap text-[length:var(--font-code)] text-muted-foreground max-h-80 overflow-y-auto">
          {(() => {
            const raw = typeof toolResult!.content === "string"
              ? toolResult!.content
              : JSON.stringify(toolResult!.content, null, 2);
            const truncated = raw.length > 2000 ? raw.slice(0, 2000) + `\n\n··· ${raw.length - 2000} more chars` : raw;
            return truncated;
          })()}
        </div>
      )}
    </div>
  );
}

// ─── Tool Widget Router ───

export const ToolWidget = memo(function ToolWidget({
  toolUse,
  toolResult,
}: {
  toolUse: ContentBlock;
  toolResult?: ContentBlock;
}) {
  const name = toolUse.name?.toLowerCase() || "";

  if (name.startsWith("edit") || name.startsWith("multiedit") || name.startsWith("write")) {
    return <EditWidget toolUse={toolUse} toolResult={toolResult} />;
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
});
