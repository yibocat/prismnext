import { useEffect } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import {
  appContextMenuItemClass,
  appContextMenuPanelClass,
} from "@/components/ui/app-context-menu";

interface BrowserLinkMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onOpen: () => void;
  onOpenInNewTab: () => void;
}

/** Fixed-position link menu — shares AppContextMenu styling. */
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

  const itemClass = cn(
    appContextMenuItemClass,
    "w-full border-0 bg-transparent text-left outline-hidden",
  );

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
        className={cn(appContextMenuPanelClass, "fixed z-50 shadow-md")}
        style={{ left: x, top: y }}
      >
        <button type="button" role="menuitem" className={itemClass} onClick={onOpen}>
          <span className="truncate">Open</span>
        </button>
        <button type="button" role="menuitem" className={itemClass} onClick={onOpenInNewTab}>
          <span className="truncate">Open in New Tab</span>
        </button>
      </div>
    </>,
    document.body,
  );
}
