import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PlusIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { appMenuFontClass } from "@/components/ui/app-menu";
import { appPopoverListClass } from "@/components/ui/app-popover";
import { filterTagsByQuery, type ProjectTagEntry } from "@/lib/literature/paper-tag-utils";
import { normalizePaperTag, paperTagDotClass, paperTagKey } from "../../../shared/paper-tags";
import { cn } from "@/lib/utils";

const tagInputClass = cn(
  "h-5 min-w-[4.75rem] max-w-[9rem] rounded-full px-2 py-0 shadow-none",
  "text-[length:var(--font-size-11)] md:text-[length:var(--font-size-11)]",
  "border border-dashed border-border/70 bg-background placeholder:text-muted-foreground/60",
);

const suggestItemClass = (active: boolean) =>
  cn(
    "flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-left",
    appMenuFontClass,
    active ? "bg-accent text-accent-foreground" : "hover:bg-muted",
  );

export function LiteratureTagSuggestInput({
  value,
  onChange,
  onCommit,
  onCancel,
  suggestions,
  disabled,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  onCommit: (tag: string) => void;
  onCancel: () => void;
  suggestions: readonly ProjectTagEntry[];
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [highlight, setHighlight] = useState(0);

  const matches = useMemo(() => filterTagsByQuery(suggestions, value), [suggestions, value]);
  const normalizedDraft = normalizePaperTag(value);
  const canCreate =
    Boolean(normalizedDraft) &&
    !suggestions.some((entry) => paperTagKey(entry.tag) === paperTagKey(normalizedDraft!));

  const optionCount = matches.length + (canCreate ? 1 : 0);
  const showMenu = optionCount > 0;

  useEffect(() => {
    setHighlight(0);
  }, [value, matches.length, canCreate]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const pickOption = useCallback(
    (index: number) => {
      if (index < matches.length) {
        onCommit(matches[index]!.tag);
        return;
      }
      if (canCreate && normalizedDraft) onCommit(normalizedDraft);
    },
    [canCreate, matches, normalizedDraft, onCommit],
  );

  return (
    <div className="relative inline-flex min-w-[4.75rem] max-w-[9rem]">
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Tag"
        disabled={disabled}
        className={cn(tagInputClass, "w-full")}
        aria-expanded={showMenu}
        aria-autocomplete="list"
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            if (!showMenu) return;
            setHighlight((i) => (i + 1) % optionCount);
            return;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            if (!showMenu) return;
            setHighlight((i) => (i - 1 + optionCount) % optionCount);
            return;
          }
          if (e.key === "Enter") {
            e.preventDefault();
            if (showMenu) {
              pickOption(highlight);
            } else if (normalizedDraft) {
              onCommit(normalizedDraft);
            }
            return;
          }
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        onBlur={(e) => {
          const next = e.relatedTarget as Node | null;
          if (menuRef.current?.contains(next)) return;
          if (!value.trim()) {
            onCancel();
            return;
          }
          if (normalizedDraft) onCommit(normalizedDraft);
          else onCancel();
        }}
      />

      {showMenu ? (
        <div
          ref={menuRef}
          role="listbox"
          className={cn(
            appPopoverListClass,
            "absolute left-0 top-[calc(100%+4px)] z-50 max-h-52 min-w-full w-max max-w-[min(16rem,var(--radix-dropdown-menu-content-available-width,16rem))] overflow-y-auto",
          )}
        >
          {matches.map((entry, index) => (
            <button
              key={entry.tag}
              type="button"
              role="option"
              aria-selected={highlight === index}
              className={suggestItemClass(highlight === index)}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setHighlight(index)}
              onClick={() => onCommit(entry.tag)}
            >
              <span
                className={cn("size-1.5 shrink-0 rounded-full", paperTagDotClass(entry.tag))}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate">{entry.tag}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground/60">{entry.count}</span>
            </button>
          ))}
          {canCreate && normalizedDraft ? (
            <button
              type="button"
              role="option"
              aria-selected={highlight === matches.length}
              className={suggestItemClass(highlight === matches.length)}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setHighlight(matches.length)}
              onClick={() => onCommit(normalizedDraft)}
            >
              <PlusIcon className="size-3 shrink-0 text-muted-foreground/70" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                Create &ldquo;{normalizedDraft}&rdquo;
              </span>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
