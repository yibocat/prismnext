import { useCallback, useEffect, useRef, useState } from "react";
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
import { useTeamsStore } from "@/stores/teams-store";
import { closeSettingsPanel, openSettingsPanel } from "@/stores/settings-panel-store";
import { TeamPicker } from "../teams/team-picker";
import type { SubagentInfo, SaveCustomSubagentPayload } from "@shared/agent-subagents";
import { MY_CONTENT_TEAM_ID } from "@shared/teams/types";
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

const AUTOSAVE_MS = 400;

type ExpertFormState = ProfileFormState & { permissionPreset: ExpertPermissionPreset };

function formFromExpert(detail: SubagentInfo & { instructions: string }): ExpertFormState {
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

function persistSnapshot(input: {
  builtinCustomize: boolean;
  form: ExpertFormState;
  targetTeamId: string | null;
}): string {
  if (input.builtinCustomize) {
    return JSON.stringify({
      modelProvider: input.form.modelProvider,
      modelId: input.form.modelId,
      thoughtLevel: input.form.thoughtLevel,
      permissionPreset: input.form.permissionPreset,
    });
  }
  return JSON.stringify({
    id: input.form.id,
    name: input.form.name,
    description: input.form.description,
    instructions: input.form.instructions,
    modelProvider: input.form.modelProvider,
    modelId: input.form.modelId,
    thoughtLevel: input.form.thoughtLevel,
    permissionPreset: input.form.permissionPreset,
    targetTeamId: input.targetTeamId,
  });
}

export function ExpertEditorPanel({ slot }: { slot: AgentExpertSlot }) {
  const { t } = useTranslation();
  const closePanel = closeSettingsPanel;
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const builtinCustomize = slot.mode === "installed";
  const isNew = slot.mode === "new";
  const expertId = slot.mode === "new" ? undefined : slot.expertId;

  const [loading, setLoading] = useState(!isNew);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteReferrers, setDeleteReferrers] = useState<Array<{ teamId: string; teamName: string }>>([]);
  const [deleteReferrersLoading, setDeleteReferrersLoading] = useState(false);
  const [canDelete, setCanDelete] = useState(false);
  const [form, setForm] = useState<ExpertFormState>({
    ...emptyProfileForm(),
    permissionPreset: "standard",
  });
  const [contentFqid, setContentFqid] = useState<string | null>(null);
  const [targetTeamId, setTargetPackId] = useState<string | null>(MY_CONTENT_TEAM_ID);
  const [created, setCreated] = useState(!isNew);
  const teamCatalog = useTeamsStore((state) => state.catalog);
  const loadTeams = useTeamsStore((state) => state.load);
  const lastSavedRef = useRef<string>("");
  const persistInFlightRef = useRef(false);
  const pendingSnapRef = useRef<string | null>(null);
  const formRef = useRef(form);
  const contentFqidRef = useRef(contentFqid);
  const targetTeamIdRef = useRef(targetTeamId);
  formRef.current = form;
  contentFqidRef.current = contentFqid;
  targetTeamIdRef.current = targetTeamId;

  useEffect(() => {
    if (!projectRoot) {
      setForm({ ...emptyProfileForm(), permissionPreset: "standard" });
      setContentFqid(null);
      setCanDelete(false);
      setLoading(false);
      setReady(false);
      return;
    }

    let cancelled = false;

    async function load() {
      const root = projectRoot;
      if (!root) return;
      setLoading(true);
      setReady(false);
      setDeleteDialogOpen(false);
      try {
        if (isNew) {
          setForm({ ...emptyProfileForm(), permissionPreset: "standard" });
          setContentFqid(null);
          setTargetPackId(MY_CONTENT_TEAM_ID);
          setCanDelete(false);
          setCreated(false);
          await loadTeams(root);
          if (cancelled) return;
          setLoading(false);
          return;
        }

        const detail = await window.electronAPI.subagentsGetDetail(root, expertId!);
        if (cancelled) return;
        if (!detail) {
          toast.error(t("settings.editor.expert.toast.notFound"));
          closePanel();
          return;
        }
        setForm(formFromExpert(detail));
        setContentFqid(detail.fqid ?? null);
        setCanDelete(Boolean(detail.removable) && !builtinCustomize);
        setCreated(true);
        const pid = detail.fqid?.split(":")[0];
        setTargetPackId(pid || MY_CONTENT_TEAM_ID);
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
  }, [projectRoot, isNew, expertId, slot.mode, closePanel, t, loadTeams, builtinCustomize]);

  useEffect(() => {
    if (loading) {
      setReady(false);
      return;
    }
    lastSavedRef.current = persistSnapshot({
      builtinCustomize,
      form,
      targetTeamId,
    });
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional hydrate gate
  }, [loading]);

  const persistExpert = useCallback(
    async (snap: string): Promise<boolean> => {
      if (!projectRoot) return false;
      if (persistInFlightRef.current) {
        pendingSnapRef.current = snap;
        return false;
      }

      const currentForm = formRef.current;
      const currentFqid = contentFqidRef.current;
      const currentTarget = targetTeamIdRef.current;

      if (builtinCustomize && !currentFqid) return false;
      if (!builtinCustomize && (!currentForm.name.trim() || !currentForm.instructions.trim())) {
        return false;
      }

      persistInFlightRef.current = true;
      setSaving(true);
      try {
        const model = formatProfileModel(currentForm.modelProvider, currentForm.modelId);
        const permission = permissionFromExpertPreset(currentForm.permissionPreset);

        if (builtinCustomize && currentFqid) {
          await window.electronAPI.teamsSaveAssetOverride(projectRoot, currentFqid, {
            model: model || undefined,
            thoughtLevel: currentForm.thoughtLevel.trim() || undefined,
            permission,
          });
          lastSavedRef.current = persistSnapshot({
            builtinCustomize,
            form: currentForm,
            targetTeamId: currentTarget,
          });
          return true;
        }

        const payload: SaveCustomSubagentPayload = {
          id: currentForm.id,
          name: currentForm.name.trim(),
          description: currentForm.description.trim(),
          instructions: currentForm.instructions,
          model: model || undefined,
          thoughtLevel: currentForm.thoughtLevel.trim() || undefined,
          permission,
        };
        const result = await window.electronAPI.subagentsSaveCustom(
          projectRoot,
          payload,
          currentTarget ?? MY_CONTENT_TEAM_ID,
        );
        const saved = result.expert;
        if (saved?.id && saved.id !== currentForm.id) {
          setForm((prev) => ({ ...prev, id: saved.id }));
        }
        if (saved?.fqid) setContentFqid(saved.fqid);
        if (saved?.removable) setCanDelete(true);
        setCreated(true);
        lastSavedRef.current = persistSnapshot({
          builtinCustomize,
          form: { ...currentForm, id: saved?.id || currentForm.id },
          targetTeamId: currentTarget,
        });
        return true;
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : t("settings.editor.expert.toast.saveFailed"));
        return false;
      } finally {
        persistInFlightRef.current = false;
        setSaving(false);
        const pending = pendingSnapRef.current;
        pendingSnapRef.current = null;
        if (pending && pending !== lastSavedRef.current) {
          void persistExpert(pending);
        }
      }
    },
    [projectRoot, builtinCustomize, t],
  );

  useEffect(() => {
    if (!ready || loading || !projectRoot) return;
    // Draft create: wait for explicit Create — do not autosave an unfinished new agent.
    if (isNew && !created) return;

    const snap = persistSnapshot({ builtinCustomize, form, targetTeamId });
    if (snap === lastSavedRef.current) return;
    if (builtinCustomize && !contentFqid) return;
    if (!builtinCustomize && (!form.name.trim() || !form.instructions.trim())) return;

    const timer = window.setTimeout(() => {
      void persistExpert(snap);
    }, AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [
    ready,
    loading,
    projectRoot,
    isNew,
    created,
    builtinCustomize,
    contentFqid,
    form,
    targetTeamId,
    persistExpert,
  ]);

  const createExpert = async () => {
    if (!projectRoot) return;
    if (!form.name.trim()) {
      toast.error(t("settings.editor.expert.toast.nameRequired"));
      return;
    }
    if (!form.instructions.trim()) {
      toast.error(t("settings.editor.expert.toast.instructionsRequired"));
      return;
    }
    const snap = persistSnapshot({ builtinCustomize: false, form, targetTeamId });
    const ok = await persistExpert(snap);
    if (ok) toast.success(t("settings.editor.expert.toast.created"));
  };

  const openDeleteDialog = async () => {
    if (!projectRoot || !form.id || !canDelete) return;
    setDeleteDialogOpen(true);
    setDeleteReferrers([]);
    setDeleteReferrersLoading(true);
    try {
      const refs = await window.electronAPI.subagentsListRosterReferrers(projectRoot, form.id);
      setDeleteReferrers(refs.map((r) => ({ teamId: r.teamId, teamName: r.teamName })));
    } catch {
      setDeleteReferrers([]);
    } finally {
      setDeleteReferrersLoading(false);
    }
  };

  const deleteExpert = async () => {
    if (!projectRoot || !form.id || !canDelete) return;
    setDeleteDialogOpen(false);
    setSaving(true);
    try {
      await window.electronAPI.subagentsDeleteCustom(projectRoot, form.id);
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
          showModel
          initialInstructionsView={isNew && !created ? "source" : "preview"}
        />

        {isNew && !created ? (
          <div className={cn(SETTINGS_DETAIL_SECTION, "!space-y-1.5")}>
            <label className="text-[length:var(--font-size-12)] font-medium">
              {t("settings.editor.expert.targetTeam")}
            </label>
            <TeamPicker
              teams={teamCatalog}
              value={targetTeamId ?? MY_CONTENT_TEAM_ID}
              onChange={setTargetPackId}
              onCreateTeam={(scope) => openSettingsPanel({ kind: "team-create", scope })}
              className={saving ? "pointer-events-none opacity-60" : undefined}
            />
            <p className={cn(SETTINGS_ROW_DESC, "!mt-0.5")}>
              {t("settings.editor.expert.targetTeamDesc")}
            </p>
          </div>
        ) : null}

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

        {(isNew && !created) || (canDelete && form.id) ? (
          <div className={SETTINGS_DETAIL_ACTIONS}>
            {isNew && !created ? (
              <Button
                size="xs"
                onClick={() => void createExpert()}
                disabled={saving || !form.name.trim() || !form.instructions.trim()}
              >
                {saving ? <Loader2Icon className="size-3 animate-spin mr-1" /> : null}
                {t("settings.editor.expert.create")}
              </Button>
            ) : null}
            {canDelete && form.id ? (
              <Button
                variant="destructive"
                size="xs"
                onClick={() => void openDeleteDialog()}
                disabled={saving}
              >
                {t("common.delete")}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="!max-w-md">
          <DialogHeader>
            <DialogTitle>{t("settings.editor.expert.deleteTitle")}</DialogTitle>
            <DialogDescription>
              {deleteReferrersLoading
                ? t("common.loading")
                : deleteReferrers.length > 0
                  ? t("settings.editor.expert.deleteDescInUse")
                  : t("settings.editor.expert.deleteDesc")}
            </DialogDescription>
          </DialogHeader>
          {!deleteReferrersLoading && deleteReferrers.length > 0 ? (
            <div className="space-y-2 px-1">
              <ul className="list-disc pl-5 space-y-0.5 text-[length:var(--font-size-13)]">
                {deleteReferrers.map((r) => (
                  <li key={r.teamId}>{r.teamName}</li>
                ))}
              </ul>
              <p className="text-[length:var(--font-size-13)] text-muted-foreground">
                {t("settings.editor.expert.deleteDescInUseFooter")}
              </p>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" size="sm" className="shadow-none" onClick={() => setDeleteDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="shadow-none"
              disabled={saving || deleteReferrersLoading}
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
