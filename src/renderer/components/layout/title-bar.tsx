import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import {
  PanelLeftIcon,
  SearchIcon,
  PanelRightIcon,
  ZapIcon,
  GitBranchIcon,
  SunIcon,
  MoonIcon,
  MonitorIcon,
  FolderOpenIcon,
  ChevronDownIcon,
  EllipsisIcon,
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

export function TitleBar() {
  const { platform, isMaximized, isFullscreen } = useWindowState();
  const { theme, resolvedTheme, setTheme } = useTheme();

  const cycleTheme = () => {
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  };

  const isMac = platform === "darwin";
  // On macOS, hide traffic-light spacer when fullscreen or maximized
  const showMacSpacer = isMac && !isFullscreen && !isMaximized;

  return (
    <div className="drag-region relative flex h-[38px] shrink-0 items-center border-b border-border bg-card px-2.5 select-none">
      {/* ── Left: Traffic lights spacer (macOS) + Project + Sidebar toggle ── */}
      <div className="z-10 flex items-center gap-1">
        {/* macOS traffic lights spacer — hidden when fullscreen */}
        {showMacSpacer && <div className="w-[60px]" />}

        {/* Project name button */}
        <button
          type="button"
          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-foreground hover:bg-muted transition-colors"
          title="Open or switch project"
        >
          <FolderOpenIcon className="size-3.5 text-muted-foreground" />
          <span className="max-w-[140px] truncate">No Project Open</span>
          <ChevronDownIcon className="size-3 text-muted-foreground" />
        </button>

        <div className="mx-1 h-5 w-px bg-border/60" />

        <button
          type="button"
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="Toggle Sidebar"
        >
          <PanelLeftIcon className="size-4" />
        </button>
      </div>

      {/* ── Center: ⌘K command entry (absolutely centered) ── */}
      <div className="pointer-events-none absolute inset-x-0 flex justify-center">
        <button
          type="button"
          className="pointer-events-auto flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground hover:border-ring hover:text-foreground transition-colors"
        >
          <SearchIcon className="size-3" />
          <span className="hidden sm:inline">Search or type command...</span>
          <kbd className="ml-auto hidden rounded border border-border px-1 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Spacer pushes right group to the end */}
      <div className="flex-1" />

      {/* ── Right: Window controls spacer (Win/Linux) + Actions ── */}
      <div className="z-10 flex items-center gap-1">
        {/* Windows/Linux: window control buttons */}
        {!isMac && (
          <>
            <button
              type="button"
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title="Minimize"
              onClick={() => window.electronAPI?.windowMinimize()}
            >
              <Minimize2Icon className="size-4" />
            </button>
            <button
              type="button"
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title={isMaximized ? "Restore" : "Maximize"}
              onClick={() => window.electronAPI?.windowMaximize()}
            >
              <Maximize2Icon className="size-4" />
            </button>
            <button
              type="button"
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-red-500 hover:text-white transition-colors"
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
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="Toggle Right Split"
        >
          <PanelRightIcon className="size-4" />
        </button>

        <div className="mx-1 h-5 w-px bg-border/60" />

        {/* Compile — green=success, yellow=compiling, red=error, gray=idle */}
        <button
          type="button"
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="Compile"
        >
          <ZapIcon className="size-4" />
        </button>

        <button
          type="button"
          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <GitBranchIcon className="size-3.5" />
          <span>main</span>
        </button>

        {/* Theme toggle — cycles: light → dark → system */}
        <button
          type="button"
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title={`Theme: ${theme}`}
          onClick={cycleTheme}
        >
          {theme === "system" ? (
            <MonitorIcon className="size-4" />
          ) : resolvedTheme === "dark" ? (
            <SunIcon className="size-4" />
          ) : (
            <MoonIcon className="size-4" />
          )}
        </button>

        <button
          type="button"
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="More"
        >
          <EllipsisIcon className="size-4" />
        </button>
      </div>
    </div>
  );
}
