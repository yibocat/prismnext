import { useEffect, useState } from "react";
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
      toast.error("Command not found.");
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
        toast.success("Command added.");
      } else if (commandId) {
        await updateCommand(commandId, {
          ...basePayload,
          action: "",
        });
        toast.success("Command saved.");
      }
      closePanel();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save command.");
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
      toast.success("Command deleted.");
      closePanel();
    } catch {
      toast.error("Failed to delete command.");
    } finally {
      setSaving(false);
    }
  };

  if (!projectRoot) {
    return (
      <div className="flex flex-1 items-center justify-center px-8 text-[length:var(--font-size-13)] text-muted-foreground">
        Open a project to create custom commands.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-[length:var(--font-size-12)] text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className={SETTINGS_DETAIL_SHELL}>
        <p className={SETTINGS_ROW_DESC}>
          Reusable prompt for{" "}
          <code className="text-[length:var(--font-size-11)] bg-muted px-1 rounded">
            /{trimmedName || "name"}
          </code>
          . Stored in{" "}
          <code className="text-[length:var(--font-size-11)] bg-muted px-1 rounded">
            .prismnext/agent/commands/
          </code>
          .
        </p>

        <div className={SETTINGS_DETAIL_SECTION}>
          <SettingsFormField
            label="Command name"
            htmlFor="custom-command-name"
            description="Lowercase letters, numbers, and hyphens. No leading slash."
          >
            <Input
              id="custom-command-name"
              className={SETTINGS_FORM_INPUT_MONO}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="review-section"
            />
            {name.trim() && !nameValid ? (
              <p className="text-[length:var(--font-size-11)] text-destructive mt-1">
                Use lowercase letters, numbers, and hyphens only.
              </p>
            ) : null}
          </SettingsFormField>

          <SettingsFormField label="Description" htmlFor="custom-command-description">
            <Input
              id="custom-command-description"
              className={SETTINGS_FORM_INPUT}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short description for the / menu"
            />
          </SettingsFormField>

          <SettingsFormField
            label="Prompt template"
            htmlFor="custom-command-template"
            description="Supports $ARGUMENTS, $1…$9, and @path/to/file."
          >
            <Textarea
              id="custom-command-template"
              className={cn(
                SETTINGS_FORM_TEXTAREA,
                "font-mono !text-[length:var(--font-size-12)]",
              )}
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              placeholder="Review this section for clarity: $ARGUMENTS"
            />
          </SettingsFormField>
        </div>

        <div className={SETTINGS_DETAIL_ACTIONS}>
          <Button size="xs" onClick={() => void handleSave()} disabled={!canSave}>
            {saving ? <Loader2Icon className="size-3 animate-spin mr-1" /> : null}
            {isNew ? "Add command" : "Save"}
          </Button>
          <Button variant="ghost" size="xs" onClick={closePanel} disabled={saving}>
            Cancel
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
                Delete
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="!max-w-md">
          <DialogHeader>
            <DialogTitle>Delete command</DialogTitle>
            <DialogDescription>
              Permanently delete{" "}
              <span className="font-medium text-foreground">
                /{trimmedName || "this command"}
              </span>
              ? This removes the command file from the project.
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
              onClick={() => void handleDelete()}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
