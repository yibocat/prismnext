/**
 * RightArea「+」add menu — open or focus a mode as tab(s).
 * Singleton modes disappear from the menu once open; multi (Terminal/Browser) stay and spawn new tabs.
 */
import { useCallback, useMemo, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { PlusIcon } from "lucide-react";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { Hint } from "@/components/ui/hint";
import {
  AppMenu,
  AppMenuContent,
  AppMenuItem,
  AppMenuTrigger,
} from "@/components/ui/app-menu";
import { modeRegistry } from "@/lib/workspace/mode-registry";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { openMode } from "@/lib/workspace/open-right-area-mode";
import { openRightArea } from "@/lib/workspace/right-area-layout";

export function RightAreaAddMenu({
  surface,
  centerRef,
  rightAreaRef,
  leftSidebarRef,
  isMobile,
}: {
  surface: "workspace" | "settings";
  centerRef: RefObject<PanelImperativeHandle | null>;
  rightAreaRef: RefObject<PanelImperativeHandle | null>;
  leftSidebarRef: RefObject<PanelImperativeHandle | null>;
  isMobile: boolean;
}) {
  const { t } = useTranslation();
  const openKindsKey = useRightPanelStore((s) =>
    s.tabs.map((tab) => tab.kind).sort().join("\0"),
  );

  const modes = useMemo(() => {
    const kinds = openKindsKey ? openKindsKey.split("\0") : [];
    return modeRegistry.getVisibleAddMenuModes(surface, kinds);
  }, [surface, openKindsKey]);

  const modeLabel = useCallback(
    (mode: { label: string; labelKey?: string }) =>
      mode.labelKey ? t(mode.labelKey) : mode.label,
    [t],
  );

  const onPick = useCallback(
    (modeId: string) => {
      openRightArea({
        centerRef: centerRef.current,
        rightAreaRef: rightAreaRef.current,
        leftSidebarRef: leftSidebarRef.current,
        isMobile,
      });
      openMode(modeId);
    },
    [centerRef, rightAreaRef, leftSidebarRef, isMobile],
  );

  if (modes.length === 0) return null;

  return (
    <AppMenu>
      <Hint label={t("shell.rightArea.addMode", { defaultValue: "Add panel" })}>
        <AppMenuTrigger asChild>
          <button
            type="button"
            className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            aria-label={t("shell.rightArea.addMode", { defaultValue: "Add panel" })}
          >
            <PlusIcon className="size-3.5" />
          </button>
        </AppMenuTrigger>
      </Hint>
      <AppMenuContent align="start" className="min-w-[10rem]">
        {modes.map((mode) => (
          <AppMenuItem
            key={mode.id}
            leading={<span className="[&>svg]:size-3.5 shrink-0">{mode.icon}</span>}
            onClick={() => onPick(mode.id)}
          >
            {modeLabel(mode)}
          </AppMenuItem>
        ))}
      </AppMenuContent>
    </AppMenu>
  );
}
