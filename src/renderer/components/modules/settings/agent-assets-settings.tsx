/**
 * Settings → Teams hub: Teams / Skills / Commands / MCP under one page
 * with a shared search (filters the active tab only).
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { SearchIcon, StoreIcon } from "lucide-react";
import { useDocumentStore } from "@/stores/document-store";
import { useLayoutStore } from "@/stores/layout-store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  agentAssetsTabToSettingsCategory,
  settingsCategoryToAgentAssetsTab,
  type AgentAssetsTab,
} from "./agent-assets-shared";
import { TeamsAgentsSettings } from "./teams-settings";
import { SkillsSettings } from "./skills-settings";
import CommandsSettings from "./commands-settings";
import { ToolsMcpSettings } from "./tools-mcp-settings";

/** Active tab: brand underline only — no full-width rail under the row. */
const TAB_TRIGGER =
  "bg-transparent shadow-none rounded-none border-b-2 border-transparent data-[state=active]:bg-transparent data-[state=active]:border-primary data-[state=active]:shadow-none px-1 pb-1.5 pt-1 text-muted-foreground data-[state=active]:text-foreground";

const SEARCH_INPUT =
  "w-full min-w-0 rounded-md border border-input bg-transparent py-1.5 pl-8 pr-3 text-[length:var(--font-size-13)] outline-none focus:border-primary";

export function AgentAssetsSettings() {
  const { t } = useTranslation();
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const settingsCategory = useLayoutStore((s) => s.settingsCategory);
  const setSettingsCategory = useLayoutStore((s) => s.setSettingsCategory);

  const tab = useMemo(
    () => settingsCategoryToAgentAssetsTab(settingsCategory),
    [settingsCategory],
  );
  const [search, setSearch] = useState("");

  useEffect(() => {
    setSearch("");
  }, [tab]);

  const onTabChange = (value: string) => {
    const next = value as AgentAssetsTab;
    setSettingsCategory(agentAssetsTabToSettingsCategory(next));
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl min-w-0 space-y-5 px-4 py-8 sm:px-8">
        <div className="flex min-w-0 items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-[length:var(--font-dialog-title)] font-semibold">
              {t("settings.agentAssets.title")}
            </h2>
            <p className="mt-0.5 text-[length:var(--font-dialog-label)] text-muted-foreground">
              {t("settings.agentAssets.pageDesc")}
            </p>
          </div>
          {tab === "teams" && projectRoot ? (
            <Button
              variant="outline"
              size="xs"
              className="shrink-0"
              onClick={() => useLayoutStore.getState().setLeftSidebarView("teams")}
            >
              <StoreIcon className="size-3 mr-1" />
              {t("settings.teams.browse")}
            </Button>
          ) : null}
        </div>

        <Tabs value={tab} onValueChange={onTabChange} className="min-w-0 gap-0">
          <TabsList className="h-auto w-full flex-wrap justify-start gap-x-4 gap-y-1 rounded-none border-0 bg-transparent p-0">
            <TabsTrigger value="teams" className={TAB_TRIGGER}>
              {t("settings.agentAssets.tabTeams")}
            </TabsTrigger>
            <TabsTrigger value="skills" className={TAB_TRIGGER}>
              {t("settings.agentAssets.tabSkills")}
            </TabsTrigger>
            <TabsTrigger value="commands" className={TAB_TRIGGER}>
              {t("settings.agentAssets.tabCommands")}
            </TabsTrigger>
            <TabsTrigger value="mcp" className={TAB_TRIGGER}>
              {t("settings.agentAssets.tabMcp")}
            </TabsTrigger>
          </TabsList>

          <div className="relative mt-4">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              className={SEARCH_INPUT}
              placeholder={t("settings.agentAssets.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label={t("settings.agentAssets.searchPlaceholder")}
            />
          </div>

          <TabsContent value="teams" className={cn("mt-5 min-w-0 focus-visible:ring-0")}>
            <TeamsAgentsSettings embedded searchQuery={search} />
          </TabsContent>
          <TabsContent value="skills" className={cn("mt-5 min-w-0 focus-visible:ring-0")}>
            <SkillsSettings embedded searchQuery={search} />
          </TabsContent>
          <TabsContent value="commands" className={cn("mt-5 min-w-0 focus-visible:ring-0")}>
            <CommandsSettings embedded searchQuery={search} />
          </TabsContent>
          <TabsContent value="mcp" className={cn("mt-5 min-w-0 focus-visible:ring-0")}>
            <ToolsMcpSettings embedded searchQuery={search} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
