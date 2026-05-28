import { useState, useEffect, type RefObject } from "react";
import { useTheme } from "next-themes";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLayoutStore } from "@/stores/layout-store";
import { SIDEBAR_LEFT_DEFAULT, SIDEBAR_OVERLAY_THRESHOLD } from "@/styles/constants";
import { cn } from "@/lib/utils";
import { Kbd } from "@/components/ui/kbd";
import { CommandPalette } from "@/components/modules/shared";
import {
  PanelLeft,
  PanelRight,
  SearchIcon,
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

interface TitleBarProps {
  leftSidebarRef: RefObject<PanelImperativeHandle | null>;
  centerRef: RefObject<PanelImperativeHandle | null>;
  rightAreaRef: RefObject<PanelImperativeHandle | null>;
}

export function TitleBar({ leftSidebarRef, centerRef, rightAreaRef }: TitleBarProps) {
  const { platform, isMaximized, isFullscreen } = useWindowState();
  const isMobile = useIsMobile();
  const sidebarExpanded = useLayoutStore((s) => s.sidebarExpanded);
  const rightAreaExpanded = useLayoutStore((s) => s.rightAreaExpanded);
  const [commandOpen, setCommandOpen] = useState(false);
  const { theme, resolvedTheme, setTheme } = useTheme();

  const cycleTheme = () => {
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  };

  const isMac = platform === "darwin";
  const showMacSpacer = isMac && !isFullscreen && !isMaximized;

  return (
    <>
    <div className="drag-region relative flex h-[var(--height-titlebar)] shrink-0 items-center px-2.5 select-none">
      {/* ── Left: Traffic lights spacer + Project + Sidebar toggle ── */}
      <div className="z-10 flex items-center gap-1">
        {showMacSpacer && <div className="w-[60px]" />}

        <button
          type="button"
          className={cn(
            "flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
            sidebarExpanded && "bg-muted text-foreground",
          )}
          title={sidebarExpanded ? "Collapse Sidebar" : "Expand Sidebar"}
          onClick={() => {
            const st = useLayoutStore.getState();
            if (st.leftSidebarOverlay) {
              st.setLeftSidebarOverlay(false);
              return;
            }
            const p = leftSidebarRef.current;
            if (!p) return;
            if (p.isCollapsed()) {
              if (window.innerWidth < SIDEBAR_OVERLAY_THRESHOLD) {
                st.setLeftSidebarOverlay(true);
              } else {
                p.resize(st.sidebarWidth || SIDEBAR_LEFT_DEFAULT);
                if (p.isCollapsed()) st.setLeftSidebarOverlay(true);
              }
            } else {
              p.collapse();
            }
          }}
        >
          <PanelLeft className="size-3.5" />
        </button>

        <button
          type="button"
          className="flex items-center gap-1.5 rounded px-1.5 py-1 text-[length:var(--font-toolbar-label)] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="Command palette"
          onClick={() => setCommandOpen(true)}
        >
          <SearchIcon className="size-3.5" />
          <Kbd className="text-[10px] h-4 min-w-4 px-0.5 bg-transparent">⌘K</Kbd>
        </button>

      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* ── Right: Window controls (Win/Linux) + Actions ── */}
      <div className="z-10 flex items-center gap-1">
        {!isMac && (
          <>
            <button
              type="button"
              className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title="Minimize"
              onClick={() => window.electronAPI?.windowMinimize()}
            >
              <Minimize2Icon className="size-4" />
            </button>
            <button
              type="button"
              className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title={isMaximized ? "Restore" : "Maximize"}
              onClick={() => window.electronAPI?.windowMaximize()}
            >
              <Maximize2Icon className="size-4" />
            </button>
            <button
              type="button"
              className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-red-500 hover:text-white transition-colors"
              title="Close"
              onClick={() => window.electronAPI?.windowClose()}
            >
              <XIcon className="size-4" />
            </button>

            <div className="mx-1 h-5 w-px bg-border/60" />
          </>
        )}

        <button
          type="button"
          className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
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
            "flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
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
    </div>
    <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
  </>
  );
}
