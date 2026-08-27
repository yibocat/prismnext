import type { ReactNode } from "react";
import { Folder, FolderOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Hint } from "@/components/ui/hint";
import { pressLeftNav, type LeftNavDefinition } from "@/lib/workspace/left-nav";
import { ShortcutKbdChips, SHORTCUT_CHIPS_HOVER_REVEAL } from "@/lib/shortcuts";

type LeftNavButtonProps = {
  item: LeftNavDefinition;
  onPressed?: () => void;
};

/** Shared LeftSidebar row: nav items, workbench projects, and sessions. */
export const LEFT_SIDEBAR_ROW =
  "flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-[length:var(--font-session-item)] text-muted-foreground transition-[color]";
export const LEFT_SIDEBAR_ROW_HOVER = "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";
export const LEFT_SIDEBAR_ROW_ACTIVE = "bg-sidebar-accent text-sidebar-accent-foreground font-medium";
/** In-row action (project “+” / “−”) — ghost icon; fill only while pointed at. */
export const LEFT_SIDEBAR_ROW_ACTION =
  "flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-[color,opacity] group-hover/project:opacity-100 hover:bg-muted hover:text-foreground";
/** Session trailing control — hidden until hover; overlay so the title can use the full row. */
export const LEFT_SIDEBAR_SESSION_HOVER_ACTION =
  "shrink-0 text-muted-foreground/70 hover:text-foreground";
/** Pin / archive / time sit on the title, not in flow. Fixed time column keeps the overlay width stable. */
export const LEFT_SIDEBAR_SESSION_TRAILING =
  "absolute right-0 top-1/2 z-[1] flex -translate-y-1/2 items-center gap-1 pl-2 opacity-0 pointer-events-none transition-opacity group-hover/session:opacity-100 group-hover/session:pointer-events-auto bg-sidebar group-hover/session:bg-sidebar-accent group-[&.bg-sidebar-accent]/session:bg-sidebar-accent";
export const LEFT_SIDEBAR_SESSION_TIME =
  "w-[2rem] shrink-0 text-right text-[length:var(--font-session-item)] text-muted-foreground/70 tabular-nums";
export const LEFT_SIDEBAR_SESSION_TITLE_HOVER_PAD = "group-hover/session:pr-[4.75rem]";
/** Compact stack — 2px so rounded hover pills do not fuse. */
export const LEFT_SIDEBAR_STACK = "flex flex-col gap-0.5";
/** Between collapsed projects — same 2px as `LEFT_SIDEBAR_STACK`. */
export const LEFT_SIDEBAR_AFTER_COLLAPSE = "pt-0.5";
/** After an expanded project's last session, before the next project. */
export const LEFT_SIDEBAR_AFTER_EXPAND = "pt-2";
/** Section label row — same inset as `LEFT_SIDEBAR_ROW`; extra top pad groups the block. */
export const LEFT_SIDEBAR_SECTION_HEADER = "flex items-center justify-between px-2 pt-2 pb-1.5";
/** Caption size — smaller than a row so Pinned / Workbench / Settings groups stay quiet. */
export const LEFT_SIDEBAR_SECTION_LABEL =
  "text-[length:var(--font-hint)] font-medium uppercase tracking-wider text-muted-foreground/50";
/** Filter / add — caption-sized; fill on hover and while the menu is open. */
export const LEFT_SIDEBAR_SECTION_ACTION =
  "flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground/50 transition-[color] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground";
export const LEFT_SIDEBAR_SECTION_ACTION_ICON = "size-3";
/** Footer icon cluster (Settings, Archived, …) — no divider, left-aligned. */
export const LEFT_SIDEBAR_FOOTER_ICON =
  "flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground";

/** Quiet “Default” mark — sits beside the project name, not at the row end. */
export function DefaultProjectBadge({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "shrink-0 text-[length:var(--font-hint)] text-muted-foreground/50",
        className,
      )}
    >
      {t("nav.workbench.defaultBadge")}
    </span>
  );
}

/** Workbench project mark — closed folder, open when the project is expanded. */
export function WorkbenchFolderGlyph({
  open = false,
  muted,
}: {
  open?: boolean;
  muted?: boolean;
}) {
  const Icon = open ? FolderOpen : Folder;
  return (
    <Icon
      className={cn("size-3.5 shrink-0", muted && "opacity-45")}
      aria-hidden
    />
  );
}

/** Height reveal for Pinned / project folders — keeps children mounted so close animates. */
export function LeftSidebarReveal({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows] duration-200 ease-out",
        open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
      )}
    >
      <div className={cn("min-h-0 overflow-hidden", LEFT_SIDEBAR_STACK)}>
        {children}
      </div>
    </div>
  );
}

/** 左侧栏导航按钮（由 leftNavRegistry 提供数据，一般无需修改本文件） */
export function LeftNavButton({ item, onPressed }: LeftNavButtonProps) {
  const { t } = useTranslation();
  const Icon = item.icon;
  const active = item.isActive();
  const label = item.labelKey ? t(item.labelKey) : item.label;

  return (
    <button
      type="button"
      className={cn(
        "group",
        LEFT_SIDEBAR_ROW,
        active ? LEFT_SIDEBAR_ROW_ACTIVE : LEFT_SIDEBAR_ROW_HOVER,
      )}
      onClick={() => {
        pressLeftNav(item.id);
        onPressed?.();
      }}
    >
      <Icon
        className={cn(
          "size-3.5 shrink-0",
          active ? "text-primary" : "text-muted-foreground",
        )}
      />
      <span className="flex-1 text-left">{label}</span>
      {item.shortcutId ? (
        <ShortcutKbdChips id={item.shortcutId} className={SHORTCUT_CHIPS_HOVER_REVEAL} />
      ) : null}
      {item.trailing ? (
        <span className={SHORTCUT_CHIPS_HOVER_REVEAL}>{item.trailing}</span>
      ) : null}
    </button>
  );
}

export type LeftNavButtonBarProps = {
  items: LeftNavDefinition[];
  onPressed?: () => void;
};

export function LeftNavButtonBar({ items, onPressed }: LeftNavButtonBarProps) {
  return (
    <>
      {items.map((item) => (
        <LeftNavButton key={item.id} item={item} onPressed={onPressed} />
      ))}
    </>
  );
}

/** Icon-only footer control — label + shortcut live in the Hint, not a kbd on the row. */
export function LeftNavIconButton({ item, onPressed }: LeftNavButtonProps) {
  const { t } = useTranslation();
  const Icon = item.icon;
  const active = item.isActive();
  const label = item.labelKey ? t(item.labelKey) : item.label;

  return (
    <Hint label={label} shortcutId={item.shortcutId} side="top">
      <button
        type="button"
        aria-label={label}
        className={cn(
          LEFT_SIDEBAR_FOOTER_ICON,
          active ? LEFT_SIDEBAR_ROW_ACTIVE : LEFT_SIDEBAR_ROW_HOVER,
        )}
        onClick={() => {
          pressLeftNav(item.id);
          onPressed?.();
        }}
      >
        <Icon
          className={cn(
            "size-3.5 shrink-0",
            active ? "text-primary" : "text-muted-foreground",
          )}
        />
      </button>
    </Hint>
  );
}

