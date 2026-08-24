import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useLayoutStore } from "@/stores/layout-store";
import {
  SidebarProvider,
  Sidebar,
} from "@/components/ui/sidebar";
import { SidebarUpdateButton } from "@/components/layout/sidebar-update-button";
import { SidebarHitChrome } from "@/components/layout/sidebar-controls";
import {
  LEFT_SIDEBAR_ROW,
  LEFT_SIDEBAR_ROW_ACTIVE,
  LEFT_SIDEBAR_ROW_HOVER,
  LEFT_SIDEBAR_SECTION_HEADER,
  LEFT_SIDEBAR_SECTION_LABEL,
  LEFT_SIDEBAR_STACK,
} from "@/components/layout/left-nav-button";
import {
  ArrowLeftIcon,
  Settings2Icon,
  PaletteIcon,
  GlobeIcon,
  TerminalIcon,
  FileTextIcon,
  LayoutGridIcon,
  Bot,
  BookOpenIcon,
  ShieldIcon,
  InfoIcon,
  SparklesIcon,
} from "lucide-react";
import { useProLicenseStore } from "@/stores/pro-license-store";
import { isAgentAssetsCategory } from "./agent-assets-shared";

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
      { id: "teams-agents", labelKey: "settings.nav.teams", icon: Bot },
      { id: "prompts-rules", labelKey: "settings.nav.promptsRules", icon: FileTextIcon },
      { id: "permissions", labelKey: "settings.nav.permissions", icon: ShieldIcon },
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
}

export function SettingsSidebar({ activeCategory, onSelectCategory }: SettingsSidebarProps) {
  const { t } = useTranslation();

  const proSettings = useProLicenseStore((s) => s.contributions.settings);

  return (
    <SidebarProvider defaultOpen className="contents">
      <Sidebar collapsible="none" className="relative shrink-0 border-r-0" data-surface="sidebar" data-left-sidebar-slab="">
        <div className="drag-region flex h-[var(--height-titlebar)] shrink-0 items-center px-2 select-none">
          <SidebarHitChrome />
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto px-2 pb-1">
          <div className="flex items-center gap-1 pt-1">
            <button
              type="button"
              className={cn(LEFT_SIDEBAR_ROW, "min-w-0 flex-1", LEFT_SIDEBAR_ROW_HOVER)}
              onClick={() => {
                useLayoutStore.getState().setLeftSidebarView("sessions");
              }}
            >
              <ArrowLeftIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <span>{t("common.back")}</span>
            </button>
            <SidebarUpdateButton />
          </div>
          {SETTINGS_GROUPS.map((group) => (
            <div key={group.labelKey}>
              <div className={LEFT_SIDEBAR_SECTION_HEADER}>
                <span className={LEFT_SIDEBAR_SECTION_LABEL}>{t(group.labelKey)}</span>
              </div>
              <div className={LEFT_SIDEBAR_STACK}>
                {group.items.map((cat) => {
                  const selected =
                    cat.id === "teams-agents"
                      ? isAgentAssetsCategory(activeCategory)
                      : activeCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      className={cn(
                        LEFT_SIDEBAR_ROW,
                        selected ? LEFT_SIDEBAR_ROW_ACTIVE : LEFT_SIDEBAR_ROW_HOVER,
                      )}
                      onClick={() => {
                        if (cat.id === "teams-agents" && isAgentAssetsCategory(activeCategory)) {
                          onSelectCategory(activeCategory);
                          return;
                        }
                        onSelectCategory(cat.id);
                      }}
                    >
                      <cat.icon
                        className={cn(
                          "size-3.5 shrink-0",
                          selected ? "text-primary" : "text-muted-foreground",
                        )}
                      />
                      <span className="flex-1 text-left">{t(cat.labelKey)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {proSettings.length > 0 ? (
            <div>
              <div className={LEFT_SIDEBAR_SECTION_HEADER}>
                <span className={LEFT_SIDEBAR_SECTION_LABEL}>{t("settings.nav.pro")}</span>
              </div>
              <div className={LEFT_SIDEBAR_STACK}>
                {proSettings.map((item) => {
                  const label = item.sectionLabelKey
                    ? t(item.sectionLabelKey, { defaultValue: item.sectionLabel })
                    : item.sectionLabel;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={cn(
                        LEFT_SIDEBAR_ROW,
                        activeCategory === item.id
                          ? LEFT_SIDEBAR_ROW_ACTIVE
                          : LEFT_SIDEBAR_ROW_HOVER,
                      )}
                      onClick={() => onSelectCategory(item.id)}
                    >
                      <SparklesIcon
                        className={cn(
                          "size-3.5 shrink-0",
                          activeCategory === item.id ? "text-primary" : "text-muted-foreground",
                        )}
                      />
                      <span className="flex-1 text-left">{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </Sidebar>
    </SidebarProvider>
  );
}
