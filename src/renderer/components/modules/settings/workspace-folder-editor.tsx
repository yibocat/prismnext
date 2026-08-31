import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { RotateCcwIcon } from "lucide-react";
import { Hint } from "@/components/ui/hint";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from "@/components/ui/app-select";
import {
  FOLDER_FUNCTIONS,
  DEFAULT_FUNCTION_DESCRIPTIONS,
  createDefaultFolder,
  manuscriptMainFile,
  type FolderFunction,
  type WorkspaceFolder,
} from "@/types/workspace";
import { WorkspaceFolderIconPicker } from "./workspace-folder-icon-picker";
import { useWorkspaceConfigStore } from "@/stores/workspace-config-store";
import { closeSettingsPanel } from "@/stores/settings-panel-store";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  SETTINGS_DETAIL_ACTIONS,
  SETTINGS_DETAIL_SECTION,
  SETTINGS_DETAIL_SHELL,
  SETTINGS_FORM_INPUT_MONO,
  SETTINGS_FORM_TEXTAREA,
  SETTINGS_LABEL_RESET_ICON,
  SETTINGS_ROW_DESC,
} from "./settings-tokens";
import { SettingsFormField } from "./settings-form-field";

import type { SettingsPanelSlot } from "@/lib/settings/settings-panel-slots";

interface FormState {
  function: FolderFunction;
  name: string;
  description: string;
  icon: string;
  mainFile: string;
}

function folderToForm(folder: WorkspaceFolder): FormState {
  return {
    function: folder.function,
    name: folder.name,
    description: folder.description ?? "",
    icon: folder.icon ?? "",
    mainFile: folder.function === "manuscript" ? (manuscriptMainFile(folder) ?? "") : "",
  };
}

function defaultDescriptionForFunction(func: FolderFunction, t: (key: string) => string): string {
  if (func === "custom") return "";
  return t(`settings.editor.workspaceFolder.functionDesc.${func}`);
}

function emptyForm(func: FolderFunction = "notebook"): FormState {
  const folder = createDefaultFolder("", func);
  return {
    function: func,
    name: "",
    description: "",
    icon: "",
    mainFile: folder.function === "manuscript" ? (manuscriptMainFile(folder) ?? "") : "",
  };
}

export function WorkspaceFolderEditor({
  slot,
}: {
  slot: Extract<SettingsPanelSlot, { kind: "workspace-folder" }>;
}) {
  const { t } = useTranslation();
  const closePanel = closeSettingsPanel;
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const projectDirs = useWorkspaceConfigStore((s) => s.workspaceDirs);
  const addProjectFolder = useWorkspaceConfigStore((s) => s.addFolder);
  const updateProjectFolder = useWorkspaceConfigStore((s) => s.updateFolder);
  const removeProjectFolder = useWorkspaceConfigStore((s) => s.removeFolder);

  const editIndex = slot.mode === "edit" ? slot.index : null;
  const existing =
    slot.mode === "edit" && editIndex !== null ? projectDirs[editIndex] : null;

  const [form, setForm] = useState<FormState>(() =>
    existing ? folderToForm(existing) : emptyForm(),
  );

  useEffect(() => {
    if (slot.mode === "edit" && existing) {
      setForm(folderToForm(existing));
    } else if (slot.mode === "new") {
      setForm(emptyForm());
    }
    setDeleteDialogOpen(false);
  }, [slot.mode, editIndex, existing?.name, existing?.function]);

  const hasManuscript = useMemo(
    () =>
      projectDirs.some(
        (d, i) => d.function === "manuscript" && (slot.mode === "new" || i !== editIndex),
      ),
    [projectDirs, slot.mode, editIndex],
  );

  const isOnlyManuscript =
    existing?.function === "manuscript" &&
    projectDirs.filter((d) => d.function === "manuscript").length === 1;

  const patchFromForm = (): Partial<WorkspaceFolder> => {
    const iconTrim = form.icon.trim();
    const patch: Partial<WorkspaceFolder> = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      icon: iconTrim || undefined,
    };
    if (slot.mode === "new") {
      patch.function = form.function;
    }
    if (form.function === "manuscript") {
      const pin = form.mainFile.trim();
      (patch as { mainFile?: string; mainTex?: string }).mainFile = pin || undefined;
      (patch as { mainFile?: string; mainTex?: string }).mainTex = pin || undefined;
    }
    return patch;
  };

  const save = () => {
    if (slot.mode === "new") {
      const err = addProjectFolder(form.function, form.name.trim());
      if (err) {
        toast.error(err);
        return;
      }
      const idx = useWorkspaceConfigStore.getState().workspaceDirs.length - 1;
      const patch: Partial<WorkspaceFolder> = {};
      if (form.description.trim()) patch.description = form.description.trim();
      if (form.icon.trim()) patch.icon = form.icon.trim();
      if (form.function === "manuscript") {
        const pin = form.mainFile.trim();
        (patch as { mainFile?: string; mainTex?: string }).mainFile = pin || undefined;
        (patch as { mainFile?: string; mainTex?: string }).mainTex = pin || undefined;
      }
      if (Object.keys(patch).length > 0) {
        const patchErr = updateProjectFolder(idx, patch);
        if (patchErr) toast.error(patchErr);
      }
    } else if (editIndex !== null) {
      const err = updateProjectFolder(editIndex, patchFromForm());
      if (err) {
        toast.error(err);
        return;
      }
    }
    toast.success(slot.mode === "new" ? t("settings.workspace.toast.folderAdded") : t("settings.workspace.toast.folderSaved"));
    closePanel();
  };

  const remove = () => {
    if (slot.mode !== "edit" || editIndex === null) return;
    setDeleteDialogOpen(false);
    removeProjectFolder(editIndex);
    toast.success(t("settings.workspace.toast.folderRemoved"));
    closePanel();
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className={SETTINGS_DETAIL_SHELL}>
        <p className={SETTINGS_ROW_DESC}>
          {t("settings.editor.workspaceFolder.scopeThis")}. {t("settings.editor.workspaceFolder.intro")}
        </p>

        <div className={SETTINGS_DETAIL_SECTION}>
          <SettingsFormField
              label={t("settings.editor.workspaceFolder.type")}
              htmlFor="ws-folder-type"
              description={
                slot.mode === "edit"
                  ? t("settings.editor.workspaceFolder.typeLocked")
                  : undefined
              }
            >
              <AppSelect
                value={form.function}
                onValueChange={(v) => {
                  const func = v as FolderFunction;
                  setForm((f) => ({
                    ...f,
                    function: func,
                    mainFile: func === "manuscript" ? f.mainFile : f.mainFile,
                    icon: f.icon.trim() ? f.icon : "",
                  }));
                }}
                disabled={slot.mode === "edit"}
              >
                <AppSelectTrigger id="ws-folder-type" variant="dialog" className="w-full">
                  <AppSelectValue />
                </AppSelectTrigger>
                <AppSelectContent>
                  {FOLDER_FUNCTIONS.map((f) => (
                    <AppSelectItem
                      key={f}
                      value={f}
                      disabled={f === "manuscript" && hasManuscript}
                    >
                      {t(`settings.editor.workspaceFolder.functions.${f}`)}
                    </AppSelectItem>
                  ))}
                </AppSelectContent>
              </AppSelect>
          </SettingsFormField>

          <SettingsFormField
              label={t("settings.workspace.folderEditor.name")}
              htmlFor="ws-folder-name"
              description={t("settings.workspace.folderEditor.nameDesc")}
            >
              <div className="flex items-center gap-2">
                <WorkspaceFolderIconPicker
                  value={form.icon}
                  folderFunction={form.function}
                  onChange={(icon) => setForm((f) => ({ ...f, icon }))}
                />
                <Input
                  id="ws-folder-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder={t("settings.editor.workspaceFolder.namePlaceholder")}
                  className={cn(SETTINGS_FORM_INPUT_MONO, "flex-1 min-w-0")}
                />
              </div>
            </SettingsFormField>

            {form.function === "manuscript" ? (
              <SettingsFormField
                label={t("settings.workspace.folderEditor.mainTex")}
                htmlFor="ws-main-tex"
                description={t("settings.workspace.folderEditor.mainTexDesc")}
              >
                <Input
                  id="ws-main-tex"
                  value={form.mainFile}
                  onChange={(e) => setForm((f) => ({ ...f, mainFile: e.target.value }))}
                  placeholder="main.tex"
                  className={SETTINGS_FORM_INPUT_MONO}
                />
              </SettingsFormField>
            ) : null}

            <SettingsFormField
              label={t("settings.workspace.folderEditor.description")}
              htmlFor="ws-folder-desc"
              description={t("settings.workspace.folderEditor.descriptionDesc")}
              labelExtra={
                <Hint label={t("settings.editor.workspaceFolder.resetDefault")}>
                  <button
                    type="button"
                    className={SETTINGS_LABEL_RESET_ICON}
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        description: defaultDescriptionForFunction(f.function, t),
                      }))
                    }
                  >
                    <RotateCcwIcon className="size-3" />
                  </button>
                </Hint>
              }
            >
              <Textarea
                id="ws-folder-desc"
                className={SETTINGS_FORM_TEXTAREA}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder={
                  form.function === "custom"
                    ? t("settings.editor.workspaceFolder.descPlaceholder")
                    : t(`settings.editor.workspaceFolder.functionDesc.${form.function}`, {
                        defaultValue:
                          DEFAULT_FUNCTION_DESCRIPTIONS[form.function] ||
                          t("settings.editor.workspaceFolder.descPlaceholder"),
                      })
                }
              />
            </SettingsFormField>
        </div>

        <div className={SETTINGS_DETAIL_ACTIONS}>
          <Button size="xs" onClick={save}>
            {slot.mode === "new" ? t("settings.workspace.addFolder") : t("common.save")}
          </Button>
          <Button variant="ghost" size="xs" onClick={closePanel}>
            {t("common.cancel")}
          </Button>
          {slot.mode === "edit" ? (
            <>
              <span className="flex-1 min-w-[1rem]" />
              <Button
                variant="ghost"
                size="xs"
                className="shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => setDeleteDialogOpen(true)}
              >
                {t("common.remove")}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="!max-w-md">
          <DialogHeader>
            <DialogTitle>{t("settings.workspace.folderEditor.removeTitle")}</DialogTitle>
            <DialogDescription>
              {t("settings.workspace.folderEditor.removeDescProject", {
                name: existing?.name || "",
              })}
              {isOnlyManuscript ? (
                <>
                  {" "}
                  {t("settings.workspace.folderEditor.removeManuscriptWarn")}
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              size="xs"
              className="shadow-none"
              onClick={() => setDeleteDialogOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              size="xs"
              className="shadow-none"
              onClick={remove}
            >
              {t("common.remove")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
