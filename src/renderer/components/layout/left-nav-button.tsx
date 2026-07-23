import type { RefObject } from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { pressLeftNav, type LeftNavDefinition, type LeftNavPanelRefs } from "@/lib/workspace/left-nav";

type LeftNavButtonProps = {
  item: LeftNavDefinition;
  panelRefs: LeftNavPanelRefs;
  onPressed?: () => void;
};

/** 左侧栏导航按钮（由 leftNavRegistry 提供数据，一般无需修改本文件） */
export function LeftNavButton({ item, panelRefs, onPressed }: LeftNavButtonProps) {
  const { t } = useTranslation();
  const Icon = item.icon;
  const active = item.isActive();
  const label = item.labelKey ? t(item.labelKey) : item.label;

  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[length:var(--font-session-item)] transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
          : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      )}
      onClick={() => {
        pressLeftNav(item.id, { panelRefs });
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
      {item.trailing}
    </button>
  );
}

export type LeftNavButtonBarProps = {
  items: LeftNavDefinition[];
  panelRefs: LeftNavPanelRefs;
  onPressed?: () => void;
};

export function LeftNavButtonBar({ items, panelRefs, onPressed }: LeftNavButtonBarProps) {
  return (
    <>
      {items.map((item) => (
        <LeftNavButton key={item.id} item={item} panelRefs={panelRefs} onPressed={onPressed} />
      ))}
    </>
  );
}

export type LeftNavPanelRefProps = {
  centerRef?: RefObject<PanelImperativeHandle | null>;
  rightAreaRef?: RefObject<PanelImperativeHandle | null>;
};

export function leftNavPanelRefs({
  centerRef,
  rightAreaRef,
}: LeftNavPanelRefProps): LeftNavPanelRefs {
  return { centerRef, rightAreaRef };
}
