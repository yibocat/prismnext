import { useEffect } from "react";
import { createPortal } from "react-dom";
import { ExternalLinkIcon, PlusSquareIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const menuItemClass =
  "relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-[length:var(--font-size-14)] outline-hidden hover:bg-accent hover:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground";

interface BrowserLinkMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onOpen: () => void;
  onOpenInNewTab: () => void;
}

/** Fixed-position link menu — matches app ContextMenu styling (not DropdownMenu). */
export function BrowserLinkMenu({
  x,
  y,
  onClose,
  onOpen,
  onOpenInNewTab,
}: BrowserLinkMenuProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-50"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        role="menu"
        className={cn(
          "fixed z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md",
        )}
        style={{ left: x, top: y }}
      >
        <button type="button" role="menuitem" className={menuItemClass} onClick={onOpen}>
          <ExternalLinkIcon />
          Open
        </button>
        <button type="button" role="menuitem" className={menuItemClass} onClick={onOpenInNewTab}>
          <PlusSquareIcon />
          Open in New Tab
        </button>
      </div>
    </>,
    document.body,
  );
}
