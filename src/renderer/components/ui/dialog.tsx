import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { XIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/** Dialog actions — same density as RightArea / Settings (`Button size="xs"`). */
export const DIALOG_ACTION_SIZE = "xs" as const;

export const dialogActionButtonsClass =
  "[&_[data-slot=button]:not([data-size^=icon])]:!h-6 [&_[data-slot=button]:not([data-size^=icon])]:!min-h-6 [&_[data-slot=button]:not([data-size^=icon])]:!gap-1 [&_[data-slot=button]:not([data-size^=icon])]:!px-2 [&_[data-slot=button]:not([data-size^=icon])]:!text-[length:var(--font-size-12)] [&_[data-slot=button]:not([data-size^=icon])]:[&_svg:not([class*='size-'])]:!size-3";

/**
 * Dialog chrome follows Settings → Appearance:
 * UI Font (`--font-sans`) and rem sizes (`html` = `--font-ui-size`).
 * Title / description tokens live in `styles/tokens/project.css`.
 */
export const dialogTitleClass =
  "font-sans font-semibold text-[length:var(--font-dialog-title)] leading-none";
export const dialogDescriptionClass =
  "font-sans text-muted-foreground text-[length:var(--font-dialog-label)]";
export const dialogBodyTextClass = "font-sans text-[length:var(--font-size-12)]";
export const dialogFieldLabelClass =
  "font-sans text-[length:var(--font-size-12)] font-medium leading-none";
export const dialogChromeClass =
  "font-sans [&_[data-slot=input]]:!text-[length:var(--font-size-12)] [&_[data-slot=textarea]]:!text-[length:var(--font-size-12)] [&_[data-slot=label]]:!text-[length:var(--font-size-12)]";

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=open]:animate-in",
        className,
      )}
      {...props}
    />
  );
}

/** Prefer a text field; never dump focus onto the first icon (that opens a tooltip). */
export function preferFieldOnOpenAutoFocus(event: Event) {
  event.preventDefault();
  const root = event.currentTarget;
  if (!(root instanceof HTMLElement)) return;
  const field = root.querySelector<HTMLElement>(
    "input:not([type=hidden]):not([type=button]):not([type=submit]):not([type=reset]):not([type=checkbox]):not([type=radio]), textarea, select, [contenteditable='true']",
  );
  field?.focus({ preventScroll: true });
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  overlayClassName,
  onOpenAutoFocus = preferFieldOnOpenAutoFocus,
  // Desktop UI: don't restore focus to the opener after Esc/close (avoids sticky focus rings).
  onCloseAutoFocus = (event) => event.preventDefault(),
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean;
  overlayClassName?: string;
}) {
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay className={overlayClassName} />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-background p-6 shadow-lg outline-none duration-200 data-[state=closed]:animate-out data-[state=open]:animate-in sm:max-w-lg",
          dialogChromeClass,
          className,
        )}
        {...props}
        onOpenAutoFocus={onOpenAutoFocus}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close asChild>
            <Button
              type="button"
              variant="outline"
              size="icon-xs"
              data-slot="dialog-close"
              className="absolute top-3 right-3 z-10 shadow-sm"
            >
              <XIcon />
              <span className="sr-only">Close</span>
            </Button>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  );
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean;
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        dialogActionButtonsClass,
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline" size={DIALOG_ACTION_SIZE}>Close</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  );
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(dialogTitleClass, className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(dialogDescriptionClass, className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
