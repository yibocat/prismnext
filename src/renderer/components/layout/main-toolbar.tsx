import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import type { PanelImperativeHandle } from "react-resizable-panels";
import type { RefObject } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLayoutStore } from "@/stores/layout-store";
import { cn } from "@/lib/utils";
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
  const { platform, isMaximized, isFullscreen } = useWindowState();
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
          <button
            type="button"
            className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            title="Minimize"
            onClick={() => window.electronAPI?.windowMinimize()}
          >
            <Minimize2Icon className="size-4" />
          </button>
          <button
            type="button"
            className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            title={isMaximized ? "Restore" : "Maximize"}
            onClick={() => window.electronAPI?.windowMaximize()}
          >
            <Maximize2Icon className="size-4" />
          </button>
          <button
            type="button"
            className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive hover:text-white transition-colors"
            title="Close"
            onClick={() => window.electronAPI?.windowClose()}
          >
            <XIcon className="size-4" />
          </button>
          <div className="mx-1 h-4 w-px bg-border/60" />
        </>
      )}

      <button
        type="button"
        className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        title={`Theme: ${theme}`}
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

      <button
        type="button"
        className={cn(
          "flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors",
          rightAreaExpanded && "bg-muted text-foreground",
        )}
        title={rightAreaExpanded ? "Collapse Right Area" : "Expand Right Area"}
        onClick={() => {
          const r = rightAreaRef.current;
          const c = centerRef.current;
          if (!r || !c) return;
          if (r.isCollapsed()) {
            if (isMobile) {
              r.resize(9999);
              c.collapse();
            } else {
              if (c.isCollapsed()) c.expand();
              r.resize(useLayoutStore.getState().rightAreaWidth);
            }
          } else {
            r.collapse();
            c.resize(9999);
          }
        }}
      >
        <PanelRight className="size-3.5" />
      </button>
    </div>
  );
}
