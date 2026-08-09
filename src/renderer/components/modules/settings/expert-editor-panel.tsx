import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from "@/components/ui/app-select";
import { useDocumentStore } from "@/stores/document-store";
import { closeSettingsPanel } from "@/stores/settings-panel-store";
import type { ExpertInfo, SaveCustomExpertPayload } from "@shared/agent-experts";
import type { SettingsPanelSlot } from "@/lib/settings/settings-panel-slots";
import {
  detectExpertPermissionPreset,
  EXPERT_PERMISSION_PRESET_OPTIONS,
  permissionFromExpertPreset,
  type ExpertPermissionPreset,
} from "@shared/expert-permission-presets";
import {
  SETTINGS_DETAIL_ACTIONS,
  SETTINGS_DETAIL_SHELL,
  SETTINGS_DETAIL_SECTION,
  SETTINGS_ROW_DESC,
} from "./settings-tokens";
import { SettingsFormField } from "./settings-form-field";
import {
  ProfileEditorForm,
  emptyProfileForm,
  formatProfileModel,
  parseProfileModel,
  type ProfileFormState,
} from "./profile-editor-form";

type AgentExpertSlot = Extract<SettingsPanelSlot, { kind: "agent-expert" }>;

function formFromExpert(
  detail: ExpertInfo & { instructions: string },
): ProfileFormState & { permissionPreset: ExpertPermissionPreset } {
  const { providerId, modelId } = parseProfileModel(detail.model);
  return {
    id: detail.id,
    name: detail.name,
    description: detail.description,
    instructions: detail.instructions,
    modelProvider: providerId,
    modelId,
    thoughtLevel: detail.thoughtLevel ?? "",
    permissionPreset: detectExpertPermissionPreset(detail.permission),
  };
}

export function ExpertEditorPanel({ slot }: { slot: AgentExpertSlot }) {
  const { t } = useTranslation();
  const closePanel = closeSettingsPanel;
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const builtinCustomize = slot.mode === "customize-builtin";
  const isNew = slot.mode === "new";
  const expertId = slot.mode === "new" ? undefined : slot.expertId;

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [form, setForm] = useState<ProfileFormState & { permissionPreset: ExpertPermissionPreset }>({
    ...emptyProfileForm(),
    permissionPreset: "standard",
  });
  // Fully-qualified id of the content being edited (needed by packs:* overrides).
  const [contentFqid, setContentFqid] = useState<string | null>(null);
  // Target team for new agents (null = this project's Local Pack).
  const [userTeams, setUserTeams] = useState<
    Array<{ packId: string; name: string; description: string; version: string }>
  >([]);
  const [targetPackId, setTargetPackId] = useState<string | null>(null);

  useEffect(() => {
    if (!projectRoot) {
      setForm({ ...emptyProfileForm(), permissionPreset: "standard" });
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
        if (isNew) {
          setForm({ ...emptyProfileForm(), permissionPreset: "standard" });
          setContentFqid(null);
          setTargetPackId(null);
          const teams = await window.electronAPI.userPacksList().catch(() => []);
          if (cancelled) return;
          setUserTeams(teams);
          setLoading(false);
          return;
        }

        const detail = await window.electronAPI.expertsGetDetail(root, expertId!);
        if (cancelled) return;
        if (!detail) {
          toast.error(t("settings.editor.expert.toast.notFound"));
          closePanel();
          return;
        }
        setForm(formFromExpert(detail));
        setContentFqid(detail.fqid ?? null);
        // Editing a custom agent writes back to its owning pack (local or team).
        const pid = detail.fqid?.split(":")[0];
        setTargetPackId(pid && pid !== "user.local" ? pid : null);
      } catch {
        if (!cancelled) {
          toast.error(t("settings.editor.expert.toast.loadFailed"));
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
  }, [projectRoot, isNew, expertId, slot.mode, closePanel, t]);

  const saveExpert = useCallback(async () => {
    if (!projectRoot) return;
    if (!builtinCustomize && !form.name.trim()) {
      toast.error(t("settings.editor.expert.toast.nameRequired"));
      return;
    }
    if (!builtinCustomize && !form.instructions.trim()) {
      toast.error(t("settings.editor.expert.toast.instructionsRequired"));
      return;
    }

    setSaving(true);
    try {
      const permission = permissionFromExpertPreset(form.permissionPreset);

      if (builtinCustomize && contentFqid) {
        await window.electronAPI.packsSaveOverride(projectRoot, contentFqid, {
          model: formatProfileModel(form.modelProvider, form.modelId),
          thoughtLevel: form.thoughtLevel.trim() || undefined,
          permission,
        });
      } else {
        const payload: SaveCustomExpertPayload = {
          id: form.id,
          name: form.name.trim(),
          description: form.description.trim(),
          instructions: form.instructions,
          model: formatProfileModel(form.modelProvider, form.modelId),
          thoughtLevel: form.thoughtLevel.trim() || undefined,
          permission,
        };
        await window.electronAPI.expertsSaveCustom(
          projectRoot,
          payload,
          targetPackId ?? undefined,
        );
      }

      toast.success(isNew ? t("settings.editor.expert.toast.created") : t("settings.editor.expert.toast.saved"));
      closePanel();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("settings.editor.expert.toast.saveFailed"));
    } finally {
      setSaving(false);
    }
  }, [projectRoot, builtinCustomize, form, isNew, closePanel, t]);

  const resetBuiltinCustomization = async () => {
    if (!projectRoot || !form.id || !builtinCustomize || !contentFqid) return;
    setSaving(true);
    try {
      await window.electronAPI.packsSaveOverride(projectRoot, contentFqid, {
        model: undefined,
        thoughtLevel: undefined,
        temperature: undefined,
        modules: undefined,
        permission: undefined,
      });
      const full = await window.electronAPI.expertsGetDetail(projectRoot, form.id);
      if (full) {
        setForm(formFromExpert(full));
        setContentFqid(full.fqid ?? null);
      }
      toast.success(t("settings.editor.expert.toast.restoredDefaults"));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("settings.editor.expert.toast.resetFailed"));
    } finally {
      setSaving(false);
    }
  };

  const deleteExpert = async () => {
    if (!projectRoot || !form.id) return;
    setDeleteDialogOpen(false);
    setSaving(true);
    try {
      await window.electronAPI.expertsDeleteCustom(projectRoot, form.id);
      toast.success(t("settings.editor.expert.toast.deleted"));
      closePanel();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("settings.editor.expert.toast.deleteFailed"));
    } finally {
      setSaving(false);
    }
  };

  if (!projectRoot) {
    return (
      <div className="flex flex-1 items-center justify-center px-8 py-8">
        <p className="text-[length:var(--font-size-13)] text-muted-foreground">
          {t("settings.editor.expert.openProject")}
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

  return (
    <div className="flex-1 overflow-auto">
      <div className={SETTINGS_DETAIL_SHELL}>
        <p className={SETTINGS_ROW_DESC}>
          {builtinCustomize
            ? t("settings.editor.expert.introBuiltin")
            : isNew
              ? t("settings.editor.expert.introNew")
              : t("settings.editor.expert.introEdit")}
        </p>

        <ProfileEditorForm
          form={form}
          onFormChange={(next) => setForm({ ...next, permissionPreset: form.permissionPreset })}
          builtinCustomize={builtinCustomize}
          saving={saving}
        />

        {isNew && (
          <div className={cn(SETTINGS_DETAIL_SECTION, "!space-y-1.5")}>
            <label className="text-[length:var(--font-size-12)] font-medium">
              {t("settings.editor.expert.targetTeam")}
            </label>
            <select
              value={targetPackId ?? ""}
              onChange={(e) => setTargetPackId(e.target.value || null)}
              disabled={saving}
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-[length:var(--font-size-12)]"
            >
              <option value="">{t("settings.editor.expert.localTarget")}</option>
              {userTeams.map((team) => (
                <option key={team.packId} value={team.packId}>
                  {team.name}
                </option>
              ))}
            </select>
            <p className={cn(SETTINGS_ROW_DESC, "!mt-0.5")}>
              {t("settings.editor.expert.targetTeamDesc")}
            </p>
          </div>
        )}

        <div className={SETTINGS_DETAIL_SECTION}>
          <SettingsFormField
            label={t("settings.editor.expert.toolPermissions")}
            description={t("settings.editor.expert.toolPermissionsDesc")}
          >
            <AppSelect
              value={form.permissionPreset}
              onValueChange={(value) =>
                setForm((prev) => ({
                  ...prev,
                  permissionPreset: value as ExpertPermissionPreset,
                }))
              }
            >
              <AppSelectTrigger className="w-full max-w-xs">
                <AppSelectValue />
              </AppSelectTrigger>
              <AppSelectContent>
                {EXPERT_PERMISSION_PRESET_OPTIONS.map((opt) => (
                  <AppSelectItem key={opt.value} value={opt.value}>
                    {t(
                      opt.value === "read-only"
                        ? "settings.editor.expert.permissionPreset.readonly"
                        : opt.value === "standard"
                          ? "settings.editor.expert.permissionPreset.standard"
                          : "settings.editor.expert.permissionPreset.full",
                    )}
                  </AppSelectItem>
                ))}
              </AppSelectContent>
            </AppSelect>
          </SettingsFormField>
        </div>

        <div className={SETTINGS_DETAIL_ACTIONS}>
          <Button size="xs" onClick={() => void saveExpert()} disabled={saving}>
            {saving ? <Loader2Icon className="size-3 animate-spin mr-1" /> : null}
            {isNew ? t("settings.editor.expert.create") : t("common.save")}
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
              {t("settings.editor.expert.resetDefaults")}
            </Button>
          ) : null}
          {!builtinCustomize && !isNew ? (
            <>
              <span className="flex-1 min-w-[1rem]" />
              <Button
                variant="ghost"
                size="xs"
                className="shrink-0 text-muted-foreground hover:text-destructive"
                disabled={saving}
                onClick={() => setDeleteDialogOpen(true)}
              >
                {t("common.delete")}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="!max-w-md">
          <DialogHeader>
            <DialogTitle>{t("settings.editor.expert.deleteTitle")}</DialogTitle>
            <DialogDescription>{t("settings.editor.expert.deleteDesc")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" className="shadow-none" onClick={() => setDeleteDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="shadow-none"
              disabled={saving}
              onClick={() => void deleteExpert()}
            >
              {t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
