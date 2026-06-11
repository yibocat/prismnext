import { createPortal } from "react-dom";
import type { RefObject } from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { useLayoutStore } from "@/stores/layout-store";
import { useDocumentStore } from "@/stores/document-store";
import { useSettingsStore } from "@/stores/settings-store";
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
  KeyboardIcon,
  FileTextIcon,
  FolderOpenIcon,
  HistoryIcon,
  XIcon,
  SunIcon,
  MoonIcon,
  MonitorIcon,
  LockIcon,
  Bot,
} from "lucide-react";

const SECTIONS = [
  {
    label: "App",
    items: [
      { id: "general", label: "General", icon: Settings2Icon },
      { id: "appearance", label: "Appearance", icon: PaletteIcon },
      { id: "agent-app", label: "Agent", icon: Bot },
      { id: "project", label: "Projects", icon: FolderOpenIcon },
      { id: "shortcuts", label: "Shortcuts", icon: KeyboardIcon },
    ],
  },
  {
    label: "Project",
    items: [
      { id: "compiler", label: "Compiler", icon: WrenchIcon },
      { id: "external", label: "AI & APIs", icon: GlobeIcon },
      { id: "agent-project", label: "Agent", icon: Bot },
      { id: "backups", label: "Backups", icon: HistoryIcon },
      { id: "logs", label: "Logs", icon: FileTextIcon },
    ],
  },
] as const;

export type SettingsCategory = "general" | "appearance" | "shortcuts" | "project" | "compiler" | "external" | "logs" | "backups" | "agent-app" | "agent-project";

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
  const glassEffect = useSettingsStore((s) => s.settings.glassEffect);

  const cycleTheme = () => {
    if (glassEffect) return;
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  };

  const sidebarFullyCollapsed = useLayoutStore((s) => s.sidebarFullyCollapsed);
  const leftSidebarOverlay = useLayoutStore((s) => s.leftSidebarOverlay);
  const setLeftSidebarOverlay = useLayoutStore((s) => s.setLeftSidebarOverlay);
  const projectRoot = useDocumentStore((s) => s.projectRoot);

  const sidebarContent = (
    <SidebarProvider
      defaultOpen
      className="contents"
    >
      <Sidebar collapsible="none" className="relative shrink-0 border-r-0 !w-full">
        <div className="drag-region flex h-[var(--height-titlebar)] shrink-0 items-center px-2 select-none">
          {!sidebarFullyCollapsed && (
            <SidebarControls leftSidebarRef={leftSidebarRef!} showMacSpacer={showMacSpacer} showNewAgent={false} />
          )}
        </div>
        {/* ── Fixed: project switcher ── */}
        <div className="shrink-0 px-2 flex flex-col gap-1 mb-1.5">
          <div>
            <ProjectSwitcher className="flex w-full items-center gap-2 rounded-md border border-border px-2 py-1.5 text-[length:var(--font-session-item)] font-medium hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors" />
          </div>
        </div>

        {/* ── Scrollable settings categories ── */}
        <div className="flex min-h-0 flex-1 flex-col overflow-auto px-2 pb-1">
          {SECTIONS.filter((s) => s.label !== "Project" || projectRoot).map((section, si, arr) => (
            <div key={section.label}>
              <p className="pt-2 pb-1 text-[length:var(--font-hint)] font-medium uppercase tracking-wider text-muted-foreground/50">
                {section.label}
              </p>
              <div className="flex flex-col gap-1">
              {section.items.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[length:var(--font-session-item)] text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                  onClick={() => onSelectCategory(cat.id as SettingsCategory)}
                >
                  <cat.icon className="size-3.5 shrink-0" />
                  <span>{cat.label}</span>
                </button>
              ))}
              </div>
              {si < arr.length - 1 && <div className="h-2" />}
            </div>
          ))}
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
              className={cn(
                "flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors shrink-0",
                glassEffect && "text-muted-foreground/30",
              )}
              title={glassEffect ? "Theme locked (Desktop glass is on)" : `Theme: ${theme}`}
              onClick={cycleTheme}
            >
              {glassEffect ? (
                <LockIcon className="size-3.5" />
              ) : theme === "system" ? (
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
          <div className="fixed top-[var(--height-titlebar)] right-0 bottom-0 left-0 z-50 flex flex-col glass-content">
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
