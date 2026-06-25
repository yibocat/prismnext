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
import { useDocumentStore } from "@/stores/document-store";
import { closeSettingsPanel } from "@/stores/settings-panel-store";
import type { AgentProfileInfo, ProfileEditorOptions, SaveCustomProfilePayload } from "@shared/agent-profiles";
import type { SettingsPanelSlot } from "@/lib/settings/settings-panel-slots";
import {
  SETTINGS_DETAIL_ACTIONS,
  SETTINGS_DETAIL_SHELL,
  SETTINGS_ROW_DESC,
} from "./settings-tokens";
import {
  ProfileEditorForm,
  emptyProfileForm,
  formatProfileModel,
  parseProfileModel,
  type ProfileFormState,
} from "./profile-editor-form";

type AgentProfileSlot = Extract<SettingsPanelSlot, { kind: "agent-profile" }>;

function formFromDetail(
  detail: AgentProfileInfo & { instructions: string },
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

export function ProfileEditorPanel({ slot }: { slot: AgentProfileSlot }) {
  const closePanel = closeSettingsPanel;
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const builtinCustomize = slot.mode === "customize-builtin";
  const isNew = slot.mode === "new";
  const profileId = slot.mode === "new" ? undefined : slot.profileId;

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [form, setForm] = useState<ProfileFormState>(emptyProfileForm());
  const [editorOptions, setEditorOptions] = useState<ProfileEditorOptions | null>(null);

  useEffect(() => {
    if (!projectRoot) {
      setEditorOptions(null);
      setForm(emptyProfileForm());
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
        const options = await window.electronAPI.agentGetProfileEditorOptions(root);
        if (cancelled) return;
        setEditorOptions(options);

        if (isNew) {
          setForm(emptyProfileForm());
          setLoading(false);
          return;
        }

        const detail = await window.electronAPI.agentGetProfileDetail(root, profileId!);
        if (cancelled) return;
        if (!detail) {
          toast.error("Profile not found.");
          closePanel();
          return;
        }
        setForm(formFromDetail(detail));
      } catch {
        if (!cancelled) {
          toast.error("Failed to load profile.");
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
  }, [projectRoot, isNew, profileId, slot.mode, closePanel]);

  const saveProfile = useCallback(async () => {
    if (!projectRoot) return;
    if (!builtinCustomize && !form.name.trim()) {
      toast.error("Profile name is required.");
      return;
    }

    setSaving(true);
    try {
      const enabledModuleKeys = new Set(
        editorOptions?.modules.filter((m) => m.globallyEnabled).map((m) => m.key) ?? [],
      );
      const modules = form.modules.filter((key) => enabledModuleKeys.has(key));

      if (builtinCustomize && form.id) {
        await window.electronAPI.agentSaveBuiltinProfileOverride(projectRoot, {
          profileId: form.id,
          model: formatProfileModel(form.modelProvider, form.modelId),
          thoughtLevel: form.thoughtLevel.trim() || undefined,
          skills: form.skills,
          mcpServers: form.mcpServers,
          modules,
          rules: form.rules,
        });
      } else {
        const payload: SaveCustomProfilePayload = {
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
        };
        await window.electronAPI.agentSaveCustomProfile(projectRoot, payload);
      }

      toast.success(isNew ? "Profile created." : "Profile saved.");
      closePanel();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save profile.");
    } finally {
      setSaving(false);
    }
  }, [projectRoot, builtinCustomize, form, editorOptions, isNew, closePanel]);

  const resetBuiltinCustomization = async () => {
    if (!projectRoot || !form.id || !builtinCustomize) return;
    setSaving(true);
    try {
      await window.electronAPI.agentResetBuiltinProfileOverride(projectRoot, form.id);
      const full = await window.electronAPI.agentGetProfileDetail(projectRoot, form.id);
      if (full) setForm(formFromDetail(full));
      toast.success("Restored built-in defaults.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to reset profile.");
    } finally {
      setSaving(false);
    }
  };

  const deleteProfile = async () => {
    if (!projectRoot || !form.id) return;
    setDeleteDialogOpen(false);
    setSaving(true);
    try {
      await window.electronAPI.agentDeleteCustomProfile(projectRoot, form.id);
      toast.success("Profile deleted.");
      closePanel();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete profile.");
    } finally {
      setSaving(false);
    }
  };

  if (!projectRoot) {
    return (
      <div className="flex flex-1 items-center justify-center px-8 py-8">
        <p className="text-[length:var(--font-size-13)] text-muted-foreground">
          Open a project to edit agent profiles.
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
            ? "Built-in preset — customize capabilities for this project. Name and instructions stay fixed."
            : isNew
              ? "Create a preset that bundles instructions, model, skills, MCP, rules, and modules."
              : "Edit this preset’s capabilities and guidance for the current project."}
        </p>

        <ProfileEditorForm
          form={form}
          onFormChange={setForm}
          editorOptions={editorOptions}
          builtinCustomize={builtinCustomize}
          saving={saving}
        />

        <div className={SETTINGS_DETAIL_ACTIONS}>
          <Button size="xs" onClick={() => void saveProfile()} disabled={saving}>
            {saving ? <Loader2Icon className="size-3 animate-spin mr-1" /> : null}
            {isNew ? "Create profile" : "Save"}
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
            <DialogTitle>Delete profile</DialogTitle>
            <DialogDescription>
              Permanently delete{" "}
              <span className="font-medium text-foreground">{form.name || "this profile"}</span>?
              This removes the custom preset from{" "}
              <code className="text-[length:var(--font-size-11)] bg-muted px-1 rounded">
                .prismnext/agent/profiles/custom/
              </code>
              .
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              className="shadow-none"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="shadow-none"
              disabled={saving}
              onClick={() => void deleteProfile()}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
