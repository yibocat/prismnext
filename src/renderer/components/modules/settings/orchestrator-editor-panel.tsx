import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDocumentStore } from "@/stores/document-store";
import { useTeamsStore } from "@/stores/teams-store";
import { closeSettingsPanel } from "@/stores/settings-panel-store";
import { TeamPicker } from "../teams/team-picker";
import type {
  SubagentInfo,
  OrchestratorInfo,
  SaveCustomOrchestratorPayload,
} from "@shared/agent-subagents";
import { isProjectLocalTeamId } from "@shared/teams/types";
import { buildSubagentRosterMarkdown } from "@shared/subagent-roster";
import type { SettingsPanelSlot } from "@/lib/settings/settings-panel-slots";
import {
  SETTINGS_DETAIL_ACTIONS,
  SETTINGS_DETAIL_SHELL,
  SETTINGS_DETAIL_SECTION,
  SETTINGS_ROW_DESC,
} from "./settings-tokens";
import {
  ProfileEditorForm,
  CollapsibleFormSection,
  emptyProfileForm,
  formatProfileModel,
  parseProfileModel,
  type ProfileFormState,
} from "./profile-editor-form";
import { SettingsModulePromptPreview } from "./settings-module-prompt-preview";

type AgentOrchestratorSlot = Extract<SettingsPanelSlot, { kind: "agent-orchestrator" }>;

function formFromOrchestrator(
  detail: OrchestratorInfo & { instructions: string },
): ProfileFormState {
  const { providerId, modelId } = parseProfileModel(detail.model);
  return {
    id: detail.id,
    name: detail.name,
    description: detail.description,
    instructions: detail.instructions,
    modelProvider: providerId,
    modelId,
    thoughtLevel: detail.thoughtLevel ?? "",
  };
}

export function OrchestratorEditorPanel({ slot }: { slot: AgentOrchestratorSlot }) {
  const { t } = useTranslation();
  const closePanel = closeSettingsPanel;
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const builtinCustomize = slot.mode === "customize-builtin";
  const isNew = slot.mode === "new";
  const orchestratorId = slot.mode === "new" ? undefined : slot.orchestratorId;

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [form, setForm] = useState<ProfileFormState>(emptyProfileForm());
  const [roster, setAllowedExperts] = useState<string[]>([]);
  const [experts, setExperts] = useState<SubagentInfo[]>([]);
  // Fully-qualified id of the content being edited (needed by packs:* overrides).
  const [contentFqid, setContentFqid] = useState<string | null>(null);
  // Target team for new agents (null = this project's Local Pack).
  const [targetTeamId, setTargetPackId] = useState<string | null>(null);
  const teamCatalog = useTeamsStore((state) => state.catalog);
  const loadTeams = useTeamsStore((state) => state.load);

  useEffect(() => {
    if (!projectRoot) {
      setForm(emptyProfileForm());
      setAllowedExperts([]);
      setContentFqid(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      const root = projectRoot;
      if (!root) return;
      setLoading(true);
      setDeleteDialogOpen(false);
      try {
        const expertList = await window.electronAPI.subagentsList(root);
        if (cancelled) return;
        setExperts(expertList.filter((e) => e.enabled));

        const enabledExpertIds = expertList.filter((e) => e.enabled).map((e) => e.id);
        // undefined allowlist = unrestricted (default: all available experts).
        // Never pre-fill every enabled expert into a NEW orchestrator — that
        // would lock it to today's roster and leak core experts into new agents.
        const pruneAllowed = (ids: string[] | undefined) =>
          ids?.length ? ids.filter((id) => enabledExpertIds.includes(id)) : [];

        if (isNew) {
          setForm(emptyProfileForm());
          setAllowedExperts([]);
          setContentFqid(null);
          setTargetPackId(null);
          await loadTeams(root);
          if (cancelled) return;
          setLoading(false);
          return;
        }

        if (builtinCustomize) {
          const detail = await window.electronAPI.orchestratorsGetDetail(root, orchestratorId!);
          if (cancelled) return;
          if (!detail) {
            toast.error(t("settings.editor.orchestrator.toast.notFound"));
            closePanel();
            return;
          }
          const { providerId, modelId } = parseProfileModel(detail.model);
          setForm({
            id: detail.id,
            name: detail.name,
            description: detail.description,
            instructions: detail.instructions,
            modelProvider: providerId,
            modelId,
            thoughtLevel: detail.thoughtLevel ?? "",
          });
          setAllowedExperts(pruneAllowed(detail.roster));
          setContentFqid(detail.fqid ?? null);
          setLoading(false);
          return;
        }

        const detail = await window.electronAPI.orchestratorsGetDetail(root, orchestratorId!);
        if (cancelled) return;
        if (!detail) {
          toast.error(t("settings.editor.orchestrator.toast.notFound"));
          closePanel();
          return;
        }
        setForm(formFromOrchestrator(detail));
        setAllowedExperts(pruneAllowed(detail.roster));
        setContentFqid(detail.fqid ?? null);
        // Editing a custom agent writes back to its owning pack (local or team).
        const pid = detail.fqid?.split(":")[0];
        setTargetPackId(pid && !isProjectLocalTeamId(pid) ? pid : null);
      } catch {
        if (!cancelled) {
          toast.error(t("settings.editor.orchestrator.toast.loadFailed"));
          closePanel();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [projectRoot, isNew, builtinCustomize, orchestratorId, slot.mode, closePanel, loadTeams]);

  const saveOrchestrator = useCallback(async () => {
    if (!projectRoot) return;
    if (!builtinCustomize && !form.name.trim()) {
      toast.error(t("settings.editor.orchestrator.toast.nameRequired"));
      return;
    }
    if (!builtinCustomize && !form.instructions.trim()) {
      toast.error(t("settings.editor.orchestrator.toast.instructionsRequired"));
      return;
    }

    setSaving(true);
    try {
      const model = formatProfileModel(form.modelProvider, form.modelId);
      // Empty allowlist → undefined (unrestricted = all available experts).
      const allowedExpertsField = roster.length > 0 ? roster : undefined;

      if (builtinCustomize && contentFqid) {
        await window.electronAPI.teamsSaveAssetOverride(projectRoot, contentFqid, {
          allowedExperts: allowedExpertsField,
          model,
          thoughtLevel: form.thoughtLevel.trim() || undefined,
        });
      } else {
        const payload: SaveCustomOrchestratorPayload = {
          id: form.id,
          name: form.name.trim(),
          description: form.description.trim(),
          instructions: form.instructions,
          roster: allowedExpertsField,
          model,
          thoughtLevel: form.thoughtLevel.trim() || undefined,
        };
        await window.electronAPI.orchestratorsSaveCustom(
          projectRoot,
          payload,
          targetTeamId ?? undefined,
        );
      }

      toast.success(isNew ? t("settings.editor.orchestrator.toast.created") : t("settings.editor.orchestrator.toast.saved"));
      closePanel();
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : t("settings.editor.orchestrator.toast.saveFailed"),
      );
    } finally {
      setSaving(false);
    }
  }, [projectRoot, builtinCustomize, form, roster, isNew, closePanel, t]);

  const resetBuiltinCustomization = async () => {
    if (!projectRoot || !form.id || !builtinCustomize || !contentFqid) return;
    setSaving(true);
    try {
      await window.electronAPI.teamsSaveAssetOverride(projectRoot, contentFqid, {
        allowedExperts: undefined,
        model: undefined,
        thoughtLevel: undefined,
        temperature: undefined,
        permission: undefined,
      });
      toast.success(t("settings.editor.orchestrator.toast.restoredDefaults"));
      closePanel();
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : t("settings.editor.orchestrator.toast.resetFailed"),
      );
    } finally {
      setSaving(false);
    }
  };

  const deleteOrchestrator = async () => {
    if (!projectRoot || !form.id) return;
    setDeleteDialogOpen(false);
    setSaving(true);
    try {
      await window.electronAPI.orchestratorsDeleteCustom(projectRoot, form.id);
      toast.success(t("settings.editor.orchestrator.toast.deleted"));
      closePanel();
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : t("settings.editor.orchestrator.toast.deleteFailed"),
      );
    } finally {
      setSaving(false);
    }
  };

  const subagentRosterMarkdown = useMemo(() => {
    const refs = roster
      .filter((id) => experts.some((e) => e.id === id))
      .map((id) => {
        const expert = experts.find((e) => e.id === id)!;
        return { id: expert.id, name: expert.name, description: expert.description };
      });
    return buildSubagentRosterMarkdown(refs);
  }, [roster, experts]);

  if (!projectRoot) {
    return (
      <div className="flex flex-1 items-center justify-center px-8 py-8">
        <p className="text-[length:var(--font-size-13)] text-muted-foreground">
          {t("settings.editor.orchestrator.openProject")}
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center px-8 py-8">
        <p className="text-[length:var(--font-size-12)] text-muted-foreground">{t("common.loading")}</p>
      </div>
    );
  }

  const expertRows = experts;

  return (
    <div className="flex-1 overflow-auto">
      <div className={SETTINGS_DETAIL_SHELL}>
        <p className={SETTINGS_ROW_DESC}>
          {builtinCustomize
            ? t("settings.editor.orchestrator.introBuiltin")
            : isNew
              ? t("settings.editor.orchestrator.introNew")
              : t("settings.editor.orchestrator.introEdit")}
        </p>

        <ProfileEditorForm
          form={form}
          onFormChange={setForm}
          builtinCustomize={builtinCustomize}
          saving={saving}
        />

        {isNew && (
          <div className={cn(SETTINGS_DETAIL_SECTION, "!space-y-1.5")}>
            <label className="text-[length:var(--font-size-12)] font-medium">
              {t("settings.editor.orchestrator.targetTeam")}
            </label>
            <TeamPicker
              teams={teamCatalog}
              value={targetTeamId ?? "project.local"}
              onChange={setTargetPackId}
              className={saving ? "pointer-events-none opacity-60" : undefined}
            />
            <p className={cn(SETTINGS_ROW_DESC, "!mt-0.5")}>
              {t("settings.editor.orchestrator.targetTeamDesc")}
            </p>
          </div>
        )}

        <CollapsibleFormSection
          title={t("settings.editor.orchestrator.roster")}
          summary={
            roster.length === 0
              ? t("settings.editor.orchestrator.allExperts")
              : t("settings.editor.orchestrator.allowedCount", {
                  selected: roster.filter((id) =>
                    expertRows.some((e) => e.id === id),
                  ).length,
                  total: expertRows.length,
                })
          }
          defaultOpen={roster.length > 0 && roster.length < expertRows.length}
        >
          <p className={cn(SETTINGS_ROW_DESC, "mb-3")}>
            {t("settings.editor.orchestrator.allowedExpertsDesc")}
          </p>
          <div className="rounded-lg border border-border divide-y divide-border/60">
            {expertRows.length === 0 ? (
              <p className="px-3 py-2.5 text-[length:var(--font-size-12)] text-muted-foreground">
                {t("settings.editor.orchestrator.noExperts")}
              </p>
            ) : (
              expertRows.map((expert) => {
                const checked = roster.includes(expert.id);
                return (
                  <label
                    key={expert.id}
                    className="flex items-start gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-muted/40"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(on) => {
                        setAllowedExperts((prev) =>
                          on
                            ? prev.includes(expert.id)
                              ? prev
                              : [...prev, expert.id]
                            : prev.filter((id) => id !== expert.id),
                        );
                      }}
                      className="mt-0.5"
                    />
                    <span className="min-w-0">
                      <span className="text-[length:var(--font-size-13)] font-medium">{expert.name}</span>
                      <span className="block text-[length:var(--font-size-12)] text-muted-foreground mt-0.5">
                        {expert.description}
                      </span>
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </CollapsibleFormSection>

        <CollapsibleFormSection
          title={t("settings.editor.orchestrator.subagentRoster")}
          summary={t("settings.editor.orchestrator.allowedCount", {
            selected: roster.filter((id) => expertRows.some((e) => e.id === id)).length,
            total: expertRows.length,
          })}
          defaultOpen
        >
          <p className={cn(SETTINGS_ROW_DESC, "mb-3")}>
            {t("settings.editor.orchestrator.subagentRosterDesc")}
          </p>
          <SettingsModulePromptPreview content={subagentRosterMarkdown} />
        </CollapsibleFormSection>

        <div className={SETTINGS_DETAIL_ACTIONS}>
          <Button size="xs" onClick={() => void saveOrchestrator()} disabled={saving}>
            {saving ? <Loader2Icon className="size-3 animate-spin mr-1" /> : null}
            {isNew ? t("common.create") : t("common.save")}
          </Button>
          <Button variant="ghost" size="xs" onClick={closePanel} disabled={saving}>
            {t("common.cancel")}
          </Button>
          {builtinCustomize ? (
            <Button
              variant="outline"
              size="xs"
              onClick={() => void resetBuiltinCustomization()}
              disabled={saving}
            >
              {t("settings.editor.orchestrator.resetDefaults")}
            </Button>
          ) : null}
          {!builtinCustomize && !isNew && form.id ? (
            <Button
              variant="destructive"
              size="xs"
              onClick={() => setDeleteDialogOpen(true)}
              disabled={saving}
            >
              {t("common.delete")}
            </Button>
          ) : null}
        </div>
      </div>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("settings.editor.orchestrator.deleteTitle")}</DialogTitle>
            <DialogDescription>{t("settings.editor.orchestrator.deleteDesc")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setDeleteDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" size="sm" onClick={() => void deleteOrchestrator()}>
              {t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
