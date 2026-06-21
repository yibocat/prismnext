import { useMemo, type ReactNode } from "react";
import { diffLines } from "diff";
import { Loader2Icon, CheckIcon, AlertCircleIcon, ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Status Icon ───

export function StatusIcon({ isLoading, isError }: { isLoading: boolean; isError: boolean }) {
  if (isLoading) return <Loader2Icon className="size-3.5 animate-spin text-muted-foreground" />;
  if (isError) return <AlertCircleIcon className="size-3.5 text-destructive" />;
  return <CheckIcon className="size-3.5 text-success" />;
}

// ─── ToolCard — shared shell for all tool widgets ───

export interface ToolCardProps {
  toolName: string;
  icon: ReactNode;
  label: ReactNode;
  meta?: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  /** Body content. Pass a render function to defer evaluation until the
   *  body is actually expanded (avoids accessing undefined toolResult
   *  during streaming).  Plain ReactNode also works for static content. */
  children: ReactNode | (() => ReactNode);
  isLoading?: boolean;
  isError?: boolean;
  hasContent?: boolean;
  /** Override the default StatusIcon (e.g. EditWidget resolved state) */
  statusIcon?: ReactNode;
  /** Extra content between meta and the chevron */
  headerEnd?: ReactNode;
  bodyClassName?: string;
  className?: string;
}

/**
 * Standard tool widget shell.  All non-interactive tool widgets (bash, read,
 * grep, glob, list, webfetch, websearch, task, skill, patch, lsp, generic,
 * edit) use this as their outer container.  Interactive tools (question,
 * todowrite) have unique layouts and render their own shell.
 */
export function ToolCard({
  toolName,
  icon,
  label,
  meta,
  expanded,
  onToggle,
  children,
  isLoading = false,
  isError = false,
  hasContent = false,
  statusIcon,
  headerEnd,
  bodyClassName,
  className,
}: ToolCardProps) {
  const collapsible = hasContent;

  return (
    <div className={cn(
      "my-2 rounded-lg border border-border bg-card overflow-hidden text-[length:var(--font-code)]",
      className,
    )}>
      <button
        type="button"
        className={cn(
          "flex w-full items-center gap-2 px-3 py-2 text-left transition-colors",
          collapsible ? "hover:bg-muted/50 cursor-pointer" : "cursor-default",
        )}
        onClick={() => collapsible && onToggle()}
      >
        {statusIcon ?? <StatusIcon isLoading={isLoading} isError={isError} />}
        <span className="text-muted-foreground text-[length:var(--font-chat-meta)] shrink-0">
          {toolName}
        </span>
        {icon}
        {label}
        {meta}
        {headerEnd}
        {collapsible && (
          <ChevronDownIcon
            className={cn(
              "ml-auto size-3.5 text-muted-foreground transition-transform",
              expanded && "rotate-180",
            )}
          />
        )}
      </button>
      {expanded && hasContent && (
        <div className={cn("border-t border-border bg-muted/30 px-3 py-2", bodyClassName)}>
          {typeof children === "function" ? (children as () => ReactNode)() : children}
        </div>
      )}
    </div>
  );
}

// ─── Parameter extraction (camelCase + snake_case compatible) ───

/**
 * Extract a parameter value from a tool input object, trying both snake_case
 * and camelCase key variants.  OpenCode built-in tools use snake_case
 * (e.g. `file_path`, `old_string`) but ACP `raw_input` may be delivered in
 * either convention depending on SDK version.
 *
 * Usage:
 *   const filePath = param(input, "file_path", "filePath");
 *   const isRecursive = param(input, "recursive");  // single key → tries both cases
 */
export function param(
  input: any,
  snakeKey: string,
  camelKey?: string,
): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const ck = camelKey || snakeToCamel(snakeKey);
  const val = input[snakeKey] ?? input[ck];
  return val != null ? String(val) : undefined;
}

/** "file_path" → "filePath", "old_string" → "oldString" */
function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

// ─── Diff Renderer ───

export function DiffLines({ oldStr, newStr }: { oldStr: string; newStr: string }) {
  const changes = useMemo(() => diffLines(oldStr, newStr), [oldStr, newStr]);

  const rows: { type: "same" | "del" | "add" | "skip"; text: string }[] = [];
  let skipped = 0;

  for (const change of changes) {
    const lines = change.value.split("\n");
    if (lines[lines.length - 1] === "") lines.pop();

    if (change.added) {
      skipped = 0;
      for (const line of lines) rows.push({ type: "add", text: line });
    } else if (change.removed) {
      skipped = 0;
      for (const line of lines) rows.push({ type: "del", text: line });
    } else {
      for (const line of lines) {
        skipped++;
        if (skipped === 3) rows.push({ type: "skip", text: "" });
      }
    }
  }

  const displayRows = rows.slice(0, 200);

  return (
    <>
      {displayRows.map((row, i) => {
        if (row.type === "skip") return <div key={i} className="text-muted-foreground/40 select-none">···</div>;
        if (row.type === "del") return <div key={i} className="text-destructive/80 bg-destructive/5">- {row.text}</div>;
        if (row.type === "add") return <div key={i} className="text-success/80 bg-success/5">+ {row.text}</div>;
        return null;
      })}
      {rows.length > 200 && (
        <div className="text-muted-foreground text-[length:var(--font-chat-meta)] mt-1">··· {rows.length - 200} more lines</div>
      )}
    </>
  );
}
