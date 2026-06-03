import { createPortal } from "react-dom";
import type { RefObject } from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { useLayoutStore } from "@/stores/layout-store";
import { useDocumentStore } from "@/stores/document-store";
import { useWindowState } from "@/hooks/use-window-state";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
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
  XIcon,
} from "lucide-react";

const SECTIONS = [
  {
    label: "App",
    items: [
      { id: "general", label: "General", icon: Settings2Icon },
      { id: "appearance", label: "Appearance", icon: PaletteIcon },
      { id: "shortcuts", label: "Shortcuts", icon: KeyboardIcon },
    ],
  },
  {
    label: "Project",
    items: [
      { id: "compiler", label: "Compiler", icon: WrenchIcon },
      { id: "external", label: "AI & APIs", icon: GlobeIcon },
    ],
  },
] as const;

export type SettingsCategory = "general" | "appearance" | "shortcuts" | "compiler" | "external";

interface SettingsSidebarProps {
  activeCategory: SettingsCategory;
  onSelectCategory: (id: SettingsCategory) => void;
  leftSidebarRef?: RefObject<PanelImperativeHandle | null>;
}

export function SettingsSidebar({ activeCategory, onSelectCategory, leftSidebarRef }: SettingsSidebarProps) {
  const { platform, isFullscreen } = useWindowState();
  const isMac = platform === "darwin";
  const showMacSpacer = isMac && !isFullscreen;

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
            <SidebarControls leftSidebarRef={leftSidebarRef!} showMacSpacer={showMacSpacer} />
          )}
        </div>
        <SidebarContent className="px-2 pb-1 gap-0">
          <div className="pt-1.5 mb-1.5">
            <ProjectSwitcher className="flex w-full items-center gap-2 rounded-md border border-border px-2 py-1.5 text-[length:var(--font-session-item)] font-medium hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors" />
          </div>

          <SidebarMenu>
            {SECTIONS.filter((s) => s.label !== "Project" || projectRoot).map((section, si, arr) => (
              <div key={section.label}>
                <p className="px-2 pt-2 pb-1 text-[length:var(--font-hint)] font-medium uppercase tracking-wider text-muted-foreground/50">
                  {section.label}
                </p>
                <div className="flex flex-col gap-1">
                {section.items.map((cat) => (
                  <SidebarMenuItem key={cat.id}>
                    <SidebarMenuButton
                      onClick={() => onSelectCategory(cat.id as SettingsCategory)}
                      isActive={activeCategory === cat.id}
                      size="sm"
                    >
                      <cat.icon className="size-3.5" />
                      <span className="text-[length:var(--font-session-item)]">{cat.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
                </div>
                {si < arr.length - 1 && <div className="h-2" />}
              </div>
            ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter className="px-2 pb-2">
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[length:var(--font-session-item)] text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
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
