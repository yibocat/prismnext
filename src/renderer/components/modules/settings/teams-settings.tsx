// Settings → Teams — flat team list; click a row to open the right-side
// team-detail panel (lead / subagents / skills / commands / MCP + roster add).
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BotIcon, PlusIcon, StoreIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useDocumentStore } from "@/stores/document-store";
import { useLayoutStore } from "@/stores/layout-store";
import { useProLicenseStore } from "@/stores/pro-license-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { listTeamAssets, useTeamsStore, type TeamCardView } from "@/stores/teams-store";
import { closeSettingsPanel, openSettingsPanel } from "@/stores/settings-panel-store";
import { useOnSettingsEditorKindsClosed } from "@/hooks/use-settings-editor";
import { teamDisplayName } from "@/lib/teams/team-display-name";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  SETTINGS_CARD as CARD,
  SETTINGS_CATEGORY_HEADER as CATEGORY_HEADER,
  SETTINGS_ROW as ROW,
  SETTINGS_ROW_DESC as ROW_DESC,
  SETTINGS_ROW_LABEL as ROW_LABEL,
} from "./settings-tokens";
import { PackIcon } from "../teams/team-icon";
import { ProBadge } from "../teams/pro-badge";
import { ScopeChip } from "../teams/scope-chip";
import type { AssetViewV2 } from "@shared/teams/view";
import { CORE_TEAM_ID, MY_CONTENT_TEAM_ID, PROJECT_DEFAULT_TEAM_ID } from "@shared/teams/types";
import {
  matchesAgentAssetQuery,
  type AgentAssetPaneProps,
} from "./agent-assets-shared";

const HANGAR_TEAM_IDS = new Set([MY_CONTENT_TEAM_ID, PROJECT_DEFAULT_TEAM_ID]);
/** Team row click — label matches other Settings rows; hover only brightens text (no fill). */
const TEAM_ROW_BTN =
  "group flex flex-1 min-w-0 items-center gap-2 py-0.5 text-left transition-colors";
const TEAM_ROW_LABEL =
  cn(ROW_LABEL, "truncate transition-colors group-hover:text-foreground");
const TEAM_ROW_DESC =
  cn(ROW_DESC, "transition-colors group-hover:text-foreground");

function packIdOf(fqid: string): string {
  const idx = fqid.indexOf(":");
  return idx > 0 ? fqid.slice(0, idx) : PROJECT_DEFAULT_TEAM_ID;
}

function isHangarTeamId(teamId: string): boolean {
  return HANGAR_TEAM_IDS.has(teamId);
}

function sortAssets(list: AssetViewV2[]): AssetViewV2[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name));
}

interface TeamRow {
  teamId: string;
  label: string;
  pack: TeamCardView | undefined;
  leadName: string | null;
}

export function TeamsAgentsSettings({
  embedded = false,
  searchQuery = "",
}: AgentAssetPaneProps = {}) {
  const { t } = useTranslation();
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const license = useProLicenseStore((s) => s.license);
  const catalog = useTeamsStore((s) => s.catalog);
  const activeTeamId = useTeamsStore((s) => s.activeTeamId);
  const openTeamDetailId = useRightPanelStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    const slot = tab?.kind === "settings-editor" ? tab.settingsSlot : null;
    return slot?.kind === "team-detail" ? slot.teamId : null;
  });

  const [orchestrators, setOrchestrators] = useState<AssetViewV2[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Always show Common + project.local hangars (even when still empty of extras).
  const packs = useMemo(
    () => catalog.filter((p) => p.installed),
    [catalog],
  );
  const packById = useMemo(() => {
    const map = new Map<string, TeamCardView>();
    for (const p of catalog) map.set(p.manifest.id, p);
    return map;
  }, [catalog]);

  const loadAll = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!projectRoot) {
        setOrchestrators([]);
        useTeamsStore.getState().clear();
        return;
      }
      if (!options?.silent) setLoading(true);
      try {
        const [orchestratorList] = await Promise.all([
          listTeamAssets(projectRoot, "orchestrator"),
          useTeamsStore.getState().load(projectRoot, { force: true }),
        ]);
        setOrchestrators(sortAssets(orchestratorList));
      } catch {
        setOrchestrators([]);
      } finally {
        if (!options?.silent) setLoading(false);
      }
    },
    [projectRoot],
  );

  useEffect(() => { void loadAll(); }, [loadAll, license]);

  useOnSettingsEditorKindsClosed(
    ["agent-expert", "agent-orchestrator", "team-detail", "team-create"],
    () => { void loadAll({ silent: true }); },
  );

  const { installedRows: installedRowsAll, hangarRows: hangarRowsAll } = useMemo(() => {
    // Settings list = installed teams only (uninstalled Core/bundled go to Browse).
    // Hangars always appear — even before any user content is created — in their own section.
    const pids = new Set<string>(packs.map((p) => p.manifest.id));
    pids.add(MY_CONTENT_TEAM_ID);
    pids.add(PROJECT_DEFAULT_TEAM_ID);
    for (const o of orchestrators) {
      const pid = packIdOf(o.fqid);
      if (packById.get(pid)?.installed !== false) pids.add(pid);
    }
    const hangarRank = (pid: string) =>
      pid === MY_CONTENT_TEAM_ID ? 0 : pid === PROJECT_DEFAULT_TEAM_ID ? 1 : 2;
    const rows = [...pids].map((teamId) => {
      const pack = packById.get(teamId);
      if (pack && !pack.installed) return null;
      const lead = orchestrators.find((o) => packIdOf(o.fqid) === teamId);
      return {
        teamId,
        label: teamDisplayName(teamId, pack?.manifest.name, t),
        pack,
        leadName: lead?.name ?? null,
      };
    }).filter((row): row is TeamRow => row !== null);

    const installed = rows
      .filter((r) => !isHangarTeamId(r.teamId))
      .sort((a, b) => {
        if (a.teamId === CORE_TEAM_ID) return -1;
        if (b.teamId === CORE_TEAM_ID) return 1;
        return a.label.localeCompare(b.label);
      });
    const hangars = rows
      .filter((r) => isHangarTeamId(r.teamId))
      .sort((a, b) => hangarRank(a.teamId) - hangarRank(b.teamId));
    return { installedRows: installed, hangarRows: hangars };
  }, [orchestrators, packs, packById, t]);

  const filterRow = useCallback(
    (row: TeamRow) =>
      matchesAgentAssetQuery(
        searchQuery,
        row.label,
        row.leadName,
        row.teamId,
        row.pack?.manifest.name,
        row.pack?.manifest.description,
      ),
    [searchQuery],
  );
  const installedRows = useMemo(
    () => installedRowsAll.filter(filterRow),
    [installedRowsAll, filterRow],
  );
  const hangarRows = useMemo(
    () => hangarRowsAll.filter(filterRow),
    [hangarRowsAll, filterRow],
  );
  const hasAnyTeam = installedRowsAll.length > 0 || hangarRowsAll.length > 0;
  const hasVisibleTeam = installedRows.length > 0 || hangarRows.length > 0;

  const goActivatePro = () => {
    useLayoutStore.getState().setLeftSidebarView("settings");
    useLayoutStore.getState().setSettingsCategory("about");
    closeSettingsPanel();
  };

  const toggleTeamDetail = (row: TeamRow) => {
    // Locked Pro teams: no detail until license is active (use row Activate → About).
    if (row.pack?.locked) {
      toast.message(t("settings.teams.blocked.license"));
      return;
    }
    // Same team already open → close the right panel; otherwise open/switch.
    if (openTeamDetailId === row.teamId) {
      closeSettingsPanel();
      return;
    }
    openSettingsPanel({ kind: "team-detail", teamId: row.teamId, title: row.label });
  };

  const activateTeam = async (teamId: string) => {
    if (!projectRoot || saving) return;
    setSaving(true);
    try {
      await useTeamsStore.getState().setActiveTeam(projectRoot, teamId);
      toast.success(t("settings.teams.toast.activeUpdated"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const renderTeamRow = (row: TeamRow) => {
    const isActive = row.teamId === activeTeamId;
    const isOpen = openTeamDetailId === row.teamId;
    const projectEnabled = row.pack ? row.pack.enabled : true;
    const isPro = row.pack?.manifest.tier === "pro";
    const isLocked = !!row.pack?.locked;
    const canActivate =
      !isActive
      && projectEnabled
      && !isLocked
      && !!(row.leadName || row.pack?.hasOrchestrator);
    return (
      <div
        key={row.teamId}
        className={cn(
          ROW,
          "min-w-0 items-start gap-2 px-2",
          (!projectEnabled || isLocked) && "opacity-60",
        )}
      >
        <button
          type="button"
          className={cn(TEAM_ROW_BTN, "min-w-0")}
          onClick={() => toggleTeamDetail(row)}
        >
          <PackIcon size="sm" icon={row.pack?.manifest.icon} iconDir={row.pack?.dir} />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className={cn(TEAM_ROW_LABEL, "min-w-0 max-w-full truncate", isOpen && "text-foreground")}>{row.label}</span>
              {row.pack && <ScopeChip scope={row.pack.scope} quiet />}
              {isPro && <ProBadge />}
            </div>
            {row.leadName && (
              <p className={cn(TEAM_ROW_DESC, "truncate")}>{row.leadName}</p>
            )}
          </div>
        </button>
        {isLocked ? (
          <Button
            size="xs"
            variant="outline"
            className="shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              goActivatePro();
            }}
          >
            {t("settings.teams.activateLicense")}
          </Button>
        ) : isActive ? (
          <span className="shrink-0 text-[length:var(--font-size-11)] text-muted-foreground px-1">
            {t("settings.teams.card.activated")}
          </span>
        ) : canActivate ? (
          <Button
            size="xs"
            variant="outline"
            className="shrink-0"
            disabled={saving}
            onClick={(e) => {
              e.stopPropagation();
              void activateTeam(row.teamId);
            }}
          >
            {t("settings.teams.setActive")}
          </Button>
        ) : null}
      </div>
    );
  };

  const body = !projectRoot ? (
    <div className={cn(CARD, "min-w-0 !divide-y-0")}>
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <BotIcon className="size-8 text-muted-foreground/30" />
        <p className="text-[length:var(--font-size-13)] text-muted-foreground">{t("settings.teams.noProject")}</p>
      </div>
    </div>
  ) : (
    <div className="min-w-0 space-y-4">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="xs"
          disabled={saving}
          onClick={() => openSettingsPanel({ kind: "team-create", scope: "project" })}
        >
          <PlusIcon className="size-3 mr-1" />{t("settings.teams.createTeam")}
        </Button>
        <Button variant="outline" size="xs" disabled={saving} onClick={() => openSettingsPanel({ kind: "agent-expert", mode: "new" })}>
          <PlusIcon className="size-3 mr-1" />{t("settings.teams.newSubagent")}
        </Button>
      </div>

      {loading ? (
        <div className={cn(CARD, "min-w-0 py-3 text-[length:var(--font-size-12)] text-muted-foreground")}>{t("common.loading")}</div>
      ) : !hasAnyTeam ? (
        <div className={cn(CARD, "min-w-0 !divide-y-0")}>
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <BotIcon className="size-8 text-muted-foreground/30" />
            <p className="text-[length:var(--font-size-13)] text-muted-foreground">{t("settings.teams.emptyTeamCards")}</p>
          </div>
        </div>
      ) : !hasVisibleTeam ? (
        <div className={cn(CARD, "min-w-0 py-3 text-[length:var(--font-size-12)] text-muted-foreground")}>
          {t("settings.agentAssets.noMatches")}
        </div>
      ) : (
        <>
          {installedRows.length > 0 && (
            <div className={cn(CARD, "min-w-0 overflow-hidden")}>
              {installedRows.map(renderTeamRow)}
            </div>
          )}
          {hangarRows.length > 0 && (
            <div className="min-w-0 space-y-2">
              <p className={CATEGORY_HEADER}>{t("settings.teams.hangarsSection")}</p>
              <div className={cn(CARD, "min-w-0 overflow-hidden")}>
                {hangarRows.map(renderTeamRow)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );

  if (embedded) {
    return <div className="min-w-0 space-y-6">{body}</div>;
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl min-w-0 space-y-6 px-4 py-8 sm:px-8">
        <div className="flex min-w-0 items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-[length:var(--font-dialog-title)] font-semibold">{t("settings.teams.title")}</h2>
            <p className="mt-0.5 text-[length:var(--font-dialog-label)] text-muted-foreground">{t("settings.teams.pageDesc")}</p>
          </div>
          {projectRoot ? (
            <Button
              variant="outline"
              size="xs"
              className="shrink-0"
              onClick={() => useLayoutStore.getState().setLeftSidebarView("teams")}
            >
              <StoreIcon className="size-3 mr-1" />{t("settings.teams.browse")}
            </Button>
          ) : null}
        </div>
        {body}
      </div>
    </div>
  );
}
