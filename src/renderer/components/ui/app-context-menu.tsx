/**
 * Compact app-wide context menu — right-click menus.
 * Shares typography and spacing tokens with AppMenu.
 */
import * as React from "react";
import { cn } from "@/lib/utils";
import {
  appMenuFontClass,
  appMenuItemClass,
  appMenuLabelClass,
  appMenuPanelClass,
} from "@/components/ui/app-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

export {
  appMenuFontClass as appContextMenuFontClass,
  appMenuPanelClass as appContextMenuPanelClass,
  appMenuItemClass as appContextMenuItemClass,
  appMenuLabelClass as appContextMenuLabelClass,
};

function AppContextMenuContent({
  className,
  collisionPadding = 10,
  ...props
}: React.ComponentProps<typeof ContextMenuContent>) {
  return (
    <ContextMenuContent
      collisionPadding={collisionPadding}
      className={cn(appMenuPanelClass, "shadow-md", className)}
      {...props}
    />
  );
}

function AppContextMenuItem({
  className,
  children,
  leading,
  trailing,
  variant,
  ...props
}: React.ComponentProps<typeof ContextMenuItem> & {
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <ContextMenuItem
      variant={variant}
      className={cn(appMenuItemClass, className)}
      {...props}
    >
      {leading}
      <span className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden [&>svg]:shrink-0 [&>svg]:opacity-70">
        <span className="min-w-0 flex-1 truncate">{children}</span>
      </span>
      {trailing ? <span className="shrink-0">{trailing}</span> : null}
    </ContextMenuItem>
  );
}

function AppContextMenuDestructiveItem({
  className,
  ...props
}: React.ComponentProps<typeof AppContextMenuItem>) {
  return <AppContextMenuItem variant="destructive" className={className} {...props} />;
}

function AppContextMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuSeparator>) {
  return (
    <ContextMenuSeparator className={cn("-mx-0.5 my-0.5", className)} {...props} />
  );
}

function AppContextMenuLabel({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return <div className={cn(appMenuLabelClass, className)} {...props} />;
}

function AppContextMenuSubContent({
  className,
  collisionPadding = 10,
  ...props
}: React.ComponentProps<typeof ContextMenuSubContent>) {
  return (
    <ContextMenuSubContent
      collisionPadding={collisionPadding}
      className={cn(appMenuPanelClass, "shadow-md", className)}
      {...props}
    />
  );
}

function AppContextMenuSubTrigger({
  className,
  children,
  trailing,
  ...props
}: React.ComponentProps<typeof ContextMenuSubTrigger> & {
  trailing?: React.ReactNode;
}) {
  return (
    <ContextMenuSubTrigger
      className={cn(appMenuItemClass, "min-h-7 [&>svg:last-child]:size-3.5", className)}
      {...props}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {trailing ? <span className="shrink-0">{trailing}</span> : null}
    </ContextMenuSubTrigger>
  );
}

export {
  AppContextMenuContent,
  AppContextMenuItem,
  AppContextMenuDestructiveItem,
  AppContextMenuSeparator,
  AppContextMenuLabel,
  AppContextMenuSubContent,
  AppContextMenuSubTrigger,
  ContextMenu as AppContextMenu,
  ContextMenuTrigger as AppContextMenuTrigger,
  ContextMenuSub as AppContextMenuSub,
};
