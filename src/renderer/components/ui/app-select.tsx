/**
 * Settings / form Select — dropdown panels match AppMenu density & typography.
 * Triggers stay compact on settings rows; use `dialog` / `profile` variants in modals.
 */
import * as React from "react";
import { cn } from "@/lib/utils";
import { appMenuFontClass, appMenuItemClass } from "@/components/ui/app-menu";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const selectViewportClass =
  "[&_[data-slot=select-viewport]]:flex [&_[data-slot=select-viewport]]:flex-col [&_[data-slot=select-viewport]]:gap-0.5 [&_[data-slot=select-viewport]]:p-0.5";

export const appSelectContentClass = cn(selectViewportClass, appMenuFontClass);

export const appSelectItemClass = cn(
  appMenuItemClass,
  "cursor-pointer pr-8 pl-2",
  "[&_[data-slot=select-item-indicator]]:right-2 [&_[data-slot=select-item-indicator]_svg]:size-3",
);

const triggerBase = cn(
  "w-fit gap-1.5 !py-0 shadow-xs bg-background",
  appMenuFontClass,
  "[&_svg]:!size-3 [&_svg]:opacity-50",
);

/** Default settings row trigger — h-6, scales with UI Font. */
export const appSelectTriggerClass = cn(triggerBase, "!h-6 !min-h-6 !px-2");

/** Long option labels (AI terminal timeouts, etc.). */
export const appSelectTriggerWideClass = cn(appSelectTriggerClass, "min-w-[9rem]");

/** Dialog form fields — h-8. */
export const appSelectTriggerDialogClass = cn(triggerBase, "!h-8 !min-h-8 !px-2.5");

/** Profile editor — h-9, full width friendly. */
export const appSelectTriggerProfileClass = cn(triggerBase, "!h-9 !min-h-9 !px-2.5");

type AppSelectTriggerProps = React.ComponentProps<typeof SelectTrigger> & {
  variant?: "default" | "wide" | "dialog" | "profile";
};

function AppSelectTrigger({
  className,
  variant = "default",
  size,
  ...props
}: AppSelectTriggerProps) {
  const variantClass =
    variant === "wide"
      ? appSelectTriggerWideClass
      : variant === "dialog"
        ? appSelectTriggerDialogClass
        : variant === "profile"
          ? appSelectTriggerProfileClass
          : appSelectTriggerClass;

  return <SelectTrigger size={size} className={cn(variantClass, className)} {...props} />;
}

function AppSelectContent({
  className,
  position = "popper",
  align = "start",
  side = "bottom",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof SelectContent>) {
  return (
    <SelectContent
      className={cn(appSelectContentClass, className)}
      position={position}
      align={align}
      side={side}
      sideOffset={sideOffset}
      {...props}
    />
  );
}

function AppSelectItem({ className, ...props }: React.ComponentProps<typeof SelectItem>) {
  return (
    <SelectItem
      className={cn(appSelectItemClass, props.disabled && "opacity-50", className)}
      {...props}
    />
  );
}

export {
  Select as AppSelect,
  SelectValue as AppSelectValue,
  SelectGroup as AppSelectGroup,
  SelectLabel as AppSelectLabel,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
};
