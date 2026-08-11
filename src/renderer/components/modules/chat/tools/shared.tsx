import { useMemo, useLayoutEffect, useRef, type ReactNode } from "react";
import { diffLines } from "diff";
import { Loader2Icon, CheckIcon, AlertCircleIcon, ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  captureViewportAnchor,
  restoreViewportAnchor,
  type ViewportAnchorCapture,
} from "@/lib/chat/preserve-viewport-anchor";

// ─── Status Icon ───

export function StatusIcon({ isLoading, isError }: { isLoading: boolean; isError: boolean }) {
  if (isLoading) return <Loader2Icon className="size-3.5 animate-spin text-muted-foreground" />;
  if (isError) return <AlertCircleIcon className="size-3.5 text-destructive" />;
  return <CheckIcon className="size-3.5 text-success" />;
}

// ─── Shared panel tokens (ToolCard expanded, Todo, Question) ───

export const TOOL_PANEL_CLASS =
  "rounded-lg border border-border bg-muted shadow-[0_1px_3px_rgba(0,0,0,0.02)] overflow-hidden";
export const TOOL_PANEL_HEADER_CLASS =
  "border-b border-border bg-muted";
/** Collapsed tool row — UI Font + muted vs assistant prose (Cursor-like hierarchy). */
export const TOOL_INLINE_ROW_CLASS =
  "flex items-center gap-2 font-sans text-muted-foreground/65 hover:text-muted-foreground/80 transition-colors min-w-0";

/**
 * Primary label/path/command on a tool row.
 * Always UI Font (`font-sans`) — do not use `font-mono` / editor font here;
 * monospace is reserved for expanded tool bodies.
 */
export const TOOL_INLINE_LABEL_CLASS =
  "min-w-0 truncate font-sans font-normal text-muted-foreground/70 [&_*]:font-sans [&_[role=link]]:font-normal [&_[role=link]]:text-muted-foreground/70 [&_[role=link]]:hover:text-muted-foreground/85";
/** Expanded tool body — opaque muted fill (never bg-muted/N — reads as transparent on dark chat). */
export const TOOL_EXPANDED_CONTENT_CLASS =
  "my-1.5 min-w-0 max-w-full rounded-lg border border-border bg-muted px-3 py-2 text-[length:var(--font-code)] overflow-x-auto overflow-y-hidden animate-in fade-in slide-in-from-top-1 duration-150";

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
  const toggleRef = useRef<HTMLDivElement>(null);
  const pendingAnchorRef = useRef<ViewportAnchorCapture | null>(null);

  useLayoutEffect(() => {
    const anchor = toggleRef.current;
    const captured = pendingAnchorRef.current;
    if (!anchor || !captured) return;
    restoreViewportAnchor(captured, anchor);
    pendingAnchorRef.current = null;
  }, [expanded]);

  const handleToggle = () => {
    if (!collapsible || !toggleRef.current) return;
    pendingAnchorRef.current = captureViewportAnchor(toggleRef.current);
    onToggle();
  };

  return (
    <div className={cn("min-w-0 max-w-full", className)}>
      <div
        ref={toggleRef}
        role="button"
        tabIndex={collapsible ? 0 : -1}
        aria-disabled={!collapsible}
        className={cn(
          TOOL_INLINE_ROW_CLASS,
          // Match assistant body size (--font-chat-message); hierarchy comes from color, not size.
          "w-full max-w-full overflow-hidden text-left text-[length:var(--font-chat-message)] py-1 outline-none focus-visible:ring-1 focus-visible:ring-ring/40 rounded",
          collapsible ? "cursor-pointer" : "cursor-default",
        )}
        onMouseDown={(e) => {
          if (collapsible) e.preventDefault();
        }}
        onClick={handleToggle}
        onKeyDown={(e) => {
          if (!collapsible) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleToggle();
          }
        }}
      >
        {/* Status + tool icons must never flex-shrink — long label/meta text
         *  would otherwise squash the SVG (the "wobbling icon size" bug). */}
        <span className="shrink-0 inline-flex items-center">
          {statusIcon ?? <StatusIcon isLoading={isLoading} isError={isError} />}
        </span>
        <span className="shrink-0 text-muted-foreground/55 tabular-nums">
          {toolName}
        </span>
        <span className="shrink-0 inline-flex items-center">{icon}</span>
        <span className={TOOL_INLINE_LABEL_CLASS}>{label}</span>
        {meta}
        {headerEnd}
        {collapsible && (
          <ChevronDownIcon
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform duration-150",
              expanded ? "rotate-0" : "-rotate-90",
            )}
          />
        )}
      </div>
      {expanded && collapsible && (
        <div className={cn(TOOL_EXPANDED_CONTENT_CLASS, bodyClassName)}>
          {typeof children === "function" ? (children as () => ReactNode)() : children}
        </div>
      )}
    </div>
  );
}

/** Basename for compact tool result lines. */
export function basenamePath(p: string): string {
  return p.split(/[/\\]/).pop() || p;
}

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
/** DISPLAY helper: render a "label value" row for a tool widget. Returns null
 *  for empty values so the row collapses. NOTE: `param` EXTRACTS a value from
 *  an input object (`param(input, key)`); `Field` DISPLAYS a label+value row.
 *  Don't confuse them - several widgets once called `param(label, value)` and
 *  rendered nothing because `param` returns undefined for non-object input. */
export function Field({ label, value }: { label: string; value: string }): ReactNode {
  if (!value) return null;
  return (
    <div className="flex min-w-0 gap-1.5">
      <span className="shrink-0 opacity-70">{label}</span>
      <span className="truncate">{value}</span>
    </div>
  );
}

function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

// ─── Line diff stats (Cursor-style +N / -M on tool rows) ───

export function computeLineDiffStats(
  oldStr: string,
  newStr: string,
): { added: number; removed: number } {
  const changes = diffLines(oldStr, newStr);
  let added = 0;
  let removed = 0;
  for (const change of changes) {
    const lines = change.value.split("\n");
    if (lines[lines.length - 1] === "") lines.pop();
    if (change.added) added += lines.length;
    else if (change.removed) removed += lines.length;
  }
  return { added, removed };
}

/** Count +/- lines from a unified diff patch string. */
export function computePatchLineStats(patch: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of patch.split("\n")) {
    if (
      line.startsWith("+++")
      || line.startsWith("---")
      || line.startsWith("diff ")
      || line.startsWith("index ")
      || line.startsWith("@@")
    ) {
      continue;
    }
    if (line.startsWith("+")) added++;
    else if (line.startsWith("-")) removed++;
  }
  return { added, removed };
}

export function DiffStatBadge({
  added,
  removed,
  className,
}: {
  added: number;
  removed: number;
  className?: string;
}) {
  if (added === 0 && removed === 0) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 shrink-0 font-mono text-[length:var(--font-chat-meta)] tabular-nums",
        className,
      )}
    >
      {added > 0 && <span className="text-success">+{added}</span>}
      {removed > 0 && <span className="text-destructive">-{removed}</span>}
    </span>
  );
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
        if (row.type === "del") return <div key={i} className="break-all text-destructive/80 bg-destructive/5">- {row.text}</div>;
        if (row.type === "add") return <div key={i} className="break-all text-success/80 bg-success/5">+ {row.text}</div>;
        return null;
      })}
      {rows.length > 200 && (
        <div className="text-muted-foreground text-[length:var(--font-chat-meta)] mt-1">··· {rows.length - 200} more lines</div>
      )}
    </>
  );
}
