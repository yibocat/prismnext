// Settings → Teams (design 2026-08-10 §8.2). The single management home for
// teams and the orchestration-class assets (lead agent / subagents / roster /
// scope). Structure: active team on top, then all teams (TeamCard) with one
// project-level switch each, and an expanded row rendering the user's mental
// model: lead agent → roster → this team's subagents → capabilities → scope.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDownIcon, ChevronRightIcon, PlusIcon, StoreIcon } from "lucide-react";
import { toast } from "sonner";
import { useDocumentStore } from "@/stores/document-store";
import { useLayoutStore } from "@/stores/layout-store";
import { useProLicenseStore } from "@/stores/pro-license-store";
import { useTeamsStore, toCardView, type TeamCardView } from "@/stores/teams-store";
import { openSettingsPanel } from "@/stores/settings-panel-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { SETTINGS_CARD as CARD } from "./settings-tokens";
import { TeamCard } from "../teams/team-card";
import { ScopeChip } from "../teams/scope-chip";
import { OriginChip } from "../teams/origin-chip";
import { OverrideDot } from "../teams/override-dot";
import { BlockedHint } from "../teams/blocked-hint";
import { RosterEditor } from "../teams/roster-editor";
import type { AssetViewV2, RosterView } from "@shared/teams/view";
import { CORE_TEAM_ID } from "@shared/teams/types";

export function TeamsAgentsSettings() {
  const { t } = useTranslation();
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const license = useProLicenseStore((s) => s.license);
  const catalog = useTeamsStore((s) => s.catalog);

  const [subagents, setSubagents] = useState<AssetViewV2[]>([]);
  const [orchestrators, setOrchestrators] = useState<AssetViewV2[]>([]);
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const [rosters, setRosters] = useState<Record<string, RosterView | null>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [creating, setCreating] = useState<"app" | "project" | null>(null);
  const [teamName, setTeamName] = useState("");
  const [teamDesc, setTeamDesc] = useState("");
  const [saving, setSaving] = useState(false);

  const loadAll = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!projectRoot) {
        setSubagents([]);
        setOrchestrators([]);
        setActiveTeamId(null);
        setRosters({});
        useTeamsStore.getState().clear();
        return;
      }
      try {
        const [subs, orchs, active] = await Promise.all([
          window.electronAPI.teamsListAssets(projectRoot, "subagent"),
          window.electronAPI.teamsListAssets(projectRoot, "orchestrator"),
          window.electronAPI.teamsGetActiveTeam(projectRoot),
          useTeamsStore.getState().load(projectRoot, { force: true }),
        ]);
        setSubagents(subs);
        setOrchestrators(orchs);
        setActiveTeamId(active?.manifest.id ?? null);
      } catch {
        // leave previous state on transient failure
      }
    },
    [projectRoot],
  );

  useEffect(() => {
    void loadAll();
  }, [loadAll, license]);

  // Load the roster for an expanded team on demand.
  const loadRoster = useCallback(
    async (teamId: string) => {
      if (!projectRoot) return;
      const roster = await window.electronAPI.teamsGetRoster(projectRoot, teamId);
      setRosters((prev) => ({ ...prev, [teamId]: roster }));
    },
    [projectRoot],
  );

  const toggleExpand = (teamId: string) => {
    const next = expanded === teamId ? null : teamId;
    setExpanded(next);
    if (next) void loadRoster(next);
  };

  const setActive = async (teamId: string) => {
    if (!projectRoot) return;
    setSaving(true);
    try {
      await window.electronAPI.teamsSetActiveTeam(projectRoot, teamId, "project");
      setActiveTeamId(teamId);
      toast.success(t("settings.teams.toast.activeUpdated"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const setTeamEnabled = async (team: TeamCardView, enabled: boolean) => {
    if (!projectRoot) return;
    try {
      await window.electronAPI.teamsSetEnabled(projectRoot, team.manifest.id, enabled, "project");
      await loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const setAssetEnabled = async (fqid: string, enabled: boolean) => {
    if (!projectRoot) return;
    try {
      await window.electronAPI.teamsSetAssetEnabled(projectRoot, fqid, enabled, "project");
      await loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const createTeam = async () => {
    if (!projectRoot || !creating || !teamName.trim()) return;
    setSaving(true);
    try {
      await window.electronAPI.teamsCreate(teamName.trim(), teamDesc.trim(), creating, projectRoot);
      setTeamName("");
      setTeamDesc("");
      setCreating(null);
      toast.success(t("settings.teams.toast.teamCreated"));
      await loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const activeTeam = useMemo(
    () => catalog.find((tm) => tm.manifest.id === activeTeamId) ?? null,
    [catalog, activeTeamId],
  );

  const subagentsByTeam = useMemo(() => {
    const map = new Map<string, AssetViewV2[]>();
    for (const s of subagents) {
      const list = map.get(s.teamId) ?? [];
      list.push(s);
      map.set(s.teamId, list);
    }
    return map;
  }, [subagents]);

  const orchestratorByTeam = useMemo(() => {
    const map = new Map<string, AssetViewV2>();
    for (const o of orchestrators) map.set(o.teamId, o);
    return map;
  }, [orchestrators]);

  if (!projectRoot) {
    return (
      <div className={cn(CARD, "flex flex-col items-center gap-2 py-12 text-center")}>
        <p className="text-[length:var(--font-size-13)] text-muted-foreground">
          {t("settings.teamsAgents.noProject")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-[length:var(--font-size-16)] font-semibold">{t("settings.teams.title")}</h2>
          <p className="text-[length:var(--font-size-12)] text-muted-foreground">{t("settings.teams.pageDesc")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="xs" onClick={() => setCreating(creating ? null : "project")}>
            <PlusIcon className="size-3.5" />
            {t("settings.teams.createTeam")}
          </Button>
          <Button variant="outline" size="xs" onClick={() => useLayoutStore.getState().setLeftSidebarView("teams")}>
            <StoreIcon className="size-3.5" />
            {t("settings.teams.browse")}
          </Button>
        </div>
      </div>

      {/* Create-team inline form */}
      {creating && (
        <div className={cn(CARD, "space-y-2 p-3")}>
          <div className="flex items-center gap-2">
            <ScopeChip scope={creating} />
            <span className="text-[length:var(--font-size-12)] text-muted-foreground">
              {creating === "app" ? t("settings.teams.scope.appDesc") : t("settings.teams.scope.projectDesc")}
            </span>
            <button
              type="button"
              className="ml-auto text-[length:var(--font-size-11)] text-primary hover:underline"
              onClick={() => setCreating(creating === "app" ? "project" : "app")}
            >
              {creating === "app" ? t("settings.teams.scope.project") : t("settings.teams.scope.app")}
            </button>
          </div>
          <Input
            placeholder={t("settings.teams.teamNamePlaceholder")}
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
          />
          <Input
            placeholder={t("settings.teams.teamDescPlaceholder")}
            value={teamDesc}
            onChange={(e) => setTeamDesc(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="xs" onClick={() => setCreating(null)}>
              {t("common.cancel")}
            </Button>
            <Button size="xs" disabled={!teamName.trim() || saving} onClick={() => void createTeam()}>
              {t("common.create")}
            </Button>
          </div>
        </div>
      )}

      {/* Active team */}
      {activeTeam && (
        <div className={cn(CARD, "p-3")}>
          <p className="mb-2 text-[length:var(--font-size-11)] font-medium uppercase tracking-wide text-muted-foreground">
            {t("settings.teams.activeTeam")}
          </p>
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{activeTeam.manifest.name}</span>
                <ScopeChip scope={activeTeam.scope} />
                <OriginChip source={activeTeam.source} tier={activeTeam.manifest.tier} />
              </div>
              <p className="truncate text-[length:var(--font-size-12)] text-muted-foreground">
                {activeTeam.orchestratorId
                  ? orchestratorByTeam.get(activeTeam.manifest.id)?.name ?? activeTeam.orchestratorId
                  : t("settings.teams.noLead")}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* All teams */}
      <div className="space-y-2">
        {catalog.map((team) => {
          const isExpanded = expanded === team.manifest.id;
          const isActive = team.manifest.id === activeTeamId;
          const orch = orchestratorByTeam.get(team.manifest.id);
          const teamSubagents = subagentsByTeam.get(team.manifest.id) ?? [];
          const roster = rosters[team.manifest.id];
          const overridden = team.enabledProject !== undefined && team.enabledProject !== team.enabledApp;
          return (
            <div key={team.manifest.id} className="rounded-md border border-border">
              <div className="flex items-center gap-2 px-3 py-2">
                <button type="button" onClick={() => toggleExpand(team.manifest.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                  {isExpanded ? (
                    <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className={cn("truncate font-medium", !team.enabled && "text-muted-foreground")}>
                    {team.manifest.name}
                  </span>
                  <ScopeChip scope={team.scope} />
                  <OriginChip source={team.source} tier={team.manifest.tier} />
                  {isActive && (
                    <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[length:var(--font-size-11)] font-medium text-secondary-foreground">
                      {t("settings.teams.card.active")}
                    </span>
                  )}
                  <OverrideDot
                    overridden={overridden}
                    appValue={team.enabledApp}
                    onReset={() => void window.electronAPI.teamsSetEnabled(projectRoot, team.manifest.id, null, "project").then(() => loadAll())}
                  />
                </button>
                {team.blockedBy && team.blockedBy !== "team-disabled-project" && team.blockedBy !== "team-disabled-app" ? (
                  <BlockedHint blockedBy={team.blockedBy} teamName={team.manifest.name} />
                ) : (
                  <Switch
                    checked={team.enabled}
                    disabled={saving || team.manifest.id === CORE_TEAM_ID || team.scope === "project"}
                    onCheckedChange={(v) => void setTeamEnabled(team, v)}
                    aria-label={team.manifest.name}
                  />
                )}
              </div>

              {isExpanded && (
                <div className="space-y-4 border-t border-border px-4 py-3">
                  {/* Lead agent */}
                  <div>
                    <p className="mb-1.5 text-[length:var(--font-size-11)] font-medium uppercase tracking-wide text-muted-foreground">
                      {t("settings.teams.leadAgent")}
                    </p>
                    {orch ? (
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{orch.name}</span>
                        <span className="truncate text-[length:var(--font-size-12)] text-muted-foreground">{orch.description}</span>
                        <div className="ml-auto flex items-center gap-2">
                          {!isActive && team.hasOrchestrator && (
                            <Button variant="ghost" size="xs" disabled={saving || !team.enabled} onClick={() => void setActive(team.manifest.id)}>
                              {t("settings.teams.setActive")}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() =>
                              openSettingsPanel({
                                kind: "agent-orchestrator",
                                mode: team.writable ? "edit" : "customize-builtin",
                                orchestratorId: orch.id,
                                title: orch.name,
                              })
                            }
                          >
                            {team.writable ? t("settings.agent.edit") : t("settings.agent.customize")}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[length:var(--font-size-12)] text-muted-foreground">{t("settings.teams.noLeadCapability")}</p>
                    )}
                  </div>

                  {/* Roster */}
                  {orch && (
                      <div>
                        <p className="mb-1.5 text-[length:var(--font-size-11)] font-medium uppercase tracking-wide text-muted-foreground">
                          {t("settings.teams.rosterTitle")}
                        </p>
                        <RosterEditor
                          roster={roster ?? null}
                          subagents={subagents}
                          teamId={team.manifest.id}
                          onChange={(spec) => {
                            if (!projectRoot) return;
                            void window.electronAPI.teamsSaveAssetOverride(
                              projectRoot,
                              orch.fqid,
                              { allowedExperts: spec.mode === "all" ? undefined : spec.members },
                              "project",
                            ).then(() => loadRoster(team.manifest.id));
                          }}
                        />
                      </div>
                    )}

                  {/* This team's subagents */}
                  <div>
                    <p className="mb-1.5 text-[length:var(--font-size-11)] font-medium uppercase tracking-wide text-muted-foreground">
                      {t("settings.teams.teamSubagents")}
                    </p>
                    <p className="mb-1.5 text-[length:var(--font-size-11)] text-muted-foreground">
                      {t("settings.teams.teamSubagentsDesc")}
                    </p>
                    {teamSubagents.length === 0 ? (
                      <p className="text-[length:var(--font-size-12)] text-muted-foreground">{t("settings.teams.noSubagents")}</p>
                    ) : (
                      teamSubagents.map((s) => (
                        <div key={s.fqid} className="flex items-center gap-2 py-1">
                          <span className={cn("truncate text-[length:var(--font-size-13)]", !s.enabled && "text-muted-foreground")}>{s.name}</span>
                          {s.blockedBy && <BlockedHint blockedBy={s.blockedBy} teamName={s.origin.teamName} />}
                          <div className="ml-auto flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() =>
                                openSettingsPanel({
                                  kind: "agent-expert",
                                  mode: team.writable ? "edit" : "customize-builtin",
                                  expertId: s.id,
                                  title: s.name,
                                })
                              }
                            >
                              {team.writable ? t("settings.agent.edit") : t("settings.agent.customize")}
                            </Button>
                            <Switch
                              checked={s.enabled}
                              disabled={!team.enabled}
                              onCheckedChange={(v) => void setAssetEnabled(s.fqid, v)}
                              aria-label={s.name}
                            />
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Capabilities summary */}
                  <div>
                    <p className="mb-1.5 text-[length:var(--font-size-11)] font-medium uppercase tracking-wide text-muted-foreground">
                      {t("settings.teams.capabilities")}
                    </p>
                    <p className="text-[length:var(--font-size-12)] text-muted-foreground">
                      {t("settings.teams.capabilitiesSummary", {
                        skills: team.counts.skill,
                        commands: team.counts.command,
                        mcps: team.counts.mcp,
                      })}
                    </p>
                  </div>

                  {/* Team settings: scope */}
                  <div className="border-t border-border pt-3">
                    <div className="flex items-center gap-2 text-[length:var(--font-size-13)]">
                      <span className="text-muted-foreground">{t("settings.teams.scopeLabel")}</span>
                      <ScopeChip scope={team.scope} />
                      <span className="text-[length:var(--font-size-12)] text-muted-foreground">
                        {team.scope === "app" ? t("settings.teams.scope.appDesc") : t("settings.teams.scope.projectDesc")}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
