import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { MessageSquarePlusIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectionInsertActionProps {
  open: boolean;
  x: number;
  y: number;
  label?: string;
  placement?: "selection-top-right" | "above";
  anchor?: "viewport" | "parent";
  shortcut?: string;
  onInsert: () => void;
  onDismiss?: () => void;
}

export function SelectionInsertAction({
  open,
  x,
  y,
  label,
  placement = "selection-top-right",
  anchor = "parent",
  shortcut,
  onInsert,
  onDismiss,
}: SelectionInsertActionProps) {
  const { t } = useTranslation();
  const resolvedLabel = label ?? t("common.addToChat");
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      onDismiss?.();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss?.();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onDismiss]);

  if (!open) return null;

  const atSelectionTopRight = placement === "selection-top-right";

  const left =
    anchor === "parent"
      ? x
      : atSelectionTopRight
        ? x
        : Math.max(8, Math.min(x, window.innerWidth - 160));
  const top =
    anchor === "parent"
      ? y
      : atSelectionTopRight
        ? Math.max(8, y)
        : Math.max(8, y - 40);

  const node = (
    <button
      ref={ref}
      type="button"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1",
        "text-[length:var(--font-size-12)] font-medium text-foreground",
        "bg-background shadow-md",
        "pointer-events-auto",
        "whitespace-nowrap",
        anchor === "parent" ? "absolute z-[200]" : "fixed z-[200]",
      )}
      style={{
        left,
        top,
        transform: atSelectionTopRight ? "translateX(-100%)" : undefined,
      }}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        onInsert();
        onDismiss?.();
      }}
    >
      <MessageSquarePlusIcon className="size-3.5 shrink-0 text-primary" />
      <span>{resolvedLabel}</span>
      {shortcut ? (
        <kbd className="ml-0.5 rounded border border-border/60 bg-muted px-1 font-mono text-[10px] leading-none text-muted-foreground">
          {shortcut}
        </kbd>
      ) : null}
    </button>
  );

  if (anchor === "parent") return node;
  return createPortal(node, document.body);
}
