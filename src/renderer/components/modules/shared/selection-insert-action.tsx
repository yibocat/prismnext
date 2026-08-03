import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { GripVerticalIcon, MessageSquarePlusIcon } from "lucide-react";
import { setComposerDragData } from "@/lib/chat/composer-drag";
import type { ComposerDragPayload } from "@/lib/chat/composer-drag";
import type { SelectionChipPlacement } from "@/lib/selection-chip-position";
import { cn } from "@/lib/utils";

export interface SelectionInsertActionProps {
  open: boolean;
  x: number;
  y: number;
  label?: string;
  chipPlacement?: SelectionChipPlacement;
  /** @deprecated Use chipPlacement */
  placement?: "selection-top-right" | "above";
  anchor?: "viewport" | "parent";
  shortcut?: string;
  onInsert: () => void;
  onDismiss?: () => void;
  getDragPayloads?: () => ComposerDragPayload[] | null;
}

function transformForPlacement(placement: SelectionChipPlacement): string | undefined {
  if (placement === "top-right" || placement === "bottom-right") {
    return "translateX(-100%)";
  }
  return undefined;
}

export function SelectionInsertAction({
  open,
  x,
  y,
  label,
  chipPlacement = "top-right",
  placement,
  anchor = "parent",
  shortcut,
  onInsert,
  onDismiss,
  getDragPayloads,
}: SelectionInsertActionProps) {
  const { t } = useTranslation();
  const resolvedLabel = label ?? t("common.addToChat");
  const shellRef = useRef<HTMLDivElement>(null);
  const draggedRef = useRef(false);

  const resolvedPlacement =
    placement === "above" ? "top-right" : chipPlacement;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (shellRef.current?.contains(e.target as Node)) return;
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

  const atSelectionCorner = placement !== "above";
  const left =
    anchor === "parent"
      ? x
      : atSelectionCorner
        ? x
        : Math.max(8, Math.min(x, window.innerWidth - 160));
  const top =
    anchor === "parent"
      ? y
      : atSelectionCorner
        ? y
        : Math.max(8, y - 40);

  const canDrag = Boolean(getDragPayloads);

  const node = (
    <div
      ref={shellRef}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border border-border",
        "text-[length:var(--font-size-12)] font-medium text-foreground",
        "bg-background shadow-md",
        "pointer-events-auto select-none",
        "whitespace-nowrap",
        anchor === "parent" ? "absolute z-[200]" : "fixed z-[200]",
      )}
      style={{
        left,
        top,
        transform: atSelectionCorner ? transformForPlacement(resolvedPlacement) : undefined,
      }}
    >
      {canDrag ? (
        <span
          draggable
          title={t("common.dragToChat", { defaultValue: "Drag to Chat" })}
          className="inline-flex cursor-grab items-center px-1 py-1 text-muted-foreground/70 active:cursor-grabbing"
          onMouseDown={(e) => {
            e.stopPropagation();
          }}
          onDragStart={(e) => {
            const payloads = getDragPayloads?.();
            if (!payloads?.length || !e.dataTransfer) {
              e.preventDefault();
              return;
            }
            draggedRef.current = true;
            e.stopPropagation();
            setComposerDragData(e.dataTransfer, payloads);
          }}
          onDragEnd={() => {
            window.setTimeout(() => {
              draggedRef.current = false;
            }, 0);
          }}
        >
          <GripVerticalIcon className="size-3.5 shrink-0" aria-hidden />
        </span>
      ) : null}
      <button
        type="button"
        className="inline-flex items-center gap-1.5 px-1.5 py-1"
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onClick={() => {
          if (draggedRef.current) return;
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
    </div>
  );

  if (anchor === "parent") return node;
  return createPortal(node, document.body);
}
