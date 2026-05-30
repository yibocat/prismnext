import { memo } from "react";
import type { ContentBlock } from "@/stores/chat-store";
import { ListTodoIcon, CheckIcon, CircleIcon, Loader2Icon } from "lucide-react";
import { cn } from "@/lib/utils";

export const TodoWriteWidget = memo(function TodoWriteWidget({ toolUse }: { toolUse: ContentBlock }) {
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
});
