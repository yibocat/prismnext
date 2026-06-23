import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { MessageSquarePlusIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export interface SelectionInsertActionProps {
  open: boolean;
  x: number;
  y: number;
  label?: string;
  placement?: "selection-top-right" | "above";
  anchor?: "viewport" | "parent";
  align?: "start" | "end";
  variant?: "default" | "inline-chip";
  shortcut?: string;
  onInsert: () => void;
  onDismiss?: () => void;
}

export function SelectionInsertAction({
  open,
  x,
  y,
  label = "Add to Chat",
  placement = "above",
  anchor = "viewport",
  align = "start",
  variant = "default",
  shortcut,
  onInsert,
  onDismiss,
}: SelectionInsertActionProps) {
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

  const isChip = variant === "inline-chip";
  const alignEnd = !isChip && (align === "end" || placement === "selection-top-right");

  const left =
    anchor === "parent"
      ? x
      : Math.max(8, Math.min(x, window.innerWidth - 160));
  const top =
    anchor === "parent"
      ? y
      : placement === "selection-top-right"
        ? Math.max(8, y)
        : Math.max(8, y - 40);

  const node = (
    <button
      ref={ref}
      type="button"
      className={cn(
        isChip
          ? buttonVariants({ variant: "outline", size: "xs" })
          : "inline-flex items-center gap-1.5 rounded px-2 py-1 text-[length:var(--font-size-12)] text-foreground hover:bg-accent",
        "pointer-events-auto animate-in fade-in-0 zoom-in-95 duration-100",
        isChip && "w-max min-w-[7.5rem] whitespace-nowrap bg-popover shadow-sm",
        !isChip && "rounded-md border border-border bg-popover px-1 py-0.5 shadow-md",
        anchor === "parent" ? "absolute z-10" : "fixed z-[200]",
      )}
      style={{
        left,
        top,
        transform: alignEnd ? "translateX(-100%)" : undefined,
      }}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        onInsert();
        onDismiss?.();
      }}
    >
      {!isChip ? <MessageSquarePlusIcon className="size-3.5 shrink-0 text-primary" /> : null}
      <span>{label}</span>
      {shortcut ? (
        <kbd className="ml-0.5 rounded border border-border/60 bg-muted/50 px-1 font-mono text-[10px] leading-none text-muted-foreground">
          {shortcut}
        </kbd>
      ) : null}
    </button>
  );

  if (anchor === "parent") return node;
  return createPortal(node, document.body);
}
