import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useDocumentStore } from "@/stores/document-store";
import { useLayoutStore } from "@/stores/layout-store";
import { useCommandStore } from "@/stores/command-store";
import { closeSettingsPanel } from "@/stores/settings-panel-store";
import { cn } from "@/lib/utils";
import type { SettingsPanelSlot } from "@/lib/settings/settings-panel-slots";
import { isValidCommandName, promptTemplateForEdit } from "@commands/template-utils";
import {
  SETTINGS_DETAIL_ACTIONS,
  SETTINGS_DETAIL_SECTION,
  SETTINGS_DETAIL_SHELL,
  SETTINGS_FORM_INPUT,
  SETTINGS_FORM_INPUT_MONO,
  SETTINGS_FORM_TEXTAREA,
  SETTINGS_ROW_DESC,
} from "./settings-tokens";
import { SettingsFormField } from "./settings-form-field";

type CustomCommandSlot = Extract<SettingsPanelSlot, { kind: "custom-command" }>;

export function CustomCommandEditorPanel({ slot }: { slot: CustomCommandSlot }) {
  const { t } = useTranslation();
  const closePanel = closeSettingsPanel;
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const commands = useCommandStore((s) => s.commands);
  const commandsLoaded = useCommandStore((s) => s.loaded);
  const loadCommands = useCommandStore((s) => s.loadCommands);
  const createCommand = useCommandStore((s) => s.createCommand);
  const updateCommand = useCommandStore((s) => s.updateCommand);
  const deleteCommand = useCommandStore((s) => s.deleteCommand);

  const isNew = slot.mode === "new";
  const commandId = slot.mode === "edit" ? slot.commandId : undefined;

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [template, setTemplate] = useState("");

  useEffect(() => {
    void loadCommands();
  }, [loadCommands]);

  useEffect(() => {
    if (!projectRoot) {
      setLoading(false);
      return;
    }
    if (isNew) {
      setName("");
      setDescription("");
      setTemplate("");
      setDeleteDialogOpen(false);
      setLoading(false);
      return;
    }
    if (!commandsLoaded) return;

    const cmd = commands.find((c) => c.id === commandId);
    if (!cmd || cmd.source !== "user") {
      toast.error(t("settings.editor.command.toast.notFound"));
      closePanel();
      return;
    }

    setName(cmd.name);
    setDescription(cmd.description);
    setTemplate(promptTemplateForEdit(cmd.template));
    setDeleteDialogOpen(false);
    setLoading(false);
  }, [projectRoot, isNew, commandId, commands, commandsLoaded, closePanel]);

  const trimmedName = name.trim().toLowerCase();
  const nameValid = isValidCommandName(trimmedName);
  const canSave =
    nameValid && description.trim().length > 0 && template.trim().length > 0 && !saving;

  const handleSave = async () => {
    if (!projectRoot || !canSave) return;
    setSaving(true);
    try {
      const basePayload = {
        name: trimmedName,
        description: description.trim(),
        template: template.trim(),
      };

      if (isNew) {
        await createCommand(basePayload);
        toast.success(t("settings.editor.command.toast.added"));
      } else if (commandId) {
        await updateCommand(commandId, {
          ...basePayload,
          action: "",
        });
        toast.success(t("settings.editor.command.toast.saved"));
      }
      closePanel();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("settings.editor.command.toast.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!commandId) return;
    setDeleteDialogOpen(false);
    setSaving(true);
    try {
      await deleteCommand(commandId);
      toast.success(t("settings.editor.command.toast.deleted"));
      closePanel();
    } catch {
      toast.error(t("settings.editor.command.toast.deleteFailed"));
    } finally {
      setSaving(false);
    }
  };

  if (!projectRoot) {
    return (
      <div className="flex flex-1 items-center justify-center px-8 text-[length:var(--font-size-13)] text-muted-foreground">
        {t("settings.editor.command.openProject")}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-[length:var(--font-size-12)] text-muted-foreground">
        {t("common.loading")}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className={SETTINGS_DETAIL_SHELL}>
        <p className={SETTINGS_ROW_DESC}>{t("settings.editor.command.intro")}</p>

        {/!`[^`]+`/.test(template) ? (
          <p className="rounded-md border border-border bg-muted px-3 py-2 text-[length:var(--font-size-12)] text-muted-foreground">
            {t("settings.editor.command.shellExpandWarning")}{" "}
            <button
              type="button"
              className="text-primary underline-offset-2 hover:underline"
              onClick={() => useLayoutStore.getState().setSettingsCategory("permissions")}
            >
              {t("settings.editor.command.openPermissions")}
            </button>
          </p>
        ) : null}

        <div className={SETTINGS_DETAIL_SECTION}>
          <SettingsFormField
            label={t("settings.editor.command.name")}
            htmlFor="custom-command-name"
            description={t("settings.editor.command.nameDesc")}
          >
            <Input
              id="custom-command-name"
              className={SETTINGS_FORM_INPUT_MONO}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("settings.editor.command.namePlaceholder")}
            />
            {name.trim() && !nameValid ? (
              <p className="text-[length:var(--font-size-11)] text-destructive mt-1">
                {t("settings.editor.command.validationName")}
              </p>
            ) : null}
          </SettingsFormField>

          <SettingsFormField
            label={t("settings.editor.command.description")}
            htmlFor="custom-command-description"
          >
            <Input
              id="custom-command-description"
              className={SETTINGS_FORM_INPUT}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("settings.editor.command.descriptionPlaceholder")}
            />
          </SettingsFormField>

          <SettingsFormField
            label={t("settings.editor.command.template")}
            htmlFor="custom-command-template"
            description={t("settings.editor.command.templateDesc")}
          >
            <Textarea
              id="custom-command-template"
              className={cn(
                SETTINGS_FORM_TEXTAREA,
                "font-mono !text-[length:var(--font-size-12)]",
              )}
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              placeholder={t("settings.editor.command.templatePlaceholder")}
            />
            {!template.trim() && nameValid ? (
              <p className="text-[length:var(--font-size-11)] text-destructive mt-1">
                {t("settings.editor.command.validationTemplate")}
              </p>
            ) : null}
          </SettingsFormField>
        </div>

        <div className={SETTINGS_DETAIL_ACTIONS}>
          <Button size="xs" onClick={() => void handleSave()} disabled={!canSave}>
            {saving ? <Loader2Icon className="size-3 animate-spin mr-1" /> : null}
            {isNew ? t("settings.editor.command.add") : t("common.save")}
          </Button>
          <Button variant="ghost" size="xs" onClick={closePanel} disabled={saving}>
            {t("common.cancel")}
          </Button>
          {!isNew ? (
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
            <DialogTitle>{t("settings.editor.command.deleteTitle")}</DialogTitle>
            <DialogDescription>{t("settings.editor.command.deleteDesc")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              className="shadow-none"
              onClick={() => setDeleteDialogOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="shadow-none"
              disabled={saving}
              onClick={() => void handleDelete()}
            >
              {t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
