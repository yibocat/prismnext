import { useState, useEffect, type RefObject } from "react";
import { useTheme } from "next-themes";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { useIsMobile } from "@/hooks/use-mobile";
import { useDocumentStore } from "@/stores/document-store";
import { useProjectStore } from "@/stores/project-store";
import { useProjectOpen } from "@/hooks/use-project-open";
import {
  PanelLeftIcon,
  PanelRightIcon,
  SearchIcon,
  SunIcon,
  MoonIcon,
  MonitorIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  FolderIcon,
  ChevronDownIcon,
  EllipsisIcon,
  Minimize2Icon,
  Maximize2Icon,
  XIcon,
  PlusIcon,
  LogOutIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const openProject = useDocumentStore((s) => s.openProject);
  const recentProjects = useProjectStore((s) => s.recentProjects);
  const addRecentProject = useProjectStore((s) => s.addRecentProject);
  const { theme, resolvedTheme, setTheme } = useTheme();

  const projectName = projectRoot
    ? projectRoot.split(/[/\\]/).pop() || projectRoot
    : "No Project Open";

  const projectOpen = useProjectOpen();

  const saveLastProject = (path: string) => {
    window.electronAPI.settingsSet({ lastProjectPath: path } as any);
  };

  const openProjectPath = async (path: string) => {
    const ok = await projectOpen(path);
    if (!ok) return;
    addRecentProject(path);
    saveLastProject(path);
    await openProject(path);
  };

  const handleOpenProject = async () => {
    const result = await window.electronAPI.dialogOpenFolder();
    if (result.canceled || !result.path) return;
    await openProjectPath(result.path);
  };

  const handleSwitchProject = async (path: string) => {
    if (path === projectRoot) return;
    await openProjectPath(path);
  };

  const handleNewProject = async () => {
    const result = await window.electronAPI.dialogOpenFolder();
    if (result.canceled || !result.path) return;
    try { await window.electronAPI.projectCreate(result.path); } catch {}
    await openProjectPath(result.path);
  };

  const handleCloseProject = async () => {
    await window.electronAPI.settingsSet({ lastProjectPath: null } as any);
    // Reload app to show welcome page
    const docState = useDocumentStore.getState();
    docState.closeProject();
  };

  const cycleTheme = () => {
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  };

  const isMac = platform === "darwin";
  const showMacSpacer = isMac && !isFullscreen && !isMaximized;

  return (
    <div className="drag-region relative flex h-[var(--height-titlebar)] shrink-0 items-center border-b border-border bg-card px-2.5 select-none">
      {/* ── Left: Traffic lights spacer + Project + Sidebar toggle ── */}
      <div className="z-10 flex items-center gap-1">
        {showMacSpacer && <div className="w-[60px]" />}

        <button
          type="button"
          className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="Toggle Sidebar"
          onClick={() => {
            const p = leftSidebarRef.current;
            if (!p) return;
            p.isCollapsed() ? p.expand() : p.collapse();
          }}
        >
          <PanelLeftIcon className="size-4" />
        </button>

        <div className="mx-1 h-5 w-px bg-border/60" />

        {/* Project switcher dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1 rounded px-1.5 py-1 text-[length:var(--font-toolbar-label)] font-medium text-foreground hover:bg-muted transition-colors"
            >
              <FolderOpenIcon className="size-3.5 text-muted-foreground" />
              <span className="max-w-[140px] truncate">{projectName}</span>
              <ChevronDownIcon className="size-3 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            {recentProjects.length > 0 ? (
              recentProjects.map((p) => (
                <DropdownMenuItem
                  key={p.path}
                  className="flex items-center gap-2 text-[length:var(--font-menu-item)]"
                  onClick={() => handleSwitchProject(p.path)}
                >
                  <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">{p.name}</span>
                  <span className="shrink-0 text-[length:var(--font-path)] text-muted-foreground/60 truncate max-w-[120px]">{p.path}</span>
                </DropdownMenuItem>
              ))
            ) : (
              <div className="px-2 py-3 text-[length:var(--font-empty-state)] text-muted-foreground text-center">
                No recent projects
              </div>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="flex items-center gap-2 text-[length:var(--font-menu-item)]"
              onClick={handleNewProject}
            >
              <FolderPlusIcon className="size-3.5 shrink-0" />
              New Project...
            </DropdownMenuItem>
            <DropdownMenuItem
              className="flex items-center gap-2 text-[length:var(--font-menu-item)]"
              onClick={handleOpenProject}
            >
              <FolderOpenIcon className="size-3.5 shrink-0" />
              Open Project...
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          type="button"
          className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="Close project"
          onClick={handleCloseProject}
        >
          <LogOutIcon className="size-3" />
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
          className="flex items-center gap-1.5 rounded px-1.5 py-1 text-[length:var(--font-toolbar-label)] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="Command palette"
        >
          <SearchIcon className="size-3" />
          <kbd className="rounded border border-border px-1 py-0.5 font-mono text-[length:var(--font-kbd)] text-muted-foreground">
            ⌘K
          </kbd>
        </button>

        <button
          type="button"
          className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
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

        <div className="mx-1 h-5 w-px bg-border/60" />

        <button
          type="button"
          className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="More"
        >
          <EllipsisIcon className="size-4" />
        </button>

        <button
          type="button"
          className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="Toggle Right Area"
          onClick={() => {
            const r = rightAreaRef.current;
            const c = centerRef.current;
            if (!r || !c) return;
            if (r.isCollapsed()) {
              if (isMobile) {
                r.expand();
                c.collapse();
              } else {
                if (c.isCollapsed()) c.expand();
                r.expand();
              }
            } else {
              r.collapse();
              c.resize(9999);
            }
          }}
        >
          <PanelRightIcon className="size-4" />
        </button>
      </div>
    </div>
  );
}
