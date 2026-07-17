import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";
import type { PanelImperativeHandle } from "react-resizable-panels";
import type { RefObject } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLayoutStore } from "@/stores/layout-store";
import { cn } from "@/lib/utils";
import { openRightArea, closeRightArea } from "@/lib/workspace/right-area-layout";
import { Hint } from "@/components/ui/hint";
import {
  PanelRight,
  SunIcon,
  MoonIcon,
  MonitorIcon,
  Minimize2Icon,
  Maximize2Icon,
  XIcon,
} from "lucide-react";

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

interface MainToolbarProps {
  rightAreaRef: RefObject<PanelImperativeHandle | null>;
  centerRef: RefObject<PanelImperativeHandle | null>;
}

export function MainToolbar({ rightAreaRef, centerRef }: MainToolbarProps) {
  const { t } = useTranslation();
  const { platform, isMaximized } = useWindowState();
  const isMobile = useIsMobile();
  const rightAreaExpanded = useLayoutStore((s) => s.rightAreaExpanded);
  const { theme, resolvedTheme, setTheme } = useTheme();

  const cycleTheme = () => {
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  };

  const isMac = platform === "darwin";

  return (
    <div className="drag-region flex h-[var(--height-titlebar)] shrink-0 items-center justify-end gap-1 px-2" data-surface="content">
      {!isMac && (
        <>
          <Hint label={t("shell.minimize")}>
            <button
              type="button"
              className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              onClick={() => window.electronAPI?.windowMinimize()}
            >
              <Minimize2Icon className="size-4" />
            </button>
          </Hint>
          <Hint label={isMaximized ? t("shell.restore") : t("shell.maximize")}>
            <button
              type="button"
              className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              onClick={() => window.electronAPI?.windowMaximize()}
            >
              <Maximize2Icon className="size-4" />
            </button>
          </Hint>
          <Hint label={t("shell.close")}>
            <button
              type="button"
              className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive hover:text-white transition-colors"
              onClick={() => window.electronAPI?.windowClose()}
            >
              <XIcon className="size-4" />
            </button>
          </Hint>
          <div className="mx-1 h-4 w-px bg-border" />
        </>
      )}

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
    </div>
  );
}
