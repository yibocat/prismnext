import { useEffect, useMemo, useState } from "react";
import { RotateCcwIcon } from "lucide-react";
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
  FOLDER_FUNCTION_LABELS,
  DEFAULT_FUNCTION_DESCRIPTIONS,
  createDefaultFolder,
  type FolderFunction,
  type WorkspaceFolder,
} from "@/types/workspace";
import { WorkspaceFolderIconPicker } from "./workspace-folder-icon-picker";
import {
  applyTemplateFolderPatch,
  validateNewTemplateFolder,
  validateTemplateFolderPatch,
} from "@/lib/settings/workspace-template";
import { useWorkspaceConfigStore } from "@/stores/workspace-config-store";
import { useSettingsStore } from "@/stores/settings-store";
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

type DocClass = "article" | "report" | "book";

interface FormState {
  function: FolderFunction;
  name: string;
  description: string;
  icon: string;
  mainTex: string;
  defaultDocClass: DocClass;
}

function folderToForm(folder: WorkspaceFolder, defaultDocClass: DocClass): FormState {
  return {
    function: folder.function,
    name: folder.name,
    description: folder.description ?? "",
    icon: folder.icon ?? "",
    mainTex: folder.function === "manuscript" ? folder.mainTex : "main.tex",
    defaultDocClass,
  };
}

function defaultDescriptionForFunction(func: FolderFunction): string {
  return DEFAULT_FUNCTION_DESCRIPTIONS[func] ?? "";
}

function emptyForm(func: FolderFunction = "notebook", defaultDocClass: DocClass = "article"): FormState {
  const folder = createDefaultFolder("", func);
  return {
    function: func,
    name: "",
    description: "",
    icon: "",
    mainTex: folder.function === "manuscript" ? folder.mainTex : "main.tex",
    defaultDocClass,
  };
}

export function WorkspaceFolderEditor({
  slot,
}: {
  slot: Extract<SettingsPanelSlot, { kind: "workspace-folder" }>;
}) {
  const closePanel = closeSettingsPanel;
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const projectDirs = useWorkspaceConfigStore((s) => s.workspaceDirs);
  const addProjectFolder = useWorkspaceConfigStore((s) => s.addFolder);
  const updateProjectFolder = useWorkspaceConfigStore((s) => s.updateFolder);
  const removeProjectFolder = useWorkspaceConfigStore((s) => s.removeFolder);

  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const templateDirs = settings.defaultWorkspaceDirs ?? [];
  const templateDocClass = (settings.defaultDocClass ?? "article") as DocClass;

  const editIndex = slot.mode === "edit" ? slot.index : null;

  const sourceDirs = slot.scope === "project" ? projectDirs : templateDirs;
  const existing =
    slot.mode === "edit" && editIndex !== null ? sourceDirs[editIndex] : null;

  const [form, setForm] = useState<FormState>(() =>
    existing ? folderToForm(existing, templateDocClass) : emptyForm("notebook", templateDocClass),
  );

  useEffect(() => {
    if (slot.mode === "edit" && existing) {
      setForm(folderToForm(existing, templateDocClass));
    } else if (slot.mode === "new") {
      setForm(emptyForm("notebook", templateDocClass));
    }
    setDeleteDialogOpen(false);
  }, [slot.mode, editIndex, slot.scope, existing?.name, existing?.function, templateDocClass]);

  const showTemplateDocClass = slot.scope === "template" && form.function === "manuscript";

  const hasManuscript = useMemo(
    () =>
      sourceDirs.some(
        (d, i) => d.function === "manuscript" && (slot.mode === "new" || i !== editIndex),
      ),
    [sourceDirs, slot.mode, editIndex],
  );

  const isOnlyManuscript =
    existing?.function === "manuscript" &&
    sourceDirs.filter((d) => d.function === "manuscript").length === 1;

  const scopeLabel = slot.scope === "project" ? "This project" : "New project template";

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
      (patch as { mainTex: string }).mainTex = form.mainTex.trim() || "main.tex";
    }
    return patch;
  };

  const save = () => {
    if (slot.scope === "project") {
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
          (patch as { mainTex?: string }).mainTex = form.mainTex.trim() || "main.tex";
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
    } else {
      const dirs = [...templateDirs];
      const templateSettings: { defaultWorkspaceDirs: WorkspaceFolder[]; defaultDocClass?: DocClass } =
        { defaultWorkspaceDirs: dirs };

      if (slot.mode === "new") {
        const err = validateNewTemplateFolder(dirs, form.function, form.name);
        if (err) {
          toast.error(err);
          return;
        }
        const entry = createDefaultFolder(form.name.trim(), form.function);
        let next: WorkspaceFolder = entry;
        if (form.description.trim()) next = { ...next, description: form.description.trim() };
        if (form.icon.trim()) next = { ...next, icon: form.icon.trim() };
        if (next.function === "manuscript") {
          next = { ...next, mainTex: form.mainTex.trim() || "main.tex" };
          templateSettings.defaultDocClass = form.defaultDocClass;
        }
        templateSettings.defaultWorkspaceDirs = [...dirs, next];
      } else if (editIndex !== null) {
        const err = validateTemplateFolderPatch(dirs, editIndex, patchFromForm());
        if (err) {
          toast.error(err);
          return;
        }
        templateSettings.defaultWorkspaceDirs = applyTemplateFolderPatch(
          dirs,
          editIndex,
          patchFromForm(),
        );
        if (form.function === "manuscript") {
          templateSettings.defaultDocClass = form.defaultDocClass;
        }
      }
      updateSettings(templateSettings);
    }
    toast.success(slot.mode === "new" ? "Folder added." : "Folder saved.");
    closePanel();
  };

  const remove = () => {
    if (slot.mode !== "edit" || editIndex === null) return;
    setDeleteDialogOpen(false);
    if (slot.scope === "project") {
      removeProjectFolder(editIndex);
    } else {
      updateSettings({
        defaultWorkspaceDirs: templateDirs.filter((_, i) => i !== editIndex),
      });
    }
    toast.success("Folder removed from configuration.");
    closePanel();
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className={SETTINGS_DETAIL_SHELL}>
        <p className={SETTINGS_ROW_DESC}>
          {scopeLabel}. Removing an entry only updates workspace configuration — the folder on
          disk is not deleted.
        </p>

        <div className={SETTINGS_DETAIL_SECTION}>
          <SettingsFormField
              label="Type"
              htmlFor="ws-folder-type"
              description={
                slot.mode === "edit" ? "Type cannot be changed after creation." : undefined
              }
            >
              <AppSelect
                value={form.function}
                onValueChange={(v) => {
                  const func = v as FolderFunction;
                  setForm((f) => ({
                    ...f,
                    function: func,
                    mainTex: func === "manuscript" ? f.mainTex || "main.tex" : f.mainTex,
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
                      {FOLDER_FUNCTION_LABELS[f]}
                    </AppSelectItem>
                  ))}
                </AppSelectContent>
              </AppSelect>
          </SettingsFormField>

          <SettingsFormField
              label="Folder name"
              htmlFor="ws-folder-name"
              description="Relative to the project root. Badge icon opens from the button on the left."
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
                  placeholder="e.g. notes"
                  className={cn(SETTINGS_FORM_INPUT_MONO, "flex-1 min-w-0")}
                />
              </div>
            </SettingsFormField>

            {form.function === "manuscript" ? (
              <SettingsFormField
                label="Main TeX file"
                htmlFor="ws-main-tex"
                description="Compile entry relative to the manuscript folder. Does not rename files on disk."
              >
                <Input
                  id="ws-main-tex"
                  value={form.mainTex}
                  onChange={(e) => setForm((f) => ({ ...f, mainTex: e.target.value }))}
                  placeholder="main.tex"
                  className={SETTINGS_FORM_INPUT_MONO}
                />
              </SettingsFormField>
            ) : null}

            {showTemplateDocClass ? (
              <SettingsFormField
                label="Default document class"
                htmlFor="ws-doc-class"
                description="Used when auto-generating main.tex for new projects."
              >
                <AppSelect
                  value={form.defaultDocClass}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, defaultDocClass: v as DocClass }))
                  }
                >
                  <AppSelectTrigger id="ws-doc-class" variant="dialog" className="w-full">
                    <AppSelectValue />
                  </AppSelectTrigger>
                  <AppSelectContent>
                    <AppSelectItem value="article">Article</AppSelectItem>
                    <AppSelectItem value="report">Report</AppSelectItem>
                    <AppSelectItem value="book">Book</AppSelectItem>
                  </AppSelectContent>
                </AppSelect>
              </SettingsFormField>
            ) : null}

            <SettingsFormField
              label="Description for AI agents"
              htmlFor="ws-folder-desc"
              description="Agents read this when reasoning about your project layout."
              labelExtra={
                <button
                  type="button"
                  className={SETTINGS_LABEL_RESET_ICON}
                  title="Reset to default"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      description: defaultDescriptionForFunction(f.function),
                    }))
                  }
                >
                  <RotateCcwIcon className="size-3" />
                </button>
              }
            >
              <Textarea
                id="ws-folder-desc"
                className={SETTINGS_FORM_TEXTAREA}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder={
                  DEFAULT_FUNCTION_DESCRIPTIONS[form.function] ||
                  "Explain what belongs in this folder so agents use it correctly."
                }
              />
            </SettingsFormField>
        </div>

        <div className={SETTINGS_DETAIL_ACTIONS}>
          <Button size="xs" onClick={save}>
            {slot.mode === "new" ? "Add folder" : "Save"}
          </Button>
          <Button variant="ghost" size="xs" onClick={closePanel}>
            Cancel
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
                Remove
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="!max-w-md">
          <DialogHeader>
            <DialogTitle>Remove folder</DialogTitle>
            <DialogDescription>
              Remove <span className="font-medium text-foreground">{existing?.name || "this folder"}</span>{" "}
              from {slot.scope === "project" ? "this project" : "the new project template"}? Only
              workspace configuration is updated — files on disk are not deleted.
              {isOnlyManuscript ? (
                <>
                  {" "}
                  Removing the only manuscript folder disables TeX workspace (editor + PDF preview).
                </>
              ) : null}
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
              onClick={remove}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
