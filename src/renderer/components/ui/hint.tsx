import type { ReactElement } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { resolveShortcut, ShortcutKbdChips } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

export type HintProps = {
  children: ReactElement;
  /** Visible description. Defaults to registry label when `shortcutId` is set. */
  label?: string;
  /** Registry id — renders resolved chord as Kbd chips. */
  shortcutId?: string;
  side?: "top" | "bottom" | "left" | "right";
  delayDuration?: number;
  contentClassName?: string;
};

/**
 * Theme-aware toolbar hint (popover surface) with optional shortcut chips.
 * Prefer this over native `title=` for icon buttons.
 */
export function Hint({
  children,
  label,
  shortcutId,
  side = "bottom",
  delayDuration = 400,
  contentClassName,
}: HintProps) {
  const resolved = shortcutId ? resolveShortcut(shortcutId) : null;
  const text = (label ?? resolved?.label ?? "").trim();
  const hasChord = Boolean(resolved?.chord);

  if (!text && !hasChord) return children;

  return (
    <Tooltip delayDuration={delayDuration}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} className={cn(contentClassName)}>
        <span className="inline-flex items-center gap-2">
          {text ? <span className="text-popover-foreground">{text}</span> : null}
          {shortcutId && hasChord ? <ShortcutKbdChips id={shortcutId} /> : null}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}
