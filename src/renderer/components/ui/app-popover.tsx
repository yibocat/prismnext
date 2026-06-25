/**
 * Popover panels that share AppMenu list styling (composer @/slash, symbol pickers).
 */
import { cn } from "@/lib/utils";
import { appMenuFontClass, appMenuLabelClass, appMenuPanelClass } from "@/components/ui/app-menu";

/** List-style popover chrome — same density as AppMenu. */
export const appPopoverListClass = cn(appMenuPanelClass, "shadow-md");

/** Section header inside popover lists. */
export const appPopoverLabelClass = appMenuLabelClass;

export const appPopoverFontClass = appMenuFontClass;
