import { useCallback, useEffect, useState } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
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
import type { AgentEditorOptions } from "@shared/agent-editor-options";
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
    skills: detail.skills ?? [],
    mcpServers: detail.mcpServers ?? [],
    modules: detail.modules ?? [],
    rules: detail.rules ?? [],
    permissionPreset: detectExpertPermissionPreset(detail.permission),
  };
}

export function ExpertEditorPanel({ slot }: { slot: AgentExpertSlot }) {
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
  const [editorOptions, setEditorOptions] = useState<AgentEditorOptions | null>(null);

  useEffect(() => {
    if (!projectRoot) {
      setEditorOptions(null);
      setForm({ ...emptyProfileForm(), permissionPreset: "standard" });
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
        const options = await window.electronAPI.expertsGetEditorOptions(root);
        if (cancelled) return;
        setEditorOptions(options);

        if (isNew) {
          setForm({ ...emptyProfileForm(), permissionPreset: "standard" });
          setLoading(false);
          return;
        }

        const detail = await window.electronAPI.expertsGetDetail(root, expertId!);
        if (cancelled) return;
        if (!detail) {
          toast.error("Expert not found.");
          closePanel();
          return;
        }
        setForm(formFromExpert(detail));
      } catch {
        if (!cancelled) {
          toast.error("Failed to load expert.");
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
  }, [projectRoot, isNew, expertId, slot.mode, closePanel]);

  const saveExpert = useCallback(async () => {
    if (!projectRoot) return;
    if (!builtinCustomize && !form.name.trim()) {
      toast.error("Expert name is required.");
      return;
    }
    if (!builtinCustomize && !form.instructions.trim()) {
      toast.error("Instructions are required.");
      return;
    }

    setSaving(true);
    try {
      const selectableModuleKeys = new Set(
        editorOptions?.modules.filter((m) => m.selectableInProfile).map((m) => m.key) ?? [],
      );
      const modules = form.modules.filter((key) => selectableModuleKeys.has(key));
      const permission = permissionFromExpertPreset(form.permissionPreset);

      if (builtinCustomize && form.id) {
        await window.electronAPI.expertsSaveBuiltinOverride(projectRoot, {
          expertId: form.id,
          model: formatProfileModel(form.modelProvider, form.modelId),
          thoughtLevel: form.thoughtLevel.trim() || undefined,
          skills: form.skills,
          mcpServers: form.mcpServers,
          modules,
          rules: form.rules,
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
          skills: form.skills,
          mcpServers: form.mcpServers,
          modules,
          rules: form.rules,
          permission,
        };
        await window.electronAPI.expertsSaveCustom(projectRoot, payload);
      }

      toast.success(isNew ? "Expert created." : "Expert saved.");
      closePanel();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save expert.");
    } finally {
      setSaving(false);
    }
  }, [projectRoot, builtinCustomize, form, editorOptions, isNew, closePanel]);

  const resetBuiltinCustomization = async () => {
    if (!projectRoot || !form.id || !builtinCustomize) return;
    setSaving(true);
    try {
      await window.electronAPI.expertsResetBuiltinOverride(projectRoot, form.id);
      const full = await window.electronAPI.expertsGetDetail(projectRoot, form.id);
      if (full) setForm(formFromExpert(full));
      toast.success("Restored built-in defaults.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to reset expert.");
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
      toast.success("Expert deleted.");
      closePanel();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete expert.");
    } finally {
      setSaving(false);
    }
  };

  if (!projectRoot) {
    return (
      <div className="flex flex-1 items-center justify-center px-8 py-8">
        <p className="text-[length:var(--font-size-13)] text-muted-foreground">
          Open a project to edit experts.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center px-8 py-8">
        <p className="text-[length:var(--font-size-12)] text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className={SETTINGS_DETAIL_SHELL}>
        <p className={SETTINGS_ROW_DESC}>
          {builtinCustomize
            ? "Built-in expert — customize model, capabilities, and tool permissions for this project. Name and instructions stay fixed."
            : isNew
              ? "Create an OpenCode subagent expert synced to your expert team. Used via @ mention or orchestrator Task delegation."
              : "Edit this expert’s instructions and capabilities."}
        </p>

        <ProfileEditorForm
          form={form}
          onFormChange={(next) => setForm({ ...next, permissionPreset: form.permissionPreset })}
          editorOptions={editorOptions}
          builtinCustomize={builtinCustomize}
          saving={saving}
        />

        <div className={SETTINGS_DETAIL_SECTION}>
          <SettingsFormField label="Tool permissions" description="OpenCode subagent tool access preset">
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
                    {opt.label}
                  </AppSelectItem>
                ))}
              </AppSelectContent>
            </AppSelect>
          </SettingsFormField>
        </div>

        <div className={SETTINGS_DETAIL_ACTIONS}>
          <Button size="xs" onClick={() => void saveExpert()} disabled={saving}>
            {saving ? <Loader2Icon className="size-3 animate-spin mr-1" /> : null}
            {isNew ? "Create expert" : "Save"}
          </Button>
          <Button variant="ghost" size="xs" onClick={closePanel} disabled={saving}>
            Cancel
          </Button>
          {builtinCustomize ? (
            <Button
              variant="outline"
              size="xs"
              onClick={() => void resetBuiltinCustomization()}
              disabled={saving}
            >
              Reset defaults
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
                Delete
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="!max-w-md">
          <DialogHeader>
            <DialogTitle>Delete expert</DialogTitle>
            <DialogDescription>
              Permanently delete{" "}
              <span className="font-medium text-foreground">{form.name || "this expert"}</span>?
              This removes the custom expert from{" "}
              <code className="text-[length:var(--font-size-11)] bg-muted px-1 rounded">
                .prismnext/agent/experts/custom/
              </code>
              .
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" className="shadow-none" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="shadow-none"
              disabled={saving}
              onClick={() => void deleteExpert()}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
