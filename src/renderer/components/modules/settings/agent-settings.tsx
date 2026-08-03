import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { BotIcon, PlusIcon, RotateCcwIcon, UsersIcon } from "lucide-react";
import { toast } from "sonner";
import { useDocumentStore } from "@/stores/document-store";
import { openSettingsPanel } from "@/stores/settings-panel-store";
import { useOnSettingsEditorKindsClosed } from "@/hooks/use-settings-editor";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useInlineDeleteConfirm } from "@/hooks/use-inline-delete-confirm";
import { InlineDeleteButton } from "./inline-delete-button";
import type { ExpertInfo, OrchestratorInfo } from "@shared/agent-experts";

const CATEGORY_HEADER =
  "text-[length:var(--font-size-12)] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2";
const CARD = "rounded-lg border border-border px-4 divide-y divide-border";
const ROW = "flex items-center justify-between gap-3 py-2.5";
const ROW_LABEL = "text-[length:var(--font-size-13)] font-medium";
const ROW_DESC = "text-[length:var(--font-size-12)] text-muted-foreground mt-0.5 line-clamp-2";
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

function builtinsDifferFromManifest(manifest: {
  disabledBuiltinIds?: string[];
  builtinOverrides?: Record<string, unknown>;
}): boolean {
  if ((manifest.disabledBuiltinIds?.length ?? 0) > 0) return true;
  if (manifest.builtinOverrides && Object.keys(manifest.builtinOverrides).length > 0) return true;
  return false;
}

export function AgentSettings() {
  const { t } = useTranslation();
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const [experts, setExperts] = useState<ExpertInfo[]>([]);
  const [orchestrators, setOrchestrators] = useState<OrchestratorInfo[]>([]);
  const [defaultOrchestratorId, setDefaultOrchestratorId] = useState("research-prism");
  const [expertsBuiltinsModified, setExpertsBuiltinsModified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const rowDeleteConfirm = useInlineDeleteConfirm();
  const expertResetConfirm = useInlineDeleteConfirm();

  const loadAll = useCallback(async (options?: { silent?: boolean }) => {
    if (!projectRoot) {
      setExperts([]);
      setOrchestrators([]);
      setDefaultOrchestratorId("research-prism");
      setExpertsBuiltinsModified(false);
      return;
    }
    if (!options?.silent) setLoading(true);
    try {
      const [expertList, expertManifest, orchestratorList, orchestratorManifest] = await Promise.all([
        window.electronAPI.expertsList(projectRoot),
        window.electronAPI.expertsGetManifest(projectRoot),
        window.electronAPI.orchestratorsList(projectRoot),
        window.electronAPI.orchestratorsGetManifest(projectRoot),
      ]);
      setExperts(sortExperts(expertList));
      setOrchestrators(sortOrchestrators(orchestratorList));
      setDefaultOrchestratorId(orchestratorManifest.defaultOrchestratorId ?? "research-prism");
      setExpertsBuiltinsModified(builtinsDifferFromManifest(expertManifest));
    } catch {
      setExperts([]);
      setOrchestrators([]);
      setExpertsBuiltinsModified(false);
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, [projectRoot]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useOnSettingsEditorKindsClosed(["agent-expert", "agent-orchestrator"], () => {
    void loadAll({ silent: true });
  });

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

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-8 py-8 space-y-8">
        <div>
          <h2 className="text-[length:var(--font-dialog-title)] font-semibold">{t("settings.agent.title")}</h2>
          <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">
            {t("settings.agent.pageDesc")}
          </p>
        </div>

        {!projectRoot ? (
          <div className={cn(CARD, "!divide-y-0")}>
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <BotIcon className="size-8 text-muted-foreground/30" />
              <p className="text-[length:var(--font-size-13)] text-muted-foreground">{t("settings.agent.openProject")}</p>
            </div>
          </div>
        ) : (
          <>
            <section>
              <div className="flex items-center justify-between gap-3 mb-2">
                <p className={cn(CATEGORY_HEADER, "mb-0")}>{t("settings.agent.orchestrators")}</p>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => openSettingsPanel({ kind: "agent-orchestrator", mode: "new" })}
                  disabled={saving}
                >
                  <PlusIcon className="size-3 mr-1" />
                  {t("settings.agent.newOrchestrator")}
                </Button>
              </div>
              <div className={CARD}>
                {loading ? (
                  <div className="py-3 text-[length:var(--font-size-12)] text-muted-foreground">{t("common.loading")}</div>
                ) : (
                  orchestrators.map((orchestrator) => {
                    const isDefault = orchestrator.id === defaultOrchestratorId;
                    return (
                      <div key={orchestrator.id} className={ROW}>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={ROW_LABEL}>{orchestrator.name}</span>
                            {orchestrator.builtin ? (
                              <span className={cn(BADGE, "bg-muted text-muted-foreground")}>{t("settings.agent.builtin")}</span>
                            ) : null}
                            {isDefault ? (
                              <span className={cn(BADGE, "bg-primary/10 text-primary")}>Default</span>
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
                              disabled={saving}
                              onClick={() => {
                                void (async () => {
                                  if (!projectRoot) return;
                                  setSaving(true);
                                  try {
                                    const result = await window.electronAPI.orchestratorsSetDefault(
                                      projectRoot,
                                      orchestrator.id,
                                    );
                                    setDefaultOrchestratorId(
                                      result.manifest.defaultOrchestratorId ?? orchestrator.id,
                                    );
                                    toast.success(t("settings.agent.toast.defaultOrchestratorUpdated"));
                                  } finally {
                                    setSaving(false);
                                  }
                                })();
                              }}
                            >
                              Set default
                            </Button>
                          ) : null}
                          <Button variant="ghost" size="xs" disabled={saving} onClick={() => openOrchestrator(orchestrator)}>
                            {orchestrator.builtin ? t("settings.agent.customize") : t("settings.agent.edit")}
                          </Button>
                          {!orchestrator.builtin ? (
                            <InlineDeleteButton
                              itemId={`orch:${orchestrator.id}`}
                              pending={rowDeleteConfirm.isPending(`orch:${orchestrator.id}`)}
                              disabled={saving}
                              onRequest={() => rowDeleteConfirm.setPendingId(`orch:${orchestrator.id}`)}
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
                                    toast.success(t("settings.agent.toast.orchestratorDeleted"));
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
                  })
                )}
              </div>
            </section>

            <section>
              <div className="flex items-center justify-between gap-3 mb-2">
                <p className={cn(CATEGORY_HEADER, "mb-0")}>{t("settings.agent.experts")}</p>
                <div className="flex items-center gap-2">
                  {expertResetConfirm.isPending(BUILTIN_EXPERTS_RESET_ID) ? (
                    <Button variant="destructive" size="xs" disabled={saving} onClick={() => {
                      void (async () => {
                        if (!projectRoot) return;
                        setSaving(true);
                        try {
                          const { manifest, experts: nextExperts } =
                            await window.electronAPI.expertsResetBuiltinsToDefaults(projectRoot);
                          setExperts(sortExperts(nextExperts));
                          setExpertsBuiltinsModified(builtinsDifferFromManifest(manifest));
                          expertResetConfirm.clearPending();
                        } finally {
                          setSaving(false);
                        }
                      })();
                    }}>
                      Confirm reset
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="xs"
                      className="text-muted-foreground"
                      disabled={saving || !expertsBuiltinsModified}
                      onClick={() => expertResetConfirm.setPendingId(BUILTIN_EXPERTS_RESET_ID)}
                    >
                      <RotateCcwIcon className="size-3 mr-1" />
                      Reset
                    </Button>
                  )}
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
              </div>
              <div className={CARD}>
                {loading ? (
                  <div className="py-3 text-[length:var(--font-size-12)] text-muted-foreground">{t("common.loading")}</div>
                ) : experts.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 py-10 text-center">
                    <UsersIcon className="size-8 text-muted-foreground/30" />
                    <p className="text-[length:var(--font-size-13)] text-muted-foreground">No experts yet.</p>
                  </div>
                ) : (
                  experts.map((expert) => (
                    <div key={expert.id} className={ROW}>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={ROW_LABEL}>{expert.name}</span>
                          {expert.builtin ? (
                            <span className={cn(BADGE, "bg-muted text-muted-foreground")}>{t("settings.agent.builtin")}</span>
                          ) : null}
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
                            onCheckedChange={(enabled) => {
                              void (async () => {
                                if (!projectRoot) return;
                                const prevExperts = experts;
                                setExperts((current) =>
                                  sortExperts(
                                    current.map((e) =>
                                      e.id === expert.id ? { ...e, enabled } : e,
                                    ),
                                  ),
                                );
                                try {
                                  const { manifest, experts: nextExperts } =
                                    await window.electronAPI.expertsSetBuiltinEnabled(
                                      projectRoot,
                                      expert.id,
                                      enabled,
                                    );
                                  setExperts(sortExperts(nextExperts));
                                  setExpertsBuiltinsModified(builtinsDifferFromManifest(manifest));
                                } catch (err: unknown) {
                                  setExperts(prevExperts);
                                  toast.error(
                                    err instanceof Error
                                      ? err.message
                                      : t("settings.agent.toast.updateExpertFailed"),
                                  );
                                }
                              })();
                            }}
                            aria-label={`Enable ${expert.name}`}
                          />
                        ) : null}
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => {
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
                          }}
                        >
                          {expert.builtin ? t("settings.agent.customize") : t("settings.agent.edit")}
                        </Button>
                        {!expert.builtin ? (
                          <InlineDeleteButton
                            itemId={`exp:${expert.id}`}
                            pending={rowDeleteConfirm.isPending(`exp:${expert.id}`)}
                            disabled={saving}
                            onRequest={() => rowDeleteConfirm.setPendingId(`exp:${expert.id}`)}
                            onConfirm={() => {
                              void (async () => {
                                if (!projectRoot) return;
                                setSaving(true);
                                try {
                                  await window.electronAPI.expertsDeleteCustom(projectRoot, expert.id);
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
                  ))
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
