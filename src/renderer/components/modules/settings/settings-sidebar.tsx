import { createPortal } from "react-dom";
import { useLayoutStore } from "@/stores/layout-store";
import { useDocumentStore } from "@/stores/document-store";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import {
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
}

export function SettingsSidebar({ activeCategory, onSelectCategory }: SettingsSidebarProps) {
  const sidebarWidth = useLayoutStore((s) => s.sidebarWidth);
  const leftSidebarOverlay = useLayoutStore((s) => s.leftSidebarOverlay);
  const setLeftSidebarOverlay = useLayoutStore((s) => s.setLeftSidebarOverlay);
  const projectRoot = useDocumentStore((s) => s.projectRoot);

  const sidebarContent = (
    <SidebarProvider
      defaultOpen
      className="contents"
      style={{ "--sidebar-width": `${sidebarWidth}px` } as React.CSSProperties}
    >
      <Sidebar collapsible="none" className="relative shrink-0 bg-card">
        <SidebarHeader className="flex h-[var(--height-sessions-header)] shrink-0 flex-row items-center border-b border-border px-3">
          <span className="text-[length:var(--font-sidebar-section)] font-semibold uppercase tracking-wider text-muted-foreground">
            Settings
          </span>
        </SidebarHeader>

        <SidebarContent className="px-2 py-1">
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
      </Sidebar>
    </SidebarProvider>
  );

  return (
    <>
      {leftSidebarOverlay &&
        createPortal(
          <div className="fixed top-[var(--height-titlebar)] right-0 bottom-0 left-0 z-50 flex flex-col bg-background">
            <div className="flex h-[var(--height-sessions-header)] shrink-0 items-center justify-between border-b border-border px-3">
              <span className="text-[length:var(--font-sidebar-section)] font-semibold uppercase tracking-wider text-muted-foreground">
                Settings
              </span>
              <button
                type="button"
                className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => setLeftSidebarOverlay(false)}
              >
                <XIcon className="size-3.5" />
              </button>
            </div>
            <div className="flex-1 min-h-0">{sidebarContent}</div>
          </div>,
          document.body,
        )}
      {sidebarContent}
    </>
  );
}
