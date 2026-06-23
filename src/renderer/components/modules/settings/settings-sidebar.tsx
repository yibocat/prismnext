import { createPortal } from "react-dom";
import type { RefObject } from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { useLayoutStore } from "@/stores/layout-store";
import { useDocumentStore } from "@/stores/document-store";
import { useWindowState } from "@/hooks/use-window-state";
import {
  SidebarProvider,
  Sidebar,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { ProjectSwitcher } from "@/components/modules/shared";
import { SidebarControls } from "@/components/layout/sidebar-controls";
import {
  ArrowLeftIcon,
  Settings2Icon,
  PaletteIcon,
  WrenchIcon,
  GlobeIcon,
  TerminalIcon,
  KeyboardIcon,
  FileTextIcon,
  HistoryIcon,
  LayoutGridIcon,
  XIcon,
  SunIcon,
  MoonIcon,
  MonitorIcon,
  Bot,
  BookOpenIcon,
  PuzzleIcon,
  PlugIcon,
  SlashIcon,
} from "lucide-react";

const SECTIONS: Array<{ id: string; label: string; icon: typeof Settings2Icon; groupEnd?: boolean }> = [
  { id: "general", label: "General", icon: Settings2Icon },
  { id: "appearance", label: "Appearance", icon: PaletteIcon },
  { id: "shortcuts", label: "Shortcuts", icon: KeyboardIcon },
  { id: "models", label: "Models", icon: GlobeIcon, groupEnd: true },
  { id: "agent", label: "Agent", icon: Bot },
  { id: "prompts-rules", label: "Prompts & Rules", icon: FileTextIcon },
  { id: "commands", label: "Commands", icon: SlashIcon },
  { id: "tools-mcp", label: "MCP", icon: PlugIcon },
  { id: "skills", label: "Skills", icon: PuzzleIcon, groupEnd: true },
  { id: "compiler", label: "Compiler", icon: WrenchIcon },
  { id: "terminal", label: "Terminal", icon: TerminalIcon },
  { id: "workspace", label: "Workspace", icon: LayoutGridIcon },
  { id: "zotero", label: "Zotero", icon: BookOpenIcon },
  { id: "backups", label: "Backups", icon: HistoryIcon },
  { id: "logs", label: "Logs", icon: FileTextIcon },
] as const;

export type SettingsCategory = (typeof SECTIONS)[number]["id"];

interface SettingsSidebarProps {
  activeCategory: SettingsCategory;
  onSelectCategory: (id: SettingsCategory) => void;
  leftSidebarRef?: RefObject<PanelImperativeHandle | null>;
}

export function SettingsSidebar({ activeCategory, onSelectCategory, leftSidebarRef }: SettingsSidebarProps) {
  const { platform, isFullscreen } = useWindowState();
  const isMac = platform === "darwin";
  const showMacSpacer = isMac && !isFullscreen;
  const { theme, resolvedTheme, setTheme } = useTheme();

  const cycleTheme = () => {
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  };

  const sidebarFullyCollapsed = useLayoutStore((s) => s.sidebarFullyCollapsed);
  const leftSidebarOverlay = useLayoutStore((s) => s.leftSidebarOverlay);
  const setLeftSidebarOverlay = useLayoutStore((s) => s.setLeftSidebarOverlay);
  const projectRoot = useDocumentStore((s) => s.projectRoot);

  const sidebarContent = (
    <SidebarProvider defaultOpen className="contents">
      <Sidebar collapsible="none" className="relative shrink-0 border-r-0 !w-full" data-surface="sidebar">
        <div className="drag-region flex h-[var(--height-titlebar)] shrink-0 items-center px-2 select-none">
          {!sidebarFullyCollapsed && (
            <SidebarControls leftSidebarRef={leftSidebarRef!} showMacSpacer={showMacSpacer} showNewAgent={false} />
          )}
        </div>

        {/* Project switcher — presence depends on open project, not a separate section */}
        {projectRoot && (
          <div className="shrink-0 px-2 flex flex-col gap-1 mb-1.5">
            <div>
              <ProjectSwitcher className="flex w-full items-center gap-2 rounded-md border border-border px-2 py-1.5 text-[length:var(--font-session-item)] font-medium hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors" />
            </div>
          </div>
        )}

        {/* Flat settings list */}
        <div className="flex min-h-0 flex-1 flex-col overflow-auto px-2 pb-1 pt-1">
          <div className="flex flex-col gap-1">
            {SECTIONS.map((cat, i, arr) => (
              <button
                key={cat.id}
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[length:var(--font-session-item)] transition-colors",
                  cat.groupEnd && i < arr.length - 1 && "mb-3",
                  activeCategory === cat.id
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
                onClick={() => onSelectCategory(cat.id)}
              >
                <cat.icon className="size-3.5 shrink-0" />
                <span>{cat.label}</span>
              </button>
            ))}
          </div>
        </div>

        <SidebarFooter className="px-2 pb-2">
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              className="flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-[length:var(--font-session-item)] text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
              onClick={() => {
                if (!projectRoot) {
                  useDocumentStore.getState().setShowWelcome(true);
                }
                useLayoutStore.getState().setLeftSidebarView("sessions");
                setLeftSidebarOverlay(false);
              }}
            >
              <ArrowLeftIcon className="size-3.5 shrink-0" />
              <span>Back</span>
            </button>
            <button
              type="button"
              className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors shrink-0"
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
          </div>
        </SidebarFooter>
      </Sidebar>
    </SidebarProvider>
  );

  return (
    <>
      {leftSidebarOverlay &&
        createPortal(
          <div className="fixed top-[var(--height-titlebar)] right-0 bottom-0 left-0 z-50 flex flex-col" data-surface="content">
            <div className="flex-1 min-h-0">{sidebarContent}</div>
            <button
              type="button"
              className="absolute top-2 right-2 flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              onClick={() => setLeftSidebarOverlay(false)}
            >
              <XIcon className="size-3.5" />
            </button>
          </div>,
          document.body,
        )}
      {sidebarContent}
    </>
  );
}
