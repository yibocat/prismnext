import { useCallback, type DragEvent } from "react";
import { useTranslation } from "react-i18next";
import { GripVertical } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/stores/settings-store";
import { useVerticalListReorder } from "@/lib/workspace/vertical-list-reorder";
import {
  deactivateHiddenLeftNav,
  isLeftNavRequired,
  leftNavRegistry,
  moveLeftNavOrder,
  optionalPrimaryNavItems,
  requiredPrimaryNavIds,
  sanitizeLeftNavPrefs,
  toggleLeftNavHidden,
  type LeftNavDefinition,
} from "@/lib/workspace/left-nav";

const LIST_SHELL = "relative rounded-lg border border-border divide-y divide-border";

interface CustomizeSidebarDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CustomizeSidebarDialog({
  open,
  onOpenChange,
}: CustomizeSidebarDialogProps) {
  const { t } = useTranslation();
  const hiddenIds = useSettingsStore((s) => s.settings.leftNavHiddenIds);
  const order = useSettingsStore((s) => s.settings.leftNavOrder);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const primary = leftNavRegistry.getBySection("primary");
  const prefs = sanitizeLeftNavPrefs({ hiddenIds, order }, primary);
  const requiredItems = primary.filter(isLeftNavRequired).sort((a, b) => a.order - b.order);
  const optionalItems = optionalPrimaryNavItems(primary, prefs);
  const requiredIds = requiredPrimaryNavIds(primary);
  const hidden = new Set(prefs.hiddenIds);
  const optionalIds = optionalItems.map((item) => item.id);

  const persist = (nextHidden: string[], nextOrder: string[]) => {
    const sanitized = sanitizeLeftNavPrefs(
      { hiddenIds: nextHidden, order: nextOrder },
      primary,
    );
    void updateSettings({
      leftNavHiddenIds: sanitized.hiddenIds,
      leftNavOrder: sanitized.order,
    });
    deactivateHiddenLeftNav(sanitized.hiddenIds);
  };

  const toggle = (id: string) => {
    persist(toggleLeftNavHidden(prefs.hiddenIds, id, requiredIds), prefs.order);
  };

  const reorderOptional = useCallback(
    (from: number, to: number) => {
      persist(prefs.hiddenIds, [...requiredIds, ...moveLeftNavOrder(optionalIds, from, to)]);
    },
    [optionalIds, prefs.hiddenIds, requiredIds],
  );

  const reorder = useVerticalListReorder(
    optionalItems.length,
    optionalItems.length > 1,
    reorderOptional,
  );

  const labelOf = (item: LeftNavDefinition) =>
    item.labelKey ? t(item.labelKey) : item.label;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm gap-4 sm:rounded-xl" aria-describedby="customize-sidebar-desc">
        <DialogHeader className="gap-1.5 pr-8">
          <DialogTitle>{t("nav.customizeSidebar.title")}</DialogTitle>
          <DialogDescription id="customize-sidebar-desc">
            {t("nav.customizeSidebar.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className={LIST_SHELL}>
            {requiredItems.map((item) => (
              <CustomizeNavRow
                key={item.id}
                item={item}
                label={labelOf(item)}
                checked
                locked
              />
            ))}
          </div>
          <div
            ref={reorder.listRef}
            className={LIST_SHELL}
            {...reorder.listProps}
          >
            {optionalItems.map((item, index) => {
              const row = reorder.itemProps(index);
              const dragging = reorder.draggingIndex === index;
              return (
                <div key={item.id} ref={row.ref}>
                  <CustomizeNavRow
                    item={item}
                    label={labelOf(item)}
                    checked={!hidden.has(item.id)}
                    dragging={dragging}
                    dragHandleProps={row.dragHandleProps}
                    onCheckedChange={() => {
                      if (reorder.consumeSkipClick()) return;
                      toggle(item.id);
                    }}
                  />
                </div>
              );
            })}
            {reorder.indicatorTop != null ? (
              <div
                aria-hidden
                className="pointer-events-none absolute right-2 left-2 z-10 h-0.5 rounded-full bg-primary"
                style={{ top: reorder.indicatorTop }}
              />
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CustomizeNavRow({
  item,
  label,
  checked,
  locked,
  dragging,
  dragHandleProps,
  onCheckedChange,
}: {
  item: LeftNavDefinition;
  label: string;
  checked: boolean;
  locked?: boolean;
  dragging?: boolean;
  dragHandleProps?: {
    draggable: boolean;
    onDragStart: (event: DragEvent) => void;
  };
  onCheckedChange?: () => void;
}) {
  const Icon = item.icon;
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2 text-[length:var(--font-session-item)] select-none",
        !locked && "cursor-grab",
        dragging && "cursor-grabbing opacity-50",
      )}
      {...(locked ? undefined : dragHandleProps)}
    >
      <Checkbox
        data-list-drag-ignore
        checked={checked}
        disabled={locked}
        onCheckedChange={() => onCheckedChange?.()}
        aria-label={label}
      />
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-foreground">{label}</span>
      {locked ? null : (
        <span className="flex size-6 shrink-0 items-center justify-center text-muted-foreground">
          <GripVertical className="size-3.5" />
        </span>
      )}
    </div>
  );
}
