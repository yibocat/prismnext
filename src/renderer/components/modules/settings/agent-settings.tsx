import { useCallback, useEffect, useState } from "react";
import { BotIcon, PlusIcon, RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";
import { useDocumentStore } from "@/stores/document-store";
import { useLayoutStore } from "@/stores/layout-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useInlineDeleteConfirm } from "@/hooks/use-inline-delete-confirm";
import { InlineDeleteButton } from "./inline-delete-button";
import {
  ProfileEditorDialog,
  emptyProfileForm,
  formatProfileModel,
  parseProfileModel,
  type ProfileFormState,
} from "./profile-editor-dialog";
import { AiTerminalSettingsFields } from "./ai-terminal-settings-fields";
import type {
  AgentProfileInfo,
  ProfileEditorOptions,
  SaveCustomProfilePayload,
} from "@shared/agent-profiles";

const CATEGORY_HEADER =
  "text-[length:var(--font-size-12)] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2";
const CARD = "rounded-lg border border-border px-4 divide-y divide-border";
const ROW = "flex items-center justify-between gap-3 py-2.5";
const ROW_LABEL = "text-[length:var(--font-size-13)] font-medium";
const ROW_DESC = "text-[length:var(--font-size-12)] text-muted-foreground mt-0.5 line-clamp-2";
const BADGE =
  "inline-flex items-center rounded px-1.5 py-0.5 text-[length:var(--font-size-10)] font-medium uppercase tracking-wide shrink-0";
const BUILTIN_RESET_ID = "builtin-profiles-reset";

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

function bundleSummary(profile: AgentProfileInfo): string {
  const parts: string[] = [];
  if (profile.model) parts.push("custom model");
  if (profile.modules?.length) {
    parts.push(`${profile.effectiveModules.length} active modules`);
  }
  if (profile.skills?.length) parts.push(`${profile.skills.length} skills`);
  if (profile.mcpServers?.length) parts.push(`${profile.mcpServers.length} MCP`);
  if (profile.rules?.length) parts.push(`${profile.rules.length} rules`);
  return parts.length > 0 ? parts.join(" · ") : "All project capabilities";
}

function sortProfiles(profiles: AgentProfileInfo[]): AgentProfileInfo[] {
  return [...profiles].sort((a, b) => {
    if (a.builtin !== b.builtin) return a.builtin ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
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
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const [profiles, setProfiles] = useState<AgentProfileInfo[]>([]);
  const [builtinsModified, setBuiltinsModified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editorOptions, setEditorOptions] = useState<ProfileEditorOptions | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"new" | "edit" | "customize-builtin">("edit");
  const [form, setForm] = useState<ProfileFormState>(emptyProfileForm());
  const deleteConfirm = useInlineDeleteConfirm();
  const rowDeleteConfirm = useInlineDeleteConfirm();
  const builtinResetConfirm = useInlineDeleteConfirm();

  const loadProfiles = useCallback(async () => {
    if (!projectRoot) {
      setProfiles([]);
      setBuiltinsModified(false);
      setEditorOptions(null);
      return;
    }
    setLoading(true);
    try {
      const [list, options, manifest] = await Promise.all([
        window.electronAPI.agentListProfiles(projectRoot),
        window.electronAPI.agentGetProfileEditorOptions(projectRoot),
        window.electronAPI.agentGetProfilesManifest(projectRoot),
      ]);
      setProfiles(sortProfiles(list));
      setEditorOptions(options);
      setBuiltinsModified(builtinsDifferFromManifest(manifest));
    } catch {
      setProfiles([]);
      setBuiltinsModified(false);
      setEditorOptions(null);
    } finally {
      setLoading(false);
    }
  }, [projectRoot]);

  useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  const closeDialog = () => {
    deleteConfirm.clearPending();
    setDialogOpen(false);
  };

  const openNewProfile = () => {
    deleteConfirm.clearPending();
    rowDeleteConfirm.clearPending();
    setForm(emptyProfileForm());
    setDialogMode("new");
    setDialogOpen(true);
  };

  const openProfile = async (profile: AgentProfileInfo) => {
    if (!projectRoot) return;
    deleteConfirm.clearPending();
    rowDeleteConfirm.clearPending();
    const detail = await window.electronAPI.agentGetProfileDetail(projectRoot, profile.id);
    if (!detail) return;
    setForm(formFromDetail(detail));
    setDialogMode(profile.builtin ? "customize-builtin" : "edit");
    setDialogOpen(true);
  };

  const removeBuiltinProfile = async (profileId: string) => {
    if (!projectRoot) return;
    setSaving(true);
    try {
      const result = await window.electronAPI.agentSetBuiltinProfileEnabled(
        projectRoot,
        profileId,
        false,
      );
      setProfiles(sortProfiles(result.profiles));
      setBuiltinsModified(builtinsDifferFromManifest(result.manifest));
      rowDeleteConfirm.clearPending();
      toast.success("Built-in profile removed.");
    } finally {
      setSaving(false);
    }
  };

  const resetBuiltinsToDefaults = async () => {
    if (!projectRoot) return;
    setSaving(true);
    try {
      await window.electronAPI.agentResetBuiltinProfilesToDefaults(projectRoot);
      await loadProfiles();
      builtinResetConfirm.clearPending();
      if (dialogOpen && dialogMode === "customize-builtin" && form.id) {
        const full = await window.electronAPI.agentGetProfileDetail(projectRoot, form.id);
        if (full) setForm(formFromDetail(full));
      }
      toast.success("Built-in profiles restored to defaults.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to reset built-in profiles.");
    } finally {
      setSaving(false);
    }
  };

  const saveProfile = async () => {
    if (!projectRoot || (dialogMode !== "customize-builtin" && dialogMode !== "new" && dialogMode !== "edit")) return;
    if (dialogMode !== "customize-builtin" && !form.name.trim()) {
      toast.error("Profile name is required.");
      return;
    }
    setSaving(true);
    try {
      const enabledModuleKeys = new Set(
        editorOptions?.modules.filter((m) => m.globallyEnabled).map((m) => m.key) ?? [],
      );
      const modules = form.modules.filter((key) => enabledModuleKeys.has(key));

      if (dialogMode === "customize-builtin" && form.id) {
        await window.electronAPI.agentSaveBuiltinProfileOverride(projectRoot, {
          profileId: form.id,
          model: formatProfileModel(form.modelProvider, form.modelId),
          thoughtLevel: form.thoughtLevel.trim() || undefined,
          skills: form.skills,
          mcpServers: form.mcpServers,
          modules,
          rules: form.rules,
        });
        const manifest = await window.electronAPI.agentGetProfilesManifest(projectRoot);
        setBuiltinsModified(builtinsDifferFromManifest(manifest));
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
      await loadProfiles();
      closeDialog();
      toast.success(dialogMode === "new" ? "Profile created." : "Profile saved.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save profile.");
    } finally {
      setSaving(false);
    }
  };

  const resetBuiltinCustomization = async () => {
    if (!projectRoot || !form.id || dialogMode !== "customize-builtin") return;
    setSaving(true);
    try {
      const result = await window.electronAPI.agentResetBuiltinProfileOverride(projectRoot, form.id);
      setProfiles(sortProfiles(result.profiles));
      const manifest = await window.electronAPI.agentGetProfilesManifest(projectRoot);
      setBuiltinsModified(builtinsDifferFromManifest(manifest));
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
    setSaving(true);
    try {
      await window.electronAPI.agentDeleteCustomProfile(projectRoot, form.id);
      await loadProfiles();
      closeDialog();
      toast.success("Profile deleted.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete profile.");
    } finally {
      setSaving(false);
    }
  };

  const renderProfileRow = (profile: AgentProfileInfo) => (
    <div key={profile.id} className={ROW}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={ROW_LABEL}>{profile.name}</span>
          {profile.builtin && (
            <span className={cn(BADGE, "bg-muted text-muted-foreground")}>Built-in</span>
          )}
        </div>
        <p className={ROW_DESC}>{profile.description}</p>
        <p className="text-[length:var(--font-size-11)] text-muted-foreground/70 mt-0.5">
          {bundleSummary(profile)}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          variant="ghost"
          size="xs"
          className="shrink-0"
          disabled={saving}
          onClick={() => void openProfile(profile)}
        >
          {profile.builtin ? "Customize" : "Edit"}
        </Button>
        {profile.builtin ? (
          <InlineDeleteButton
            itemId={profile.id}
            pending={rowDeleteConfirm.isPending(profile.id)}
            disabled={saving}
            onRequest={() => rowDeleteConfirm.setPendingId(profile.id)}
            onConfirm={() => void removeBuiltinProfile(profile.id)}
          />
        ) : (
          <InlineDeleteButton
            itemId={profile.id}
            pending={rowDeleteConfirm.isPending(profile.id)}
            disabled={saving}
            onRequest={() => rowDeleteConfirm.setPendingId(profile.id)}
            onConfirm={() => {
              void (async () => {
                if (!projectRoot) return;
                setSaving(true);
                try {
                  await window.electronAPI.agentDeleteCustomProfile(projectRoot, profile.id);
                  await loadProfiles();
                  rowDeleteConfirm.clearPending();
                  toast.success("Profile deleted.");
                } catch (err: unknown) {
                  toast.error(err instanceof Error ? err.message : "Failed to delete profile.");
                } finally {
                  setSaving(false);
                }
              })();
            }}
          />
        )}
      </div>
    </div>
  );

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-8 py-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[length:var(--font-dialog-title)] font-semibold">Agent</h2>
            <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">
              Presets bundle instructions, skills, MCP, rules, and modules for specialized roles —
              like teammates with different expertise.
            </p>
          </div>
          {projectRoot && (
            <Button variant="outline" size="xs" className="shrink-0" onClick={openNewProfile} disabled={saving}>
              <PlusIcon className="size-3 mr-1" />
              New profile
            </Button>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between gap-3 mb-2">
            <p className={cn(CATEGORY_HEADER, "mb-0")}>AI Terminal</p>
            <Button
              variant="ghost"
              size="xs"
              className="shrink-0 text-muted-foreground"
              onClick={() => useLayoutStore.getState().setSettingsCategory("terminal")}
            >
              All terminal settings
            </Button>
          </div>
          <p className="text-[length:var(--font-size-12)] text-muted-foreground mb-2">
            How bash commands open, keep, and clean up ✨ AI terminal tabs. Output is always
            saved to the session log.
          </p>
          <AiTerminalSettingsFields hideExecutionMode />
        </div>

        {!projectRoot ? (
          <div className={cn(CARD, "!divide-y-0")}>
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <BotIcon className="size-8 text-muted-foreground/30" />
              <p className="text-[length:var(--font-size-13)] text-muted-foreground">
                Open a project to manage agent profiles.
              </p>
            </div>
          </div>
        ) : (
          <>
            <p className="text-[length:var(--font-size-12)] text-muted-foreground -mt-2">
              In chat, @ mention a preset to bring that role into the conversation. Built-in presets
              can be removed or customized per project; use Reset to restore all built-ins to app
              defaults without affecting your custom presets in{" "}
              <code className="text-[length:var(--font-size-11)] bg-muted px-1 py-0.5 rounded">
                .prismnext/agent/profiles/custom/
              </code>
              .
            </p>

            <div>
              <div className="flex items-center justify-between gap-3 mb-2">
                <p className={cn(CATEGORY_HEADER, "mb-0")}>Profiles</p>
                {builtinResetConfirm.isPending(BUILTIN_RESET_ID) ? (
                  <Button
                    variant="destructive"
                    size="xs"
                    className="shrink-0"
                    disabled={saving}
                    data-inline-delete-confirm={BUILTIN_RESET_ID}
                    onClick={() => void resetBuiltinsToDefaults()}
                  >
                    Confirm reset
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="xs"
                    className="shrink-0 text-muted-foreground"
                    disabled={saving || !builtinsModified}
                    title="Restore all built-in profiles to app defaults"
                    onClick={() => builtinResetConfirm.setPendingId(BUILTIN_RESET_ID)}
                  >
                    <RotateCcwIcon className="size-3 mr-1" />
                    Reset
                  </Button>
                )}
              </div>
              <div className={CARD}>
                {loading ? (
                  <div className="py-3 text-[length:var(--font-size-12)] text-muted-foreground">Loading…</div>
                ) : profiles.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 py-10 text-center">
                    <BotIcon className="size-8 text-muted-foreground/30" />
                    <p className="text-[length:var(--font-size-13)] text-muted-foreground">
                      No profiles yet.
                    </p>
                    <p className="text-[length:var(--font-size-12)] text-muted-foreground/80">
                      Create a custom preset or reset built-in profiles above.
                    </p>
                  </div>
                ) : (
                  profiles.map(renderProfileRow)
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <ProfileEditorDialog
        open={dialogOpen}
        onOpenChange={(open) => { if (!open) closeDialog(); else setDialogOpen(true); }}
        form={form}
        onFormChange={setForm}
        editorOptions={editorOptions}
        builtinCustomize={dialogMode === "customize-builtin"}
        saving={saving}
        saveLabel={dialogMode === "new" ? "Create" : "Save"}
        onSave={() => void saveProfile()}
        onResetBuiltin={
          dialogMode === "customize-builtin" ? () => void resetBuiltinCustomization() : undefined
        }
        onDelete={dialogMode === "edit" ? () => void deleteProfile() : undefined}
        deletePending={form.id ? deleteConfirm.isPending(form.id) : false}
        onDeleteRequest={form.id ? () => deleteConfirm.setPendingId(form.id!) : undefined}
      />
    </div>
  );
}
