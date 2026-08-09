// Settings → Teams & Agents (merged page, layering spec §6).
// A single unified card list — every installed pack / user team / My Content
// is one card: click the header to expand its main agents + experts (each row
// opens the right-side editor panel), and click the info button to open the
// pack detail panel (meta + content inventory + uninstall).
// A card is greyed out (opacity) when the pack is NOT enabled in this project
// — still clickable and inspectable, just visually muted as a project-scope
// indicator. Per-project enable/disable of agents, skills and commands lives in
// those pages; app-level uninstall lives in the pack detail panel.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  BotIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  InfoIcon,
  PlusIcon,
  RotateCcwIcon,
  StoreIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useDocumentStore } from "@/stores/document-store";
import { useLayoutStore } from "@/stores/layout-store";
import { useProLicenseStore } from "@/stores/pro-license-store";
import { usePacksStore } from "@/stores/packs-store";
import { openSettingsPanel } from "@/stores/settings-panel-store";
import { useOnSettingsEditorKindsClosed } from "@/hooks/use-settings-editor";
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
import { useInlineDeleteConfirm } from "@/hooks/use-inline-delete-confirm";
import { InlineDeleteButton } from "./inline-delete-button";
import { PackIcon } from "../teams/pack-icon";
import type { ExpertInfo, OrchestratorInfo } from "@shared/agent-experts";
import type { BadgeInfo, ProjectPackView } from "@shared/packs/types";
import { CORE_PACK_ID, LOCAL_PACK_ID } from "@shared/packs/types";

interface CoreState {
  coreExpertDisabledCount: number;
  coreExpertOverrideCount: number;
}

const BADGE =
  "inline-flex items-center rounded px-1.5 py-0.5 text-[length:var(--font-size-10)] font-medium uppercase tracking-wide shrink-0";
const BUILTIN_EXPERTS_RESET_ID = "builtin-experts-reset";

function expertBundleSummary(expert: ExpertInfo, t: TFunction): string {
  const parts: string[] = [];
  if (expert.model) parts.push(t("settings.agent.summary.customModel"));
  if (expert.effectiveModules?.length) {
    parts.push(
      t("settings.agent.summary.activeModules", { count: expert.effectiveModules.length }),
    );
  }
  return parts.length > 0 ? parts.join(" · ") : t("settings.agent.summary.standardExpert");
}

function orchestratorBundleSummary(orchestrator: OrchestratorInfo, t: TFunction): string {
  const parts: string[] = [];
  if (orchestrator.model) parts.push(t("settings.agent.summary.customModel"));
  if (orchestrator.allowedExperts?.length) {
    parts.push(
      t("settings.agent.summary.allowedExperts", { count: orchestrator.allowedExperts.length }),
    );
  }
  if (orchestrator.effectiveModules?.length) {
    parts.push(
      t("settings.agent.summary.modules", { count: orchestrator.effectiveModules.length }),
    );
  }
  return parts.length > 0
    ? parts.join(" · ")
    : t("settings.agent.summary.standardOrchestrator");
}

function sortExperts(experts: ExpertInfo[]): ExpertInfo[] {
  return [...experts].sort((a, b) => {
    if (a.builtin !== b.builtin) return a.builtin ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

function sortOrchestrators(orchestrators: OrchestratorInfo[]): OrchestratorInfo[] {
  return [...orchestrators].sort((a, b) => a.name.localeCompare(b.name));
}

function expertsBuiltinsModified(coreState: CoreState | null): boolean {
  if (!coreState) return false;
  return coreState.coreExpertDisabledCount + coreState.coreExpertOverrideCount > 0;
}

/** Origin badge: core pack → "Built-in"; other packs → their pack name. */
function renderBadge(badge: BadgeInfo | null | undefined, t: TFunction) {
  if (!badge) return null;
  if (badge.packId === CORE_PACK_ID) {
    return (
      <span className={cn(BADGE, "bg-muted text-muted-foreground")}>
        {t("settings.agent.builtin")}
      </span>
    );
  }
  return <span className={cn(BADGE, "bg-muted text-muted-foreground")}>{badge.packName}</span>;
}

/** Derive a content item's owning pack id from its fqid (`packId:contentId`). */
function packIdOf(fqid?: string): string {
  const pid = fqid?.split(":")[0];
  return pid && pid.length > 0 ? pid : LOCAL_PACK_ID;
}

interface TeamGroup {
  packId: string;
  label: string;
  orchestrators: OrchestratorInfo[];
  experts: ExpertInfo[];
}

export function TeamsAgentsSettings() {
  const { t } = useTranslation();
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const license = useProLicenseStore((s) => s.license);

  // Project-first when a project is open (workspace mental model); fall back
  // to the app tab when there is no project to show.
  const [experts, setExperts] = useState<ExpertInfo[]>([]);
  const [orchestrators, setOrchestrators] = useState<OrchestratorInfo[]>([]);
  const [defaultOrchestratorFqid, setDefaultOrchestratorFqid] = useState<string | null>(null);
  const [coreState, setCoreState] = useState<CoreState | null>(null);
  const [badges, setBadges] = useState<Record<string, BadgeInfo | null>>({});
  // Shared packs catalog: the detail panel flips `enabled` in this store, so
  // the card list greys out / restores in real time (no close-to-refresh).
  const catalog = usePacksStore((s) => s.catalog);
  // Card set = installed app-level packs (core + installed), Local Pack aside
  // (teamGroups adds it back as its own card).
  const packs = useMemo(
    () => catalog.filter((p) => p.installed && p.kind !== "local"),
    [catalog],
  );
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [teamDesc, setTeamDesc] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const rowDeleteConfirm = useInlineDeleteConfirm();
  const expertResetConfirm = useInlineDeleteConfirm();

  const loadBadges = useCallback(
    async (projectRootArg: string, items: Array<{ fqid?: string; id: string }>) => {
      const entries = await Promise.all(
        items.map(async (item) => {
          const key = item.fqid ?? item.id;
          const badge = await window.electronAPI.packsResolveBadge(projectRootArg, key);
          return [key, badge] as const;
        }),
      );
      setBadges(Object.fromEntries(entries));
    },
    [],
  );

  const loadAll = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!projectRoot) {
        setExperts([]);
        setOrchestrators([]);
        setDefaultOrchestratorFqid(null);
        setCoreState(null);
        setBadges({});
        usePacksStore.getState().clear();
        return;
      }
      if (!options?.silent) setLoading(true);
      try {
        const [expertList, orchestratorList, coreStateResult] = await Promise.all([
          window.electronAPI.expertsList(projectRoot),
          window.electronAPI.orchestratorsList(projectRoot),
          window.electronAPI.packsGetCoreState(projectRoot),
        ]);
        await usePacksStore.getState().load(projectRoot, { force: true });
        setExperts(sortExperts(expertList));
        setOrchestrators(sortOrchestrators(orchestratorList));
        setCoreState(coreStateResult);
        setDefaultOrchestratorFqid(coreStateResult.defaultOrchestratorFqid ?? null);
        // Unified card list: app-level installed packs (core + installed) feed
        // the card set; the project-scoped Local Pack stays out of `packs`
        // (teamGroups adds it back as its own card).
        await loadBadges(projectRoot, [
          ...expertList.map((e) => ({ fqid: e.fqid, id: e.id })),
          ...orchestratorList.map((o) => ({ fqid: o.fqid, id: o.id })),
        ]);
      } catch {
        setExperts([]);
        setOrchestrators([]);
        setCoreState(null);
        setBadges({});
        usePacksStore.getState().clear();
      } finally {
        if (!options?.silent) setLoading(false);
      }
    },
    [projectRoot, loadBadges],
  );

  useEffect(() => {
    void loadAll();
  }, [loadAll, license]);

  useOnSettingsEditorKindsClosed(
    ["agent-expert", "agent-orchestrator", "pack-detail"],
    () => {
      void loadAll({ silent: true });
    },
  );

  const packById = useMemo(() => {
    const map = new Map<string, ProjectPackView>();
    for (const p of packs) map.set(p.manifest.id, p);
    return map;
  }, [packs]);

  // One card per team. The card set comes from the INSTALLED packs (core +
  // app-level installed packs + the project-scoped Local Pack), NOT from
  // "packs that happen to have agents" — otherwise a freshly installed pack
  // without agents would be invisible in the project tab. Group each pack's
  // orchestrators and experts under it (core first, packs alphabetically,
  // "Mine" last).
  const teamGroups = useMemo<TeamGroup[]>(() => {
    const orch = new Map<string, OrchestratorInfo[]>();
    for (const o of orchestrators) {
      const pid = packIdOf(o.fqid);
      const list = orch.get(pid) ?? [];
      list.push(o);
      orch.set(pid, list);
    }
    const exp = new Map<string, ExpertInfo[]>();
    for (const e of experts) {
      const pid = packIdOf(e.fqid);
      const list = exp.get(pid) ?? [];
      list.push(e);
      exp.set(pid, list);
    }
    // Every installed pack gets a card: core, app-level installed packs, and
    // the project-scoped Local Pack (My Content).
    const pids = new Set<string>([...packs.map((p) => p.manifest.id)]);
    pids.add(CORE_PACK_ID);
    pids.add(LOCAL_PACK_ID);
    // Safety net: packs that provide agents but somehow missed `packs`.
    for (const pid of [...orch.keys(), ...exp.keys()]) pids.add(pid);
    const rank = (pid: string) => (pid === CORE_PACK_ID ? 0 : pid === LOCAL_PACK_ID ? 2 : 1);
    return [...pids]
      .map((packId) => ({
        packId,
        label: groupLabel(packId, badges, packById, t),
        orchestrators: sortOrchestrators(orch.get(packId) ?? []),
        experts: sortExperts(exp.get(packId) ?? []),
      }))
      .sort((a, b) => rank(a.packId) - rank(b.packId) || a.label.localeCompare(b.label));
  }, [orchestrators, experts, badges, packById, t]);

  const openOrchestrator = (orchestrator: OrchestratorInfo) => {
    rowDeleteConfirm.clearPending();
    openSettingsPanel(
      orchestrator.builtin
        ? {
            kind: "agent-orchestrator",
            mode: "customize-builtin",
            orchestratorId: orchestrator.id,
            title: orchestrator.name,
          }
        : {
            kind: "agent-orchestrator",
            mode: "edit",
            orchestratorId: orchestrator.id,
            title: orchestrator.name,
          },
    );
  };

  const openExpert = (expert: ExpertInfo) => {
    openSettingsPanel(
      expert.builtin
        ? {
            kind: "agent-expert",
            mode: "customize-builtin",
            expertId: expert.id,
            title: expert.name,
          }
        : {
            kind: "agent-expert",
            mode: "edit",
            expertId: expert.id,
            title: expert.name,
          },
    );
  };

  const setDefault = async (orchestrator: OrchestratorInfo) => {
    if (!projectRoot || !orchestrator.fqid) return;
    setSaving(true);
    try {
      await window.electronAPI.packsSetDefaultOrchestrator(projectRoot, orchestrator.fqid);
      setDefaultOrchestratorFqid(orchestrator.fqid ?? null);
      toast.success(t("settings.agent.toast.defaultOrchestratorUpdated"));
    } catch (err: unknown) {
      toast.error(
        err instanceof Error && /not active/i.test(err.message)
          ? t("settings.teamsAgents.setDefaultNotActive")
          : err instanceof Error
            ? err.message
            : t("settings.agent.toast.defaultOrchestratorFailed"),
      );
    } finally {
      setSaving(false);
    }
  };

  // Create / delete user teams (app-level, like installed teams).
  const createTeam = async () => {
    if (!teamName.trim()) return;
    setSaving(true);
    try {
      await window.electronAPI.userPacksCreate(teamName.trim(), teamDesc.trim());
      setTeamName("");
      setTeamDesc("");
      setCreatingTeam(false);
      toast.success(t("settings.teamsAgents.teamCreated"));
      await loadAll({ silent: true });
    } catch (err) {
      toast.error(String(err instanceof Error ? err.message : err));
    } finally {
      setSaving(false);
    }
  };

  const toggleExpertEnabled = async (expert: ExpertInfo, enabled: boolean) => {
    if (!projectRoot || !expert.fqid) return;
    const prev = experts;
    setExperts((current) =>
      sortExperts(current.map((e) => (e.id === expert.id ? { ...e, enabled } : e))),
    );
    try {
      await window.electronAPI.packsSetContentEnabled(projectRoot, expert.fqid, enabled);
      const [nextExperts, coreStateResult] = await Promise.all([
        window.electronAPI.expertsList(projectRoot),
        window.electronAPI.packsGetCoreState(projectRoot),
      ]);
      setExperts(sortExperts(nextExperts));
      setCoreState(coreStateResult);
    } catch (err: unknown) {
      setExperts(prev);
      toast.error(
        err instanceof Error ? err.message : t("settings.agent.toast.updateExpertFailed"),
      );
    }
  };

  const resetBuiltinExperts = async () => {
    if (!projectRoot) return;
    setSaving(true);
    try {
      await window.electronAPI.packsResetCoreDefaults(projectRoot, "expert");
      await loadAll({ silent: true });
      expertResetConfirm.clearPending();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-8 py-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[length:var(--font-dialog-title)] font-semibold">
              {t("settings.teamsAgents.title")}
            </h2>
            <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">
              {t("settings.teamsAgents.pageDesc")}
            </p>
          </div>
          {projectRoot && (
            <Button
              variant="outline"
              size="xs"
              className="shrink-0"
              onClick={() => useLayoutStore.getState().setLeftSidebarView("teams")}
            >
              <StoreIcon className="size-3 mr-1" />
              {t("settings.teamsAgents.browse")}
            </Button>
          )}
        </div>

        {!projectRoot ? (
          <div className={cn(CARD, "!divide-y-0")}>
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <BotIcon className="size-8 text-muted-foreground/30" />
              <p className="text-[length:var(--font-size-13)] text-muted-foreground">
                {t("settings.teamsAgents.noProject")}
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* 顶部工具栏 */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="xs"
                  disabled={saving}
                  onClick={() => setCreatingTeam((v) => !v)}
                >
                  <PlusIcon className="size-3 mr-1" />
                  {t("settings.teamsAgents.createTeam")}
                </Button>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => openSettingsPanel({ kind: "agent-orchestrator", mode: "new" })}
                  disabled={saving}
                >
                  <PlusIcon className="size-3 mr-1" />
                  {t("settings.agent.newOrchestrator")}
                </Button>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => openSettingsPanel({ kind: "agent-expert", mode: "new" })}
                  disabled={saving}
                >
                  <PlusIcon className="size-3 mr-1" />
                  {t("settings.agent.newExpert")}
                </Button>
              </div>
                {expertResetConfirm.isPending(BUILTIN_EXPERTS_RESET_ID) ? (
                  <Button variant="destructive" size="xs" disabled={saving} onClick={() => void resetBuiltinExperts()}>
                    {t("settings.teamsAgents.confirmReset")}
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="xs"
                    className="text-muted-foreground"
                    disabled={saving || !expertsBuiltinsModified(coreState)}
                    onClick={() => expertResetConfirm.setPendingId(BUILTIN_EXPERTS_RESET_ID)}
                  >
                    <RotateCcwIcon className="size-3 mr-1" />
                    {t("settings.teamsAgents.reset")}
                  </Button>
                )}
              </div>

              {creatingTeam && (
                <div className={cn(CARD, "!divide-y-0")}>
                  <div className="flex flex-col gap-2 py-2.5">
                    <Input
                      value={teamName}
                      onChange={(e) => setTeamName(e.target.value)}
                      placeholder={t("settings.teamsAgents.teamNamePlaceholder")}
                      className="h-8 text-[length:var(--font-size-12)]"
                      autoFocus
                    />
                    <Input
                      value={teamDesc}
                      onChange={(e) => setTeamDesc(e.target.value)}
                      placeholder={t("settings.teamsAgents.teamDescPlaceholder")}
                      className="h-8 text-[length:var(--font-size-12)]"
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        size="xs"
                        variant="ghost"
                        disabled={saving}
                        onClick={() => {
                          setCreatingTeam(false);
                          setTeamName("");
                          setTeamDesc("");
                        }}
                      >
                        {t("settings.teamsAgents.cancel")}
                      </Button>
                      <Button
                        size="xs"
                        disabled={saving || !teamName.trim()}
                        onClick={() => void createTeam()}
                      >
                        {t("settings.teamsAgents.createTeam")}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {loading ? (
                <div className={cn(CARD, "py-3 text-[length:var(--font-size-12)] text-muted-foreground")}>
                  {t("common.loading")}
                </div>
              ) : teamGroups.length === 0 ? (
                <div className={cn(CARD, "!divide-y-0")}>
                  <div className="flex flex-col items-center gap-3 py-10 text-center">
                    <BotIcon className="size-8 text-muted-foreground/30" />
                    <p className="text-[length:var(--font-size-13)] text-muted-foreground">
                      {t("settings.teamsAgents.emptyTeamCards")}
                    </p>
                  </div>
                </div>
              ) : (
                teamGroups.map((group) => {
                  const isCore = group.packId === CORE_PACK_ID;
                  const isLocal = group.packId === LOCAL_PACK_ID;
                  const groupPack = packById.get(group.packId);
                  const isOpen = expandedCard === group.packId;
                  const defaultMain = group.orchestrators.find(
                    (o) => (o.fqid ?? "") === (defaultOrchestratorFqid ?? ""),
                  );
                  const isUserTeam = groupPack?.manifest.publisher === "user";
                  const projectEnabled = groupPack ? groupPack.enabled : true;
                  return (
                    <div
                      key={group.packId}
                      className={cn(
                        CARD,
                        "!divide-y-0 overflow-hidden",
                        !projectEnabled && "opacity-60",
                      )}
                    >
                      {/* Card header — click to expand the team; info button opens detail */}
                      <div className="flex items-center gap-1 py-2.5 pl-2 pr-2">
                        <button
                          type="button"
                          className="flex flex-1 min-w-0 items-center gap-2 py-1 text-left"
                          onClick={() => setExpandedCard(isOpen ? null : group.packId)}
                        >
                          <span className="shrink-0 text-muted-foreground">
                            {isOpen ? (
                              <ChevronDownIcon className="size-4" />
                            ) : (
                              <ChevronRightIcon className="size-4" />
                            )}
                          </span>
                          <PackIcon size="sm" />
                          <span className={cn(ROW_LABEL, "truncate")}>{group.label}</span>
                          {groupPack?.manifest.tier === "pro" && (
                            <Badge variant="secondary" className="h-4.5 px-1 text-[length:var(--font-size-10)] shrink-0">
                              Pro
                            </Badge>
                          )}
                          {!isCore && !isLocal && groupPack && (
                            <Badge variant="outline" className="h-4.5 px-1 text-[length:var(--font-size-10)] shrink-0">
                              v{groupPack.manifest.version}
                            </Badge>
                          )}
                          {isUserTeam && (
                            <Badge variant="outline" className="h-4.5 px-1 text-[length:var(--font-size-10)] shrink-0">
                              {t("settings.teamsAgents.myTeam")}
                            </Badge>
                          )}
                          {defaultMain ? (
                            <span className={cn(BADGE, "shrink-0 bg-primary/10 text-primary")}>
                              {t("settings.teamsAgents.defaultMainAgent", {
                                name: defaultMain.name,
                              })}
                            </span>
                          ) : null}
                        </button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 shrink-0"
                          title={t("settings.teamsAgents.viewDetails")}
                          onClick={() =>
                            openSettingsPanel({
                              kind: "pack-detail",
                              packId: group.packId,
                              title: group.label,
                            })
                          }
                        >
                          <InfoIcon className="size-3.5" />
                        </Button>
                      </div>

                      {isOpen && (
                        <div className="border-t border-border/60">
                          {group.orchestrators.length === 0 && group.experts.length === 0 ? (
                            <p className="px-3 py-3 text-[length:var(--font-size-12)] text-muted-foreground">
                              {t("settings.teamsAgents.teamEmptyAgentsHint")}
                            </p>
                          ) : null}
                          {/* Main agents */}
                          {group.orchestrators.length > 0 && (                            <div>
                              <p className="px-3 pt-3 pb-1 text-[length:var(--font-hint)] uppercase tracking-wider text-muted-foreground/60">
                                {t("settings.teamsAgents.kinds.orchestrator")}
                              </p>
                              <div className="divide-y divide-border/60">
                                {group.orchestrators.map((orchestrator) => {
                                  const isDefault =
                                    (orchestrator.fqid ?? "") ===
                                    (defaultOrchestratorFqid ?? "");
                                  return (
                                    <div key={orchestrator.id} className={cn(ROW, "px-3")}>
                                      <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span className={ROW_LABEL}>{orchestrator.name}</span>
                                          {renderBadge(badges[orchestrator.fqid ?? orchestrator.id], t)}
                                          {isDefault ? (
                                            <span className={cn(BADGE, "bg-primary/10 text-primary")}>
                                              {t("settings.teamsAgents.default")}
                                            </span>
                                          ) : null}
                                        </div>
                                        <p className={ROW_DESC}>{orchestrator.description}</p>
                                        <p className="text-[length:var(--font-size-11)] text-muted-foreground/70 mt-0.5">
                                          {orchestratorBundleSummary(orchestrator, t)}
                                        </p>
                                      </div>
                                      <div className="flex items-center gap-2 shrink-0">
                                        {!isDefault ? (
                                          <Button
                                            variant="ghost"
                                            size="xs"
                                            disabled={saving || !orchestrator.enabled}
                                            title={
                                              !orchestrator.enabled
                                                ? t("settings.teamsAgents.setDefaultDisabledHint")
                                                : undefined
                                            }
                                            onClick={() => void setDefault(orchestrator)}
                                          >
                                            {t("settings.teamsAgents.setDefault")}
                                          </Button>
                                        ) : null}
                                        <Button
                                          variant="ghost"
                                          size="xs"
                                          disabled={saving}
                                          onClick={() => openOrchestrator(orchestrator)}
                                        >
                                          {orchestrator.builtin
                                            ? t("settings.agent.customize")
                                            : t("settings.agent.edit")}
                                        </Button>
                                        {orchestrator.removable ? (
                                          <InlineDeleteButton
                                            itemId={`orch:${orchestrator.id}`}
                                            pending={rowDeleteConfirm.isPending(`orch:${orchestrator.id}`)}
                                            disabled={saving}
                                            onRequest={() =>
                                              rowDeleteConfirm.setPendingId(`orch:${orchestrator.id}`)
                                            }
                                            onConfirm={() => {
                                              void (async () => {
                                                if (!projectRoot) return;
                                                setSaving(true);
                                                try {
                                                  await window.electronAPI.orchestratorsDeleteCustom(
                                                    projectRoot,
                                                    orchestrator.id,
                                                  );
                                                  await loadAll();
                                                  toast.success(
                                                    t("settings.agent.toast.orchestratorDeleted"),
                                                  );
                                                } catch (err: unknown) {
                                                  toast.error(
                                                    err instanceof Error
                                                      ? err.message
                                                      : t("settings.agent.toast.deleteFailed"),
                                                  );
                                                } finally {
                                                  setSaving(false);
                                                }
                                              })();
                                            }}
                                          />
                                        ) : null}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Experts */}
                          {group.experts.length > 0 && (
                            <div>
                              <p className="px-3 pt-3 pb-1 text-[length:var(--font-hint)] uppercase tracking-wider text-muted-foreground/60">
                                {t("settings.teamsAgents.kinds.expert")}
                              </p>
                              <div className="divide-y divide-border/60 pb-1">
                                {group.experts.map((expert) => (
                                  <div key={expert.id} className={cn(ROW, "px-3")}>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className={ROW_LABEL}>{expert.name}</span>
                                        {renderBadge(badges[expert.fqid ?? expert.id], t)}
                                      </div>
                                      <p className={ROW_DESC}>{expert.description}</p>
                                      <p className="text-[length:var(--font-size-11)] text-muted-foreground/70 mt-0.5">
                                        {expertBundleSummary(expert, t)}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      {expert.builtin ? (
                                        <Switch
                                          checked={expert.enabled}
                                          onCheckedChange={(enabled) =>
                                            void toggleExpertEnabled(expert, enabled)
                                          }
                                          aria-label={`Enable ${expert.name}`}
                                        />
                                      ) : null}
                                      <Button
                                        variant="ghost"
                                        size="xs"
                                        onClick={() => openExpert(expert)}
                                      >
                                        {expert.builtin
                                          ? t("settings.agent.customize")
                                          : t("settings.agent.edit")}
                                      </Button>
                                      {expert.removable ? (
                                        <InlineDeleteButton
                                          itemId={`exp:${expert.id}`}
                                          pending={rowDeleteConfirm.isPending(`exp:${expert.id}`)}
                                          disabled={saving}
                                          onRequest={() =>
                                            rowDeleteConfirm.setPendingId(`exp:${expert.id}`)
                                          }
                                          onConfirm={() => {
                                            void (async () => {
                                              if (!projectRoot) return;
                                              setSaving(true);
                                              try {
                                                await window.electronAPI.expertsDeleteCustom(
                                                  projectRoot,
                                                  expert.id,
                                                );
                                                await loadAll();
                                                toast.success(t("settings.agent.toast.expertDeleted"));
                                              } catch (err: unknown) {
                                                toast.error(
                                                  err instanceof Error
                                                    ? err.message
                                                    : t("settings.agent.toast.deleteFailed"),
                                                );
                                              } finally {
                                                setSaving(false);
                                              }
                                            })();
                                          }}
                                        />
                                      ) : null}
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

function groupLabel(
  packId: string,
  badges: Record<string, BadgeInfo | null>,
  packById: Map<string, ProjectPackView>,
  t: TFunction,
): string {
  if (packId === CORE_PACK_ID) return t("settings.teamsAgents.coreTeam");
  if (packId === LOCAL_PACK_ID) return t("settings.teamsAgents.mine");
  const pack = packById.get(packId);
  if (pack) return pack.manifest.name;
  // Fall back to any badge carrying this pack's name.
  for (const badge of Object.values(badges)) {
    if (badge?.packId === packId) return badge.packName;
  }
  return packId;
}
