import { useState } from "react";
import type { ContentBlock } from "@/stores/claude-chat-store";
import { useClaudeChatStore } from "@/stores/claude-chat-store";
import {
  LoaderIcon,
  CheckIcon,
  AlertCircleIcon,
  CircleIcon,
  ChevronDownIcon,
  FileEditIcon,
  FileIcon,
  TerminalIcon,
  ListTodoIcon,
  BotIcon,
  MessageCircleQuestionIcon,
} from "lucide-react";

// ─── Status Icon ───

function StatusIcon({ isLoading, isError }: { isLoading: boolean; isError: boolean }) {
  if (isLoading) return <LoaderIcon className="size-3 animate-spin text-muted-foreground" />;
  if (isError) return <AlertCircleIcon className="size-3 text-destructive" />;
  return <CheckIcon className="size-3 text-green-500" />;
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
    <div className="my-1 rounded-md border border-border bg-muted/30 text-xs">
      <button
        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <StatusIcon isLoading={isLoading} isError={!!isError} />
        <FileEditIcon className="size-3 text-blue-500" />
        <span className="truncate font-medium">{fileName}</span>
        <ChevronDownIcon
          className={`ml-auto size-3 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>
      {expanded && (
        <div className="border-t border-border px-2 py-1.5 font-mono">
          {toolUse.input?.old_string && (
            <div className="mb-1">
              <span className="text-red-400">- </span>
              <span className="text-red-300 line-through">
                {toolUse.input.old_string.slice(0, 200)}
                {toolUse.input.old_string.length > 200 ? "..." : ""}
              </span>
            </div>
          )}
          {toolUse.input?.new_string && (
            <div>
              <span className="text-green-400">+ </span>
              <span className="text-green-300">
                {toolUse.input.new_string.slice(0, 200)}
                {toolUse.input.new_string.length > 200 ? "..." : ""}
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
    <div className="my-1 flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-1.5 text-xs">
      <StatusIcon isLoading={isLoading} isError={!!isError} />
      <FileIcon className="size-3 text-blue-500" />
      <span className="font-medium">{fileName}</span>
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
    <div className="my-1 rounded-md border border-border bg-muted/30 text-xs">
      <button
        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <StatusIcon isLoading={isLoading} isError={!!isError} />
        <TerminalIcon className="size-3 text-yellow-500" />
        <span className="truncate font-mono">{command.slice(0, 80)}</span>
        <ChevronDownIcon
          className={`ml-auto size-3 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>
      {expanded && toolResult?.content && (
        <div className="border-t border-border bg-zinc-950 p-2 font-mono text-zinc-300">
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

  return (
    <div className="my-1 rounded-md border border-border bg-muted/30 px-2 py-1.5 text-xs">
      <div className="flex items-center gap-1.5 mb-1">
        <ListTodoIcon className="size-3 text-purple-500" />
        <span className="font-medium">Todo</span>
      </div>
      {todos.map((todo, i) => (
        <div key={i} className="flex items-center gap-1.5 pl-4 py-0.5">
          {todo.status === "completed" ? (
            <CheckIcon className="size-3 text-green-500" />
          ) : todo.status === "in_progress" ? (
            <LoaderIcon className="size-3 animate-spin text-blue-500" />
          ) : (
            <CircleIcon className="size-3 text-muted-foreground" />
          )}
          <span className={todo.status === "completed" ? "line-through text-muted-foreground" : ""}>
            {todo.content}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Thinking Widget ───

export function ThinkingWidget({ thinking }: { thinking: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="my-1 text-xs">
      <button
        className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
        onClick={() => setExpanded(!expanded)}
      >
        <BotIcon className="size-3" />
        <span className="italic">Thinking...</span>
        <ChevronDownIcon
          className={`size-3 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>
      {expanded && (
        <div className="mt-1 rounded-md bg-muted/30 p-2 text-muted-foreground italic">
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
  const sendPrompt = useClaudeChatStore((s) => s.sendPrompt);
  const isStreaming = useClaudeChatStore((s) => s.isStreaming);
  const isLoading = !toolResult;
  const isError = toolResult?.is_error;
  const needsUserAnswer = !answered && !isStreaming && toolResult && !isError;

  const question = toolUse.input?.question || "";
  const options: string[] = toolUse.input?.options || [];

  const handleSelectOption = (label: string) => {
    if (!needsUserAnswer) return;
    setAnswered(true);
    sendPrompt(label);
  };

  if (!question && !options.length) {
    return (
      <div className="my-1 flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-1.5 text-xs">
        <StatusIcon isLoading={isLoading} isError={!!isError} />
        <MessageCircleQuestionIcon className="size-3 text-blue-500" />
        <span className="font-medium">
          {isLoading ? "Asking question..." : "Asked question"}
        </span>
      </div>
    );
  }

  return (
    <div className={`my-1 rounded-lg border px-3 py-2 text-xs ${needsUserAnswer ? "border-blue-500/40 bg-blue-500/10" : "border-blue-500/20 bg-blue-500/5"}`}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <MessageCircleQuestionIcon className="size-3 text-blue-600 dark:text-blue-400" />
        <span className="font-medium text-blue-600 dark:text-blue-400">
          {needsUserAnswer ? "Choose an option:" : answered ? "Answer sent" : "Question answered"}
        </span>
      </div>

      {question && (
        <p className="mb-2 text-foreground">{question}</p>
      )}

      <div className="flex flex-col gap-1">
        {options.map((opt, i) => (
          <button
            key={i}
            disabled={!needsUserAnswer}
            className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors ${needsUserAnswer ? "hover:bg-blue-500/15 cursor-pointer" : "cursor-default opacity-60"}`}
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
    <div className="my-1 flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-1.5 text-xs">
      <StatusIcon isLoading={isLoading} isError={!!isError} />
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
