/**
 * Compact app-wide menu primitives — toolbar / panel dropdowns.
 * Built on shadcn DropdownMenu; denser than default.
 * Typography: --font-menu-item (compact, rem-scaled with UI Font size) + font-sans (Appearance UI Font family).
 *
 * Icons: pass via `leading` (preferred) or as the first child — label row is flex
 * so SVGs stay beside text (Tailwind preflight sets svg display:block).
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

/** Menu text — UI Font family; size via --font-menu-item (scales with Appearance uiFontSize). */
export const appMenuFontClass = "font-sans text-[length:var(--font-menu-item)]";

export const appMenuInlineChevronTriggerClass =
  "inline-flex shrink-0 items-center border-0 bg-transparent p-0 text-muted-foreground/70 outline-none";

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

/** Label row — icons must sit in a flex row (Tailwind preflight sets svg display:block). */
const appMenuItemLabelClass = cn(
  "flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden",
  "[&>svg]:shrink-0 [&>svg]:opacity-70",
);

export const appMenuInputClass = cn(
  "flex-1 bg-transparent outline-none placeholder:text-muted-foreground/50",
  appMenuFontClass,
);

export const appMenuLabelClass = cn(
  "px-2 py-0.5 font-medium text-muted-foreground",
  "text-[length:var(--font-size-10)] uppercase tracking-wide",
);

/** Elevated z-index when AppMenu opens beside another overlay (e.g. composer @ popover). */
export const appMenuNestedZClass = "z-[100]";

/** Defaults for AppMenu nested inside another floating panel — no focus steal, stays on top. */
export const appMenuNestedFocusHandlers = {
  onOpenAutoFocus: (e: Event) => e.preventDefault(),
  onCloseAutoFocus: (e: Event) => e.preventDefault(),
  onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
} as const;

function AppMenuContent({
  className,
  collisionPadding = 10,
  sideOffset = 3,
  ...props
}: React.ComponentProps<typeof DropdownMenuContent> & {
  onOpenAutoFocus?: (event: Event) => void;
}) {
  return (
    <DropdownMenuContent
      sideOffset={sideOffset}
      collisionPadding={collisionPadding}
      className={cn(appMenuPanelClass, className)}
      {...props}
    />
  );
}

/** Side submenu beside a parent row — for nested overlays (composer @ paper options). */
function AppMenuSidePanel({
  className,
  side = "right",
  align = "start",
  sideOffset = 4,
  collisionPadding = 12,
  ...props
}: React.ComponentProps<typeof AppMenuContent>) {
  return (
    <AppMenuContent
      side={side}
      align={align}
      sideOffset={sideOffset}
      collisionPadding={collisionPadding}
      className={cn(appMenuNestedZClass, "min-w-[10.5rem]", className)}
      {...appMenuNestedFocusHandlers}
      {...props}
    />
  );
}

function AppMenuItemLabel({ children }: { children: React.ReactNode }) {
  if (children == null || children === false) return null;
  if (typeof children === "string" || typeof children === "number") {
    return (
      <span className={appMenuItemLabelClass}>
        <span className="min-w-0 truncate">{children}</span>
      </span>
    );
  }
  return <span className={appMenuItemLabelClass}>{children}</span>;
}

function AppMenuTitleWithAddon({
  children,
  addon,
}: {
  children: React.ReactNode;
  addon?: React.ReactNode;
}) {
  if (!addon) {
    return <span className="min-w-0 truncate leading-tight">{children}</span>;
  }
  return (
    <span className="flex min-w-0 items-center gap-1">
      <span className="min-w-0 truncate leading-tight">{children}</span>
      <span className="shrink-0">{addon}</span>
    </span>
  );
}

function AppMenuItem({
  className,
  children,
  description,
  leading,
  trailing,
  titleAddon,
  variant,
  ...props
}: React.ComponentProps<typeof DropdownMenuItem> & {
  description?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  /** Sits immediately after the title, not at the row’s far end. */
  titleAddon?: React.ReactNode;
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
          <AppMenuTitleWithAddon addon={titleAddon}>{children}</AppMenuTitleWithAddon>
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

  if (titleAddon) {
    return (
      <DropdownMenuItem
        variant={variant}
        className={cn(appMenuItemClass, className)}
        {...props}
      >
        {leading}
        <AppMenuItemLabel>
          <AppMenuTitleWithAddon addon={titleAddon}>{children}</AppMenuTitleWithAddon>
        </AppMenuItemLabel>
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
      <AppMenuItemLabel>{children}</AppMenuItemLabel>
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
  className,
  enterToggles = true,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  title?: string;
  disabled?: boolean;
  className?: string;
  /** When false, only Space toggles (Enter passes through — e.g. composer confirms parent row). */
  enterToggles?: boolean;
}) {
  return (
    <div
      role="menuitem"
      title={title}
      className={cn(
        "flex items-center justify-between gap-2 rounded-sm px-2 py-1",
        appMenuFontClass,
        disabled && "pointer-events-none opacity-50",
        className,
      )}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === " " || (enterToggles && e.key === "Enter")) {
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
  titleAddon,
  ...props
}: React.ComponentProps<typeof DropdownMenuItem> & {
  selected?: boolean;
  description?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  titleAddon?: React.ReactNode;
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
      titleAddon={titleAddon}
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
  leading,
  ...props
}: React.ComponentProps<typeof DropdownMenuSubTrigger> & {
  trailing?: React.ReactNode;
  leading?: React.ReactNode;
}) {
  return (
    <DropdownMenuSubTrigger
      className={cn(appMenuItemClass, "min-h-7 [&>svg:last-child]:size-3.5", className)}
      {...props}
    >
      {leading}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {trailing ? <span className="shrink-0">{trailing}</span> : null}
    </DropdownMenuSubTrigger>
  );
}

export {
  AppMenuContent,
  AppMenuSidePanel,
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
