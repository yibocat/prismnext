import { useState, useEffect, type RefObject } from "react";
import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLayoutStore } from "@/stores/layout-store";
import { openRightArea, closeRightArea } from "@/lib/workspace/right-area-layout";
import { toggleLeftSidebarPanel } from "@/lib/workspace/left-sidebar-panel";
import { cn } from "@/lib/utils";
import { Hint } from "@/components/ui/hint";
import { Kbd } from "@/components/ui/kbd";
import { shortcutChordLabel } from "@/lib/shortcuts";
import {
  PanelLeft,
  PanelRight,
  SearchIcon,
  SunIcon,
  MoonIcon,
  MonitorIcon,
} from "lucide-react";
import { WindowControls } from "@/components/layout/window-controls";

function useWindowState() {
  const platform = window.electronAPI?.platform ?? "darwin";
  const [isMaximized, setIsMaximized] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    window.electronAPI?.windowIsMaximized().then(setIsMaximized);
    window.electronAPI?.windowIsFullscreen().then(setIsFullscreen);

    return window.electronAPI?.onWindowStateChange((state) => {
      setIsMaximized(state.isMaximized);
      setIsFullscreen(state.isFullscreen);
    });
  }, []);

  return { platform, isMaximized, isFullscreen } as const;
}

interface TitleBarProps {
  leftSidebarRef: RefObject<PanelImperativeHandle | null>;
  centerRef: RefObject<PanelImperativeHandle | null>;
  rightAreaRef: RefObject<PanelImperativeHandle | null>;
}

export function TitleBar({ leftSidebarRef, centerRef, rightAreaRef }: TitleBarProps) {
  const { t } = useTranslation();
  const { platform, isMaximized, isFullscreen } = useWindowState();
  const isMobile = useIsMobile();
  const sidebarExpanded = useLayoutStore((s) => s.sidebarExpanded);
  const rightAreaExpanded = useLayoutStore((s) => s.rightAreaExpanded);
  const leftSidebarView = useLayoutStore((s) => s.leftSidebarView);
  const inSettings = leftSidebarView === "settings";
  const setCommandPaletteOpen = useLayoutStore((s) => s.setCommandPaletteOpen);
  const commandChord = shortcutChordLabel("shell.commandPalette");
  const { theme, resolvedTheme, setTheme } = useTheme();

  const cycleTheme = () => {
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  };

  const isMac = platform === "darwin";
  const showMacSpacer = isMac && !isFullscreen && !isMaximized;

  return (
    <div className="drag-region relative flex h-[var(--height-titlebar)] shrink-0 items-center px-2.5 select-none" data-surface="content">
      {/* ── Left: Traffic lights spacer + Project + Sidebar toggle ── */}
      <div className="z-10 flex items-center gap-1">
        {showMacSpacer && <div className="w-[60px]" />}

        <Hint
          label={sidebarExpanded ? t("shell.collapseSidebar") : t("shell.expandSidebar")}
          shortcutId="shell.toggleLeftSidebar"
        >
          <button
            type="button"
            className={cn(
              "flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors",
              sidebarExpanded && "bg-muted text-foreground",
            )}
            onClick={() =>
              toggleLeftSidebarPanel(leftSidebarRef, {
                centerRef,
                rightAreaRef,
                isMobile,
              })
            }
          >
            <PanelLeft className="size-3.5" />
          </button>
        </Hint>

        <Hint shortcutId="shell.commandPalette">
          <button
            type="button"
            className="flex items-center gap-1.5 rounded px-1.5 py-1 text-[length:var(--font-toolbar-label)] text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            onClick={() => setCommandPaletteOpen(true)}
          >
            <SearchIcon className="size-3.5" />
            {commandChord ? (
              <Kbd className="text-[length:var(--font-kbd)] h-4 min-w-4 px-0.5 bg-transparent">{commandChord}</Kbd>
            ) : null}
          </button>
        </Hint>

      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* ── Right: Actions + Window controls (Win/Linux) ── */}
      <div className="z-10 flex items-center gap-1">
        <Hint label={t("common.theme", { theme })}>
          <button
            type="button"
            className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            onClick={cycleTheme}
          >
            {theme === "system" ? (
              <MonitorIcon className="size-3.5" />
            ) : resolvedTheme === "dark" ? (
              <SunIcon className="size-3.5" />
            ) : (
              <MoonIcon className="size-3.5" />
            )}
          </button>
        </Hint>

        {!inSettings && (
        <Hint shortcutId="shell.toggleRightArea">
          <button
            type="button"
            className={cn(
              "flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors",
              rightAreaExpanded && "bg-muted text-foreground",
            )}
            onClick={() => {
              const r = rightAreaRef.current;
              if (!r) return;
              if (r.isCollapsed()) {
                openRightArea({
                  centerRef: centerRef.current,
                  rightAreaRef: r,
                  leftSidebarRef: leftSidebarRef.current,
                  isMobile,
                });
              } else {
                closeRightArea({
                  centerRef: centerRef.current,
                  rightAreaRef: r,
                });
              }
            }}
          >
            <PanelRight className="size-3.5" />
          </button>
        </Hint>
        )}

        {!isMac && <div className="mx-0.5 h-4 w-px bg-border shrink-0" />}

        <WindowControls />
      </div>
    </div>
  );
}
