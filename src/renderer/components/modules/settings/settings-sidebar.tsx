import { createPortal } from "react-dom";
import type { RefObject } from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { useTranslation } from "react-i18next";
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
import { SidebarUpdateButton } from "@/components/layout/sidebar-update-button";
import {
  ArrowLeftIcon,
  Settings2Icon,
  PaletteIcon,
  GlobeIcon,
  TerminalIcon,
  FileTextIcon,
  LayoutGridIcon,
  XIcon,
  Bot,
  BookOpenIcon,
  PuzzleIcon,
  PlugIcon,
  SlashIcon,
  ShieldIcon,
  InfoIcon,
  SparklesIcon,
} from "lucide-react";
import { useProLicenseStore } from "@/stores/pro-license-store";

const SECTION_LABEL =
  "text-[length:var(--font-hint)] font-medium uppercase tracking-wider text-muted-foreground/50";

export const SETTINGS_GROUPS = [
  {
    labelKey: "settings.nav.application",
    items: [
      { id: "general", labelKey: "settings.nav.general", icon: Settings2Icon },
      { id: "appearance", labelKey: "settings.nav.appearance", icon: PaletteIcon },
      { id: "workspace", labelKey: "settings.nav.workspace", icon: LayoutGridIcon },
      { id: "about", labelKey: "settings.nav.about", icon: InfoIcon },
    ],
  },
  {
    labelKey: "settings.nav.agentAi",
    items: [
      { id: "models", labelKey: "settings.nav.models", icon: GlobeIcon },
      { id: "agent", labelKey: "settings.nav.agent", icon: Bot },
      { id: "prompts-rules", labelKey: "settings.nav.promptsRules", icon: FileTextIcon },
      { id: "permissions", labelKey: "settings.nav.permissions", icon: ShieldIcon },
      { id: "commands", labelKey: "settings.nav.commands", icon: SlashIcon },
      { id: "tools-mcp", labelKey: "settings.nav.mcp", icon: PlugIcon },
      { id: "skills", labelKey: "settings.nav.skills", icon: PuzzleIcon },
    ],
  },
  {
    labelKey: "settings.nav.components",
    items: [
      { id: "texworkspace", labelKey: "settings.nav.texWorkspace", icon: FileTextIcon },
      { id: "terminal", labelKey: "settings.nav.terminal", icon: TerminalIcon },
      { id: "browser", labelKey: "settings.nav.browser", icon: GlobeIcon },
      { id: "literature", labelKey: "settings.nav.literature", icon: BookOpenIcon },
    ],
  },
] as const;

/** Builtin ids plus dynamic Pro contribution ids. */
export type SettingsCategory =
  | (typeof SETTINGS_GROUPS)[number]["items"][number]["id"]
  | (string & {});

interface SettingsSidebarProps {
  activeCategory: SettingsCategory;
  onSelectCategory: (id: SettingsCategory) => void;
  leftSidebarRef?: RefObject<PanelImperativeHandle | null>;
}

export function SettingsSidebar({ activeCategory, onSelectCategory, leftSidebarRef }: SettingsSidebarProps) {
  const { t } = useTranslation();
  const { platform, isFullscreen } = useWindowState();
  const isMac = platform === "darwin";
  const showMacSpacer = isMac && !isFullscreen;

  const sidebarFullyCollapsed = useLayoutStore((s) => s.sidebarFullyCollapsed);
  const leftSidebarOverlay = useLayoutStore((s) => s.leftSidebarOverlay);
  const setLeftSidebarOverlay = useLayoutStore((s) => s.setLeftSidebarOverlay);
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const proSettings = useProLicenseStore((s) => s.contributions.settings);

  const sidebarContent = (
    <SidebarProvider defaultOpen className="contents">
      <Sidebar collapsible="none" className="relative shrink-0 border-r-0 !w-full" data-surface="sidebar">
        <div className="drag-region flex h-[var(--height-titlebar)] shrink-0 items-center px-2 select-none">
          {!sidebarFullyCollapsed && (
            <SidebarControls leftSidebarRef={leftSidebarRef!} showMacSpacer={showMacSpacer} showNewAgent={false} />
          )}
        </div>

        {projectRoot && (
          <div className="shrink-0 px-2 flex flex-col gap-1">
            <div>
              <ProjectSwitcher className="flex w-full items-center gap-2 rounded-md border border-border px-2 py-1.5 text-[length:var(--font-session-item)] font-medium hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors" />
            </div>
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto px-2 pb-1">
          {SETTINGS_GROUPS.map((group) => (
            <div key={group.labelKey}>
              <div className="pt-2 pb-1">
                <span className={SECTION_LABEL}>{t(group.labelKey)}</span>
              </div>
              <div className="flex flex-col gap-1">
                {group.items.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[length:var(--font-session-item)] transition-colors",
                      activeCategory === cat.id
                        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    )}
                    onClick={() => onSelectCategory(cat.id)}
                  >
                    <cat.icon className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="flex-1 text-left">{t(cat.labelKey)}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {proSettings.length > 0 ? (
            <div>
              <div className="pt-2 pb-1">
                <span className={SECTION_LABEL}>{t("settings.nav.pro")}</span>
              </div>
              <div className="flex flex-col gap-1">
                {proSettings.map((item) => {
                  const label = item.sectionLabelKey
                    ? t(item.sectionLabelKey, { defaultValue: item.sectionLabel })
                    : item.sectionLabel;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[length:var(--font-session-item)] transition-colors",
                        activeCategory === item.id
                          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                          : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                      )}
                      onClick={() => onSelectCategory(item.id)}
                    >
                      <SparklesIcon className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="flex-1 text-left">{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        <SidebarFooter className="px-2 pb-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-[length:var(--font-session-item)] text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
              onClick={() => {
                if (!projectRoot) {
                  useDocumentStore.getState().setShowWelcome(true);
                }
                useLayoutStore.getState().setLeftSidebarView("sessions");
                setLeftSidebarOverlay(false);
              }}
            >
              <ArrowLeftIcon className="size-3.5 shrink-0" />
              <span>{t("common.back")}</span>
            </button>
            <SidebarUpdateButton />
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
