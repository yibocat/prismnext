import { useEffect, useRef, useState, type ReactNode } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { openUrlInBrowser } from "@/lib/browser-link";
import { cn } from "@/lib/utils";
import { literatureMetadataLabelClass } from "./literature-list-chrome";

const EMPTY_MARK = "—";

function resizeTextareaToContent(
  el: HTMLTextAreaElement,
  min: number,
  max: number,
): void {
  const lineHeight = Number.parseFloat(getComputedStyle(el).lineHeight) || 20;
  const minHeight = lineHeight * min;
  const maxHeight = lineHeight * max;
  el.style.height = "auto";
  const next = Math.min(maxHeight, Math.max(minHeight, el.scrollHeight));
  el.style.height = `${next}px`;
  el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
}

function rowsForText(text: string, min: number, max: number): number {
  const lines = text.split("\n").length;
  return Math.min(max, Math.max(min, lines));
}

export const literatureIdentifierValueClass =
  "font-mono text-[length:var(--font-size-12)] text-foreground/90 break-all text-left";

export const literatureMetadataLinkClass =
  "rounded-[3px] px-1 -mx-1 text-left text-[length:var(--font-size-13)] text-foreground/90 break-all hover:underline underline-offset-2";

interface MetadataRowProps {
  label: string;
  children: ReactNode;
  className?: string;
}

/** Zotero-style label | value row — stacks on narrow entry panels. */
export function MetadataRow({ label, children, className }: MetadataRowProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 @md:grid-cols-[5.25rem_1fr] items-start gap-x-3 gap-y-0.5 @md:gap-y-0 py-1",
        className,
      )}
    >
      <span className={literatureMetadataLabelClass}>{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

interface InlineEditableFieldProps {
  value: string;
  editable?: boolean;
  onSave: (value: string) => Promise<void>;
  displayClassName?: string;
  multiline?: boolean;
  placeholder?: string;
  id?: string;
  rows?: number;
  /** Grow textarea height to fit content when editing (multiline only). */
  fitContent?: boolean;
  minRows?: number;
  maxRows?: number;
  inputMode?: "text" | "numeric";
  mono?: boolean;
  /** Identifier rows: shrink to content width; copy buttons stay adjacent. */
  inlineSize?: boolean;
}

export function InlineEditableField({
  value,
  editable = true,
  onSave,
  displayClassName,
  multiline = false,
  placeholder,
  id,
  rows = 3,
  fitContent = false,
  minRows = 3,
  maxRows = 40,
  inputMode,
  mono,
  inlineSize = false,
}: InlineEditableFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    const len = el.value.length;
    el.setSelectionRange(len, len);
    if (multiline && fitContent && el instanceof HTMLTextAreaElement) {
      resizeTextareaToContent(el, minRows, maxRows);
    }
  }, [editing, multiline, fitContent, minRows, maxRows]);

  const handleDraftChange = (next: string) => {
    setDraft(next);
    if (!fitContent || !multiline) return;
    const el = inputRef.current;
    if (el instanceof HTMLTextAreaElement) {
      requestAnimationFrame(() => resizeTextareaToContent(el, minRows, maxRows));
    }
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  const commit = async () => {
    if (draft === value) {
      setEditing(false);
      return;
    }
    try {
      await onSave(draft);
      setEditing(false);
    } catch {
      setDraft(value);
      setEditing(false);
    }
  };

  const scheduleBlurCommit = () => {
    window.setTimeout(() => {
      const active = document.activeElement;
      if (active?.closest("[data-lit-inline-editor]")) return;
      void commit();
    }, 0);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
      return;
    }
    if (event.key !== "Enter") return;
    if (multiline && !event.metaKey && !event.ctrlKey) return;
    event.preventDefault();
    void commit();
  };

  const fieldBoxClass = cn(
    "box-border rounded-[3px] px-1 py-0.5",
    inlineSize ? "inline-block w-fit max-w-full min-w-0" : "w-full min-w-0",
  );

  const inlineInputSize = inlineSize
    ? Math.min(Math.max((editing ? draft : value).length, placeholder?.length ?? 0, 12), 120)
    : undefined;

  const editClass = cn(
    fieldBoxClass,
    "border border-border/55 bg-background outline-none",
    "focus-visible:border-ring/60",
    mono && "font-mono",
    displayClassName,
  );

  const idleClass = cn(
    fieldBoxClass,
    "cursor-text border border-transparent",
    "hover:border-border/55 transition-colors",
    displayClassName,
  );

  if (!editable) {
    if (!value.trim()) {
      return <span className="text-muted-foreground/45">{EMPTY_MARK}</span>;
    }
    return (
      <span className={displayClassName} title={value}>
        {value}
      </span>
    );
  }

  if (editing) {
    const shared = {
      id,
      "data-lit-inline-editor": true,
      value: draft,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        handleDraftChange(e.target.value),
      onKeyDown: handleKeyDown,
      onBlur: scheduleBlurCommit,
      placeholder,
    };

    if (multiline) {
      const textareaRows = fitContent ? rowsForText(draft, minRows, maxRows) : rows;
      return (
        <textarea
          {...shared}
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          rows={textareaRows}
          className={cn(
            editClass,
            fitContent ? "resize-none overflow-hidden" : "resize-y",
            "leading-relaxed",
          )}
        />
      );
    }

    return (
      <input
        {...shared}
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type="text"
        inputMode={inputMode}
        size={inlineInputSize}
        className={editClass}
      />
    );
  }

  const isEmpty = !value.trim();

  return (
    <div
      role="button"
      tabIndex={0}
      id={id}
      data-lit-inline-field
      onMouseDown={(event) => {
        event.preventDefault();
        setEditing(true);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setEditing(true);
        }
      }}
      className={cn(idleClass, isEmpty && "text-muted-foreground/45")}
    >
      {isEmpty ? EMPTY_MARK : value}
    </div>
  );
}

interface InlineEditableSelectProps {
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  editable?: boolean;
  onSave: (value: string) => Promise<void>;
  displayClassName?: string;
  id?: string;
}

export function InlineEditableSelect({
  value,
  options,
  editable = true,
  onSave,
  displayClassName,
  id,
}: InlineEditableSelectProps) {
  const [editing, setEditing] = useState(false);
  const selectRef = useRef<HTMLSelectElement>(null);
  const label = options.find((o) => o.value === value)?.label ?? value;

  useEffect(() => {
    if (!editing) return;
    selectRef.current?.focus();
  }, [editing]);

  if (!editable) {
    if (!label) return null;
    return <span className={displayClassName}>{label}</span>;
  }

  if (editing) {
    return (
      <select
        id={id}
        ref={selectRef}
        data-lit-inline-editor
        value={value}
        className={cn(
          "rounded-[3px] border-0 bg-background/80 px-1.5 py-0.5 text-[length:var(--font-size-11)] outline-none ring-1 ring-ring/35",
          displayClassName,
        )}
        onChange={(e) => {
          const next = e.target.value;
          void onSave(next).finally(() => setEditing(false));
        }}
        onBlur={() => window.setTimeout(() => setEditing(false), 0)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setEditing(false);
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <span
      role="button"
      tabIndex={0}
      id={id}
      data-lit-inline-field
      onMouseDown={(e) => {
        e.preventDefault();
        setEditing(true);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setEditing(true);
        }
      }}
      className={cn(
        displayClassName,
        "cursor-pointer hover:ring-1 hover:ring-border/30 transition-shadow",
      )}
    >
      {label}
    </span>
  );
}

interface MetadataIdValueProps {
  value: string;
  editable?: boolean;
  href?: string;
  cite?: boolean;
  placeholder?: string;
  onSave: (value: string) => Promise<void>;
}

const COPY_FEEDBACK_MS = 1500;

export function CopyFeedbackButton({
  onCopy,
  title,
  children,
  className,
}: {
  onCopy: () => void | Promise<void>;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const handleClick = () => {
    void Promise.resolve(onCopy()).then(() => {
      setCopied(true);
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    });
  };

  return (
    <button
      type="button"
      className={className}
      onMouseDown={(e) => e.preventDefault()}
      onClick={handleClick}
      title={title}
    >
      {copied ? (
        <CheckIcon className="size-3 text-success" aria-label="Copied" />
      ) : (
        children
      )}
    </button>
  );
}

export function MetadataIdValue({
  value,
  editable = true,
  href,
  cite,
  placeholder,
  onSave,
}: MetadataIdValueProps) {
  const copy = () => {
    if (!value.trim()) return;
    void navigator.clipboard.writeText(value).catch(() => {});
  };
  const copyCite = () => {
    if (!value.trim()) return;
    void navigator.clipboard.writeText(`\\cite{${value}}`).catch(() => {});
  };

  return (
    <div className="inline-flex max-w-full flex-wrap items-start gap-x-1.5 gap-y-0.5">
      <div className="min-w-0 max-w-full">
        {editable ? (
          <InlineEditableField
            value={value}
            editable
            onSave={onSave}
            placeholder={placeholder}
            mono
            inlineSize
            displayClassName={literatureIdentifierValueClass}
          />
        ) : href && value.trim() ? (
          <button
            type="button"
            className={cn(
              "rounded-[3px] px-1 -mx-1 hover:underline underline-offset-2",
              literatureIdentifierValueClass,
            )}
            onClick={() => openUrlInBrowser(href)}
            title={value}
          >
            {value}
          </button>
        ) : (
          <span className={literatureIdentifierValueClass} title={value || undefined}>
            {value.trim() || EMPTY_MARK}
          </span>
        )}
      </div>
      {value.trim() ? (
        <CopyFeedbackButton
          onCopy={copy}
          title={`Copy${cite ? " cite key" : ""}: ${value}`}
          className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/45 hover:bg-muted hover:text-foreground transition-colors"
        >
          <CopyIcon className="size-3" />
        </CopyFeedbackButton>
      ) : null}
      {cite && value.trim() ? (
        <CopyFeedbackButton
          onCopy={copyCite}
          title={`Copy LaTeX citation: \\cite{${value}}`}
          className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[length:var(--font-size-11)] text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          \cite
        </CopyFeedbackButton>
      ) : null}
    </div>
  );
}
