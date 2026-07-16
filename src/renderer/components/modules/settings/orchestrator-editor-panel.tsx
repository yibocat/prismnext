import { useCallback, useEffect, useState } from "react";
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
import { closeSettingsPanel } from "@/stores/settings-panel-store";
import type {
  ExpertInfo,
  OrchestratorInfo,
  SaveCustomOrchestratorPayload,
} from "@shared/agent-experts";
import type { AgentEditorOptions } from "@shared/agent-editor-options";
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
    skills: detail.skills ?? [],
    mcpServers: detail.mcpServers ?? [],
    modules: detail.modules ?? [],
    rules: detail.rules ?? [],
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
  const [allowedExperts, setAllowedExperts] = useState<string[]>([]);
  const [experts, setExperts] = useState<ExpertInfo[]>([]);
  const [editorOptions, setEditorOptions] = useState<AgentEditorOptions | null>(null);

  useEffect(() => {
    if (!projectRoot) {
      setEditorOptions(null);
      setForm(emptyProfileForm());
      setAllowedExperts([]);
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
        const [options, expertList] = await Promise.all([
          window.electronAPI.expertsGetEditorOptions(root),
          window.electronAPI.expertsList(root),
        ]);
        if (cancelled) return;
        setEditorOptions(options);
        setExperts(expertList.filter((e) => e.enabled));

        const enabledExpertIds = expertList.filter((e) => e.enabled).map((e) => e.id);

        if (isNew) {
          setForm(emptyProfileForm());
          setAllowedExperts(enabledExpertIds);
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
            skills: detail.skills ?? [],
            mcpServers: detail.mcpServers ?? [],
            modules: detail.modules ?? [],
            rules: detail.rules ?? [],
          });
          setAllowedExperts(
            detail.allowedExperts?.length ? detail.allowedExperts : enabledExpertIds,
          );
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
        setAllowedExperts(
          detail.allowedExperts?.length ? detail.allowedExperts : enabledExpertIds,
        );
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
  }, [projectRoot, isNew, builtinCustomize, orchestratorId, slot.mode, closePanel]);

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
      const selectableModuleKeys = new Set(
        editorOptions?.modules.filter((m) => m.selectableInProfile).map((m) => m.key) ?? [],
      );
      const modules = form.modules.filter((key) => selectableModuleKeys.has(key));
      const model = formatProfileModel(form.modelProvider, form.modelId);

      if (builtinCustomize && form.id) {
        await window.electronAPI.orchestratorsSaveBuiltinOverride(projectRoot, {
          orchestratorId: form.id,
          allowedExperts,
          model,
          thoughtLevel: form.thoughtLevel.trim() || undefined,
          skills: form.skills,
          mcpServers: form.mcpServers,
          modules,
          rules: form.rules,
        });
      } else {
        const payload: SaveCustomOrchestratorPayload = {
          id: form.id,
          name: form.name.trim(),
          description: form.description.trim(),
          instructions: form.instructions,
          allowedExperts,
          model,
          thoughtLevel: form.thoughtLevel.trim() || undefined,
          skills: form.skills,
          mcpServers: form.mcpServers,
          modules,
          rules: form.rules,
        };
        await window.electronAPI.orchestratorsSaveCustom(projectRoot, payload);
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
  }, [projectRoot, builtinCustomize, form, editorOptions, allowedExperts, isNew, closePanel, t]);

  const resetBuiltinCustomization = async () => {
    if (!projectRoot || !form.id || !builtinCustomize) return;
    setSaving(true);
    try {
      await window.electronAPI.orchestratorsResetBuiltinOverride(projectRoot, form.id);
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
          editorOptions={editorOptions}
          builtinCustomize={builtinCustomize}
          saving={saving}
        />

        <CollapsibleFormSection
          title={t("settings.editor.orchestrator.allowedExperts")}
          summary={
            allowedExperts.length === 0
              ? t("settings.editor.orchestrator.noneSelected")
              : t("settings.editor.orchestrator.allowedCount", {
                  selected: allowedExperts.length,
                  total: expertRows.length,
                })
          }
          defaultOpen={allowedExperts.length > 0 && allowedExperts.length < expertRows.length}
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
                const checked = allowedExperts.includes(expert.id);
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
