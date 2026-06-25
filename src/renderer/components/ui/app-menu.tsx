/**
 * Compact app-wide menu primitives — toolbar / panel dropdowns.
 * Built on shadcn DropdownMenu; denser than default, no decorative icons.
 * Typography: --font-menu-item (scales with Settings → UI Font via rem).
 */
import * as React from "react";
import { CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Menu text — matches layout token for dropdown / context menus. */
export const appMenuFontClass = "text-[length:var(--font-menu-item)]";

/** Shared panel chrome — outer padding + hairline row gap, not flush to border. */
export const appMenuPanelClass = cn(
  "min-w-[9.5rem] w-max max-w-[min(15rem,var(--radix-dropdown-menu-content-available-width))]",
  "flex flex-col gap-0.5 p-0.5",
  appMenuFontClass,
);

export const appMenuItemClass = cn(
  "cursor-pointer gap-1.5 rounded-sm px-2 py-1",
  appMenuFontClass,
  "focus:bg-accent focus:text-accent-foreground",
);

export const appMenuInputClass = cn(
  "flex-1 bg-transparent outline-none placeholder:text-muted-foreground/50",
  appMenuFontClass,
);

export const appMenuLabelClass = cn(
  "px-2 py-0.5 font-medium text-muted-foreground",
  "text-[length:var(--font-size-10)] uppercase tracking-wide",
);

function AppMenuContent({
  className,
  collisionPadding = 10,
  sideOffset = 3,
  ...props
}: React.ComponentProps<typeof DropdownMenuContent>) {
  return (
    <DropdownMenuContent
      sideOffset={sideOffset}
      collisionPadding={collisionPadding}
      className={cn(appMenuPanelClass, className)}
      {...props}
    />
  );
}

function AppMenuItem({
  className,
  children,
  description,
  leading,
  trailing,
  variant,
  ...props
}: React.ComponentProps<typeof DropdownMenuItem> & {
  description?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  if (description) {
    return (
      <DropdownMenuItem
        variant={variant}
        className={cn(appMenuItemClass, "items-start", className)}
        {...props}
      >
        {leading}
        <div className="min-w-0 flex-1 flex flex-col gap-px">
          <span className="truncate leading-tight">{children}</span>
          <span
            className="truncate text-[length:var(--font-path)] leading-tight text-muted-foreground/60"
            title={description}
          >
            {description}
          </span>
        </div>
        {trailing ? <span className="shrink-0">{trailing}</span> : null}
      </DropdownMenuItem>
    );
  }

  return (
    <DropdownMenuItem
      variant={variant}
      className={cn(appMenuItemClass, className)}
      {...props}
    >
      {leading}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {trailing ? <span className="shrink-0">{trailing}</span> : null}
    </DropdownMenuItem>
  );
}

function AppMenuDestructiveItem({
  className,
  ...props
}: React.ComponentProps<typeof AppMenuItem>) {
  return <AppMenuItem variant="destructive" className={className} {...props} />;
}

function AppMenuLabel({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuLabel>) {
  return <DropdownMenuLabel className={cn(appMenuLabelClass, className)} {...props} />;
}

function AppMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuSeparator>) {
  return (
    <DropdownMenuSeparator className={cn("-mx-0.5 my-0.5", className)} {...props} />
  );
}

function AppMenuShortcut({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuShortcut>) {
  return (
    <DropdownMenuShortcut
      className={cn(
        "text-[length:var(--font-size-10)] tracking-normal text-muted-foreground/60",
        className,
      )}
      {...props}
    />
  );
}

/** Toggle row — switch on the right; does not close the menu. */
function AppMenuSwitchRow({
  label,
  checked,
  onCheckedChange,
  title,
  disabled,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  title?: string;
  disabled?: boolean;
}) {
  return (
    <div
      role="menuitem"
      title={title}
      className={cn(
        "flex items-center justify-between gap-2 rounded-sm px-2 py-1",
        appMenuFontClass,
        disabled && "pointer-events-none opacity-50",
      )}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          if (!disabled) onCheckedChange(!checked);
        }
      }}
    >
      <span className="min-w-0 flex-1 select-none truncate">{label}</span>
      <Switch
        size="sm"
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

function AppMenuCheckItem({
  selected,
  description,
  className,
  children,
  trailing,
  ...props
}: React.ComponentProps<typeof DropdownMenuItem> & {
  selected?: boolean;
  description?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  const trailingNode =
    trailing || selected ? (
      <span className="flex items-center gap-1 shrink-0">
        {trailing}
        {selected ? <CheckIcon className="size-3 opacity-80" /> : null}
      </span>
    ) : null;

  return (
    <AppMenuItem
      className={className}
      description={description}
      trailing={trailingNode}
      {...props}
    >
      {children}
    </AppMenuItem>
  );
}

function AppMenuSubContent({
  className,
  collisionPadding = 10,
  ...props
}: React.ComponentProps<typeof DropdownMenuSubContent>) {
  return (
    <DropdownMenuSubContent
      collisionPadding={collisionPadding}
      className={cn(appMenuPanelClass, className)}
      {...props}
    />
  );
}

function AppMenuSubTrigger({
  className,
  children,
  trailing,
  ...props
}: React.ComponentProps<typeof DropdownMenuSubTrigger> & {
  trailing?: React.ReactNode;
}) {
  return (
    <DropdownMenuSubTrigger
      className={cn(appMenuItemClass, "[&>svg:last-child]:size-3", className)}
      {...props}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {trailing ? <span className="shrink-0">{trailing}</span> : null}
    </DropdownMenuSubTrigger>
  );
}

export {
  AppMenuContent,
  AppMenuItem,
  AppMenuDestructiveItem,
  AppMenuLabel,
  AppMenuSeparator,
  AppMenuShortcut,
  AppMenuSwitchRow,
  AppMenuCheckItem,
  AppMenuSubContent,
  AppMenuSubTrigger,
  DropdownMenu as AppMenu,
  DropdownMenuTrigger as AppMenuTrigger,
  DropdownMenuCheckboxItem as AppMenuCheckboxItem,
  DropdownMenuRadioGroup as AppMenuRadioGroup,
  DropdownMenuRadioItem as AppMenuRadioItem,
  DropdownMenuSub as AppMenuSub,
};
