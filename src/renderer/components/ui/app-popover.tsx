/**
 * Popover panels that share AppMenu list styling (composer @/slash, symbol pickers).
 */
import { cn } from "@/lib/utils";
import { appMenuFontClass, appMenuLabelClass, appMenuPanelClass } from "@/components/ui/app-menu";

/** List-style popover chrome — same density as AppMenu (usable on plain divs, not only Radix shells). */
export const appPopoverListClass = cn(
  appMenuPanelClass,
  "rounded-md border border-border bg-popover text-popover-foreground shadow-md",
);

/** Section header inside popover lists. */
export const appPopoverLabelClass = appMenuLabelClass;

export const appPopoverFontClass = appMenuFontClass;
