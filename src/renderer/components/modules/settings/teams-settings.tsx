// Settings → Teams — built on the app's design system (SETTINGS_CARD/ROW
// tokens + shadcn controls + InlineDeleteButton). Restores ALL pre-T5 features
// (new Orchestrator/Expert, Reset builtin, Info→team-detail, inline delete)
// while adding the new model (active team, roster, scope, tri-state override).
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  BotIcon, ChevronDownIcon, ChevronRightIcon, InfoIcon,
  PlusIcon, RotateCcwIcon, StoreIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useDocumentStore } from "@/stores/document-store";
import { useLayoutStore } from "@/stores/layout-store";
import { useProLicenseStore } from "@/stores/pro-license-store";
import { useChatStore } from "@/stores/chat-store";
import { useTeamsStore, type TeamCardView } from "@/stores/teams-store";
import { openSettingsPanel } from "@/stores/settings-panel-store";
import { useOnSettingsEditorKindsClosed } from "@/hooks/use-settings-editor";
import { useInlineDeleteConfirm } from "@/hooks/use-inline-delete-confirm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  SETTINGS_CARD as CARD,
  SETTINGS_ROW as ROW,
  SETTINGS_ROW_DESC as ROW_DESC,
  SETTINGS_ROW_LABEL as ROW_LABEL,
  SETTINGS_CATEGORY_HEADER as CATEGORY_HEADER,
} from "./settings-tokens";
import { InlineDeleteButton } from "./inline-delete-button";
import { PackIcon } from "../teams/team-icon";
import { ScopeChip } from "../teams/scope-chip";
import { OriginChip } from "../teams/origin-chip";
import { OverrideDot } from "../teams/override-dot";
import { BlockedHint } from "../teams/blocked-hint";
import { RosterEditor } from "../teams/roster-editor";
import type { AssetViewV2, RosterView } from "@shared/teams/view";
import { CORE_TEAM_ID, PROJECT_DEFAULT_TEAM_ID } from "@shared/teams/types";

const BADGE =
  "inline-flex items-center rounded px-1.5 py-0.5 text-[length:var(--font-size-10)] font-medium uppercase tracking-wide shrink-0";
const BUILTIN_EXPERTS_RESET_ID = "builtin-experts-reset";

function packIdOf(fqid: string): string {
  const idx = fqid.indexOf(":");
  return idx > 0 ? fqid.slice(0, idx) : PROJECT_DEFAULT_TEAM_ID;
}

function groupLabel(teamId: string, pack: TeamCardView | undefined, t: TFunction): string {
  if (teamId === CORE_TEAM_ID) return t("settings.teamsAgents.coreTeam");
  if (teamId === PROJECT_DEFAULT_TEAM_ID) return pack?.manifest.name ?? t("settings.teams.scope.project");
  return pack?.manifest.name ?? teamId;
}

function sortAssets(list: AssetViewV2[]): AssetViewV2[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name));
}

interface TeamGroup {
  teamId: string;
  label: string;
  orchestrators: AssetViewV2[];
  experts: AssetViewV2[];
}

export function TeamsAgentsSettings() {
  const { t } = useTranslation();
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const license = useProLicenseStore((s) => s.license);
  const catalog = useTeamsStore((s) => s.catalog);

  const [experts, setExperts] = useState<AssetViewV2[]>([]);
  const [orchestrators, setOrchestrators] = useState<AssetViewV2[]>([]);
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const [rosters, setRosters] = useState<Record<string, RosterView | null>>({});
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [teamDesc, setTeamDesc] = useState("");
  const [teamScope, setTeamScope] = useState<"app" | "project">("project");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [coreState, setCoreState] = useState<{
    coreSubagentDisabledCount: number; coreSubagentOverrideCount: number;
  } | null>(null);
  const rowDeleteConfirm = useInlineDeleteConfirm();
  const expertResetConfirm = useInlineDeleteConfirm();

  const packs = useMemo(
    () => catalog.filter((p) =>
      p.installed
      && (
        p.manifest.id !== PROJECT_DEFAULT_TEAM_ID
        || Object.values(p.counts).some((count) => count > 0)
      ),
    ),
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
        setExperts([]); setOrchestrators([]); setActiveTeamId(null);
        setRosters({}); setCoreState(null);
        useTeamsStore.getState().clear();
        return;
      }
      if (!options?.silent) setLoading(true);
      try {
        const [expertList, orchestratorList, active, cs] = await Promise.all([
          window.electronAPI.teamsListAssets(projectRoot, "subagent"),
          window.electronAPI.teamsListAssets(projectRoot, "orchestrator"),
          window.electronAPI.teamsGetActiveTeam(projectRoot),
          window.electronAPI.teamsGetCoreState(projectRoot),
          useTeamsStore.getState().load(projectRoot, { force: true }),
        ]);
        setExperts(sortAssets(expertList));
        setOrchestrators(sortAssets(orchestratorList));
        setActiveTeamId(active?.manifest.id ?? null);
        setCoreState(cs);
      } catch {
        setExperts([]); setOrchestrators([]);
      } finally {
        if (!options?.silent) setLoading(false);
      }
    },
    [projectRoot],
  );

  useEffect(() => { void loadAll(); }, [loadAll, license]);

  useOnSettingsEditorKindsClosed(
    ["agent-expert", "agent-orchestrator", "team-detail"],
    () => { void loadAll({ silent: true }); },
  );

  const loadRoster = useCallback(async (teamId: string) => {
    if (!projectRoot) return;
    try {
      const roster = await window.electronAPI.teamsGetRoster(projectRoot, teamId);
      setRosters((prev) => ({ ...prev, [teamId]: roster }));
    } catch { /* non-fatal */ }
  }, [projectRoot]);

  const teamGroups = useMemo<TeamGroup[]>(() => {
    const orch = new Map<string, AssetViewV2[]>();
    for (const o of orchestrators) {
      const pid = packIdOf(o.fqid);
      const list = orch.get(pid) ?? [];
      list.push(o); orch.set(pid, list);
    }
    const exp = new Map<string, AssetViewV2[]>();
    for (const e of experts) {
      const pid = packIdOf(e.fqid);
      const list = exp.get(pid) ?? [];
      list.push(e); exp.set(pid, list);
    }
    const pids = new Set<string>([...packs.map((p) => p.manifest.id)]);
    pids.add(CORE_TEAM_ID);
    for (const pid of [...orch.keys(), ...exp.keys()]) pids.add(pid);
    const rank = (pid: string) => (pid === CORE_TEAM_ID ? 0 : pid === PROJECT_DEFAULT_TEAM_ID ? 2 : 1);
    return [...pids].map((teamId) => ({
      teamId,
      label: groupLabel(teamId, packById.get(teamId), t),
      orchestrators: sortAssets(orch.get(teamId) ?? []),
      experts: sortAssets(exp.get(teamId) ?? []),
    })).sort((a, b) => rank(a.teamId) - rank(b.teamId) || a.label.localeCompare(b.label));
  }, [orchestrators, experts, packs, packById, t]);

  const openOrchestrator = (o: AssetViewV2) => {
    rowDeleteConfirm.clearPending();
    const team = packById.get(packIdOf(o.fqid));
    const builtin = !team?.writable;
    // Prefer FQID — bare o.id collides across teams ("orchestrator") and misses
    // the legacy facade's agentFileBase id (`teamId--id`).
    const ref = o.fqid || o.runtimeName || o.id;
    openSettingsPanel(builtin
      ? { kind: "agent-orchestrator", mode: "customize-builtin", orchestratorId: ref, title: o.name }
      : { kind: "agent-orchestrator", mode: "edit", orchestratorId: ref, title: o.name });
  };

  const openExpert = (e: AssetViewV2) => {
    rowDeleteConfirm.clearPending();
    const team = packById.get(packIdOf(e.fqid));
    const builtin = !team?.writable;
    const ref = e.fqid || e.runtimeName || e.id;
    openSettingsPanel(builtin
      ? { kind: "agent-expert", mode: "customize-builtin", expertId: ref, title: e.name }
      : { kind: "agent-expert", mode: "edit", expertId: ref, title: e.name });
  };

  const setActive = async (teamId: string) => {
    if (!projectRoot) return;
    setSaving(true);
    try {
      await window.electronAPI.teamsSetActiveTeam(projectRoot, teamId, "project");
      setActiveTeamId(teamId);
      await useTeamsStore.getState().load(projectRoot, { force: true });
      toast.success(t("settings.teams.toast.activeUpdated"));
    } catch (err) { toast.error(err instanceof Error ? err.message : String(err)); }
    finally { setSaving(false); }
  };

  const setTeamEnabled = async (team: TeamCardView, enabled: boolean) => {
    if (!projectRoot) return;
    try {
      await window.electronAPI.teamsSetEnabled(projectRoot, team.manifest.id, enabled, "project");
      await loadAll();
    } catch (err) { toast.error(err instanceof Error ? err.message : String(err)); }
  };

  const toggleExpertEnabled = async (expert: AssetViewV2, enabled: boolean) => {
    if (!projectRoot) return;
    const prev = experts;
    setExperts((cur) => sortAssets(cur.map((e) => (e.fqid === expert.fqid ? { ...e, enabled } : e))));
    try {
      await window.electronAPI.teamsSetAssetEnabled(projectRoot, expert.fqid, enabled, "project");
      await loadAll({ silent: true });
    } catch (err) {
      setExperts(prev);
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const resetBuiltinExperts = async () => {
    if (!projectRoot) return;
    setSaving(true);
    try {
      await window.electronAPI.teamsResetCoreDefaults(projectRoot, "subagent");
      await loadAll({ silent: true });
      expertResetConfirm.clearPending();
    } finally { setSaving(false); }
  };

  const createTeam = async () => {
    if (!projectRoot || !teamName.trim()) return;
    setSaving(true);
    try {
      await window.electronAPI.teamsCreate(teamName.trim(), teamDesc.trim(), teamScope, projectRoot);
      setTeamName(""); setTeamDesc(""); setCreatingTeam(false);
      toast.success(t("settings.teamsAgents.teamCreated"));
      await loadAll({ silent: true });
    } catch (err) { toast.error(String(err instanceof Error ? err.message : err)); }
    finally { setSaving(false); }
  };

  const deleteOrchestrator = async (id: string) => {
    if (!projectRoot) return;
    setSaving(true);
    try {
      await window.electronAPI.orchestratorsDeleteCustom(projectRoot, id);
      await loadAll();
      toast.success(t("settings.agent.toast.orchestratorDeleted"));
    } catch (err) { toast.error(err instanceof Error ? err.message : t("settings.agent.toast.deleteFailed")); }
    finally { setSaving(false); }
  };

  const deleteExpert = async (id: string) => {
    if (!projectRoot) return;
    setSaving(true);
    try {
      await window.electronAPI.subagentsDeleteCustom(projectRoot, id);
      await loadAll();
      toast.success(t("settings.agent.toast.expertDeleted"));
    } catch (err) { toast.error(err instanceof Error ? err.message : t("settings.agent.toast.deleteFailed")); }
    finally { setSaving(false); }
  };

  const expertsBuiltinsModified = !!coreState &&
    (coreState.coreSubagentDisabledCount > 0 || coreState.coreSubagentOverrideCount > 0);

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-8 py-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[length:var(--font-dialog-title)] font-semibold">{t("settings.teams.title")}</h2>
            <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">{t("settings.teams.pageDesc")}</p>
          </div>
          {projectRoot && (
            <Button variant="outline" size="xs" className="shrink-0" onClick={() => useLayoutStore.getState().setLeftSidebarView("teams")}>
              <StoreIcon className="size-3 mr-1" />{t("settings.teams.browse")}
            </Button>
          )}
        </div>

        {!projectRoot ? (
          <div className={cn(CARD, "!divide-y-0")}>
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <BotIcon className="size-8 text-muted-foreground/30" />
              <p className="text-[length:var(--font-size-13)] text-muted-foreground">{t("settings.teamsAgents.noProject")}</p>
            </div>
          </div>
        ) : (
          <>
            {activeTeamId && packById.get(activeTeamId) && (
              <div>
                <h3 className={CATEGORY_HEADER}>{t("settings.teams.activeTeam")}</h3>
                <div className={cn(CARD, "!divide-y-0")}>
                  <div className="flex items-center gap-3 py-2.5 px-1">
                    <PackIcon size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={ROW_LABEL}>{packById.get(activeTeamId)?.manifest.name}</span>
                        <ScopeChip scope={packById.get(activeTeamId)?.scope ?? "app"} />
                        <OriginChip source={packById.get(activeTeamId)?.source ?? "core"} tier={packById.get(activeTeamId)?.manifest.tier} />
                      </div>
                      <p className={ROW_DESC}>{(() => { const orch = orchestrators.find((o) => packIdOf(o.fqid) === activeTeamId); return orch ? orch.name : t("settings.teams.noLead"); })()}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Button variant="outline" size="xs" disabled={saving} onClick={() => setCreatingTeam((v) => !v)}>
                  <PlusIcon className="size-3 mr-1" />{t("settings.teams.createTeam")}
                </Button>
                <Button variant="outline" size="xs" disabled={saving} onClick={() => openSettingsPanel({ kind: "agent-orchestrator", mode: "new" })}>
                  <PlusIcon className="size-3 mr-1" />{t("settings.agent.newOrchestrator")}
                </Button>
                <Button variant="outline" size="xs" disabled={saving} onClick={() => openSettingsPanel({ kind: "agent-expert", mode: "new" })}>
                  <PlusIcon className="size-3 mr-1" />{t("settings.agent.newExpert")}
                </Button>
              </div>
              {expertResetConfirm.isPending(BUILTIN_EXPERTS_RESET_ID) ? (
                <Button variant="destructive" size="xs" disabled={saving} onClick={() => void resetBuiltinExperts()}>
                  {t("settings.teamsAgents.confirmReset")}
                </Button>
              ) : (
                <Button variant="ghost" size="xs" className="text-muted-foreground" disabled={saving || !expertsBuiltinsModified}
                  onClick={() => expertResetConfirm.setPendingId(BUILTIN_EXPERTS_RESET_ID)}>
                  <RotateCcwIcon className="size-3 mr-1" />{t("settings.teamsAgents.reset")}
                </Button>
              )}
            </div>

            {creatingTeam && (
              <div className={cn(CARD, "!divide-y-0")}>
                <div className="flex flex-col gap-2 py-2.5">
                  <Input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder={t("settings.teamsAgents.teamNamePlaceholder")} className="h-8 text-[length:var(--font-size-12)]" autoFocus />
                  <Input value={teamDesc} onChange={(e) => setTeamDesc(e.target.value)} placeholder={t("settings.teamsAgents.teamDescPlaceholder")} className="h-8 text-[length:var(--font-size-12)]" />
                  <div className="flex gap-1">
                    <Button size="xs" variant={teamScope === "project" ? "secondary" : "ghost"} onClick={() => setTeamScope("project")}>
                      {t("settings.teams.scope.project")}
                    </Button>
                    <Button size="xs" variant={teamScope === "app" ? "secondary" : "ghost"} onClick={() => setTeamScope("app")}>
                      {t("settings.teams.scope.app")}
                    </Button>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button size="xs" variant="ghost" disabled={saving} onClick={() => { setCreatingTeam(false); setTeamName(""); setTeamDesc(""); }}>{t("settings.teamsAgents.cancel")}</Button>
                    <Button size="xs" disabled={saving || !teamName.trim()} onClick={() => void createTeam()}>{t("settings.teams.createTeam")}</Button>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {loading ? (
                <div className={cn(CARD, "py-3 text-[length:var(--font-size-12)] text-muted-foreground")}>{t("common.loading")}</div>
              ) : teamGroups.length === 0 ? (
                <div className={cn(CARD, "!divide-y-0")}>
                  <div className="flex flex-col items-center gap-3 py-10 text-center">
                    <BotIcon className="size-8 text-muted-foreground/30" />
                    <p className="text-[length:var(--font-size-13)] text-muted-foreground">{t("settings.teamsAgents.emptyTeamCards")}</p>
                  </div>
                </div>
              ) : (
                teamGroups.map((group) => {
                  const isCore = group.teamId === CORE_TEAM_ID;
                  const groupPack = packById.get(group.teamId);
                  const isOpen = expandedCard === group.teamId;
                  const isActive = group.teamId === activeTeamId;
                  const projectEnabled = groupPack ? groupPack.enabled : true;
                  const overridden = groupPack ? (groupPack.enabledProject !== undefined && groupPack.enabledProject !== groupPack.enabledApp) : false;
                  return (
                    <div key={group.teamId} className={cn(CARD, "!divide-y-0 overflow-hidden", !projectEnabled && "opacity-60")}>
                      <div className="flex items-center gap-1 py-2.5 pl-2 pr-2">
                        <button type="button" className="flex flex-1 min-w-0 items-center gap-2 py-1 text-left"
                          onClick={() => { const next = isOpen ? null : group.teamId; setExpandedCard(next); if (next) void loadRoster(next); }}>
                          <span className="shrink-0 text-muted-foreground">{isOpen ? <ChevronDownIcon className="size-4" /> : <ChevronRightIcon className="size-4" />}</span>
                          <PackIcon size="sm" />
                          <span className={cn(ROW_LABEL, "truncate")}>{group.label}</span>
                          {groupPack && <ScopeChip scope={groupPack.scope} />}
                          {groupPack && <OriginChip source={groupPack.source} tier={groupPack.manifest.tier} />}
                          {groupPack?.manifest.publisher === "user" && <Badge variant="outline" className="h-4.5 px-1 text-[length:var(--font-size-10)] shrink-0">{t("settings.teamsAgents.myTeam")}</Badge>}
                          {isActive && <span className={cn(BADGE, "shrink-0 bg-secondary text-secondary-foreground")}>{t("settings.teams.card.active")}</span>}
                          <OverrideDot overridden={overridden} appValue={groupPack?.enabledApp}
                            onReset={() => void window.electronAPI.teamsSetEnabled(projectRoot, group.teamId, null, "project").then(() => loadAll())} />
                        </button>
                        <Button variant="ghost" size="icon" className="size-7 shrink-0" title={t("settings.teamsAgents.viewDetails")}
                          onClick={() => openSettingsPanel({ kind: "team-detail", teamId: group.teamId, title: group.label })}>
                          <InfoIcon className="size-3.5" />
                        </Button>
                        {!isCore && groupPack && (
                          <Switch checked={groupPack.enabled} disabled={saving} onCheckedChange={(v) => void setTeamEnabled(groupPack, v)} aria-label={group.label} />
                        )}
                      </div>

                      {isOpen && (
                        <div className="border-t border-border">
                          {group.orchestrators.length === 0 && group.experts.length === 0 && (
                            <p className="px-3 py-3 text-[length:var(--font-size-12)] text-muted-foreground">{t("settings.teamsAgents.teamEmptyAgentsHint")}</p>
                          )}
                          {group.orchestrators.length > 0 && (
                            <div>
                              <p className="px-3 pt-3 pb-1 text-[length:var(--font-hint)] uppercase tracking-wider text-muted-foreground/60">{t("settings.teamsAgents.kinds.orchestrator")}</p>
                              <div className="divide-y divide-border">
                                {group.orchestrators.map((o) => (
                                  <div key={o.fqid} className={cn(ROW, "px-3")}>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className={ROW_LABEL}>{o.name}</span>
                                        {isActive && packIdOf(o.fqid) === activeTeamId && <span className={cn(BADGE, "shrink-0 bg-secondary text-secondary-foreground")}>{t("settings.teamsAgents.default")}</span>}
                                      </div>
                                      <p className={ROW_DESC}>{o.description}</p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      {!isActive || packIdOf(o.fqid) !== activeTeamId ? (
                                        <Button variant="ghost" size="xs" disabled={saving || !o.enabled} onClick={() => void setActive(group.teamId)}>{t("settings.teams.setActive")}</Button>
                                      ) : null}
                                      <Button variant="ghost" size="xs" disabled={saving} onClick={() => openOrchestrator(o)}>
                                        {packById.get(packIdOf(o.fqid))?.writable ? t("settings.agent.edit") : t("settings.agent.customize")}
                                      </Button>
                                      {o.editable && (
                                        <InlineDeleteButton itemId={`orch:${o.id}`} pending={rowDeleteConfirm.isPending(`orch:${o.id}`)} disabled={saving}
                                          onRequest={() => rowDeleteConfirm.setPendingId(`orch:${o.id}`)}
                                          onConfirm={() => void deleteOrchestrator(o.id)} />
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {group.orchestrators.length > 0 && rosters[group.teamId] && (
                            <div className="px-3 py-2 border-t divide-border">
                              <p className="text-[length:var(--font-hint)] uppercase tracking-wider text-muted-foreground/60 mb-1.5">{t("settings.teams.rosterTitle")}</p>
                              <RosterEditor roster={rosters[group.teamId]} subagents={experts} teamId={group.teamId}
                                onChange={(spec) => { if (!projectRoot) return; const orch = group.orchestrators[0]; if (orch) void window.electronAPI.teamsSaveAssetOverride(projectRoot, orch.fqid, { allowedExperts: spec.mode === "all" ? undefined : spec.members }, "project").then(() => loadRoster(group.teamId)); }} />
                            </div>
                          )}
                          {group.experts.length > 0 && (
                            <div>
                              <p className="px-3 pt-3 pb-1 text-[length:var(--font-hint)] uppercase tracking-wider text-muted-foreground/60">{t("settings.teamsAgents.kinds.expert")}</p>
                              <div className="divide-y divide-border pb-1">
                                {group.experts.map((e) => (
                                  <div key={e.fqid} className={cn(ROW, "px-3")}>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className={ROW_LABEL}>{e.name}</span>
                                      </div>
                                      <p className={ROW_DESC}>{e.description}</p>
                                      {e.blockedBy && <BlockedHint blockedBy={e.blockedBy} teamName={e.origin.teamName} />}
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      {packById.get(packIdOf(e.fqid))?.source === "core" && (
                                        <Switch checked={e.enabled} onCheckedChange={(v) => void toggleExpertEnabled(e, v)} aria-label={e.name} />
                                      )}
                                      <Button variant="ghost" size="xs" disabled={saving} onClick={() => openExpert(e)}>
                                        {packById.get(packIdOf(e.fqid))?.writable ? t("settings.agent.edit") : t("settings.agent.customize")}
                                      </Button>
                                      {e.editable && (
                                        <InlineDeleteButton itemId={`exp:${e.id}`} pending={rowDeleteConfirm.isPending(`exp:${e.id}`)} disabled={saving}
                                          onRequest={() => rowDeleteConfirm.setPendingId(`exp:${e.id}`)}
                                          onConfirm={() => void deleteExpert(e.id)} />
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
