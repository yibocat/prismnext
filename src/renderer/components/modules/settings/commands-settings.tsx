import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useCommandStore } from "@/stores/command-store";
import { useDocumentStore } from "@/stores/document-store";
import { openSettingsPanel } from "@/stores/settings-panel-store";
import { useOnSettingsEditorKindsClosed } from "@/hooks/use-settings-editor";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useInlineDeleteConfirm } from "@/hooks/use-inline-delete-confirm";
import { InlineDeleteButton } from "./inline-delete-button";
import { CommandsImportDialog } from "./commands-import-dialog";
import {
  SETTINGS_CARD,
  SETTINGS_ROW,
  SETTINGS_ROW_DESC,
  SETTINGS_ROW_LABEL,
} from "./settings-tokens";

const SUB_HEADER = "text-[length:var(--font-size-12)] font-medium text-foreground mb-1.5";
const SUB_DESC = "text-[length:var(--font-size-12)] text-muted-foreground mb-2";

export default function CommandsSettings() {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const commands = useCommandStore((s) => s.commands);
  const loaded = useCommandStore((s) => s.loaded);
  const loadCommands = useCommandStore((s) => s.loadCommands);
  const deleteCommand = useCommandStore((s) => s.deleteCommand);
  const writeExportFile = useCommandStore((s) => s.writeExportFile);
  const readImportFile = useCommandStore((s) => s.readImportFile);
  const previewImport = useCommandStore((s) => s.previewImport);

  const deleteConfirm = useInlineDeleteConfirm();

  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importPack, setImportPack] = useState<unknown>(null);
  const [importPreview, setImportPreview] = useState<{
    incoming: string[];
    conflicts: string[];
    invalid: string[];
  } | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    void loadCommands();
  }, [loadCommands]);

  useOnSettingsEditorKindsClosed(["custom-command", "builtin-commands"], () => {
    void loadCommands();
  });

  const customCommands = commands.filter((c) => c.source === "user");
  const builtInCount = commands.filter((c) => c.source === "builtin").length;
  const builtInEnabledCount = commands.filter((c) => c.source === "builtin" && c.enabled).length;

  const openEdit = (commandId: string, title: string) => {
    deleteConfirm.clearPending();
    openSettingsPanel({
      kind: "custom-command",
      mode: "edit",
      commandId,
      title,
    });
  };

  const confirmDelete = async (id: string) => {
    deleteConfirm.clearPending();
    await deleteCommand(id);
  };

  const handleExport = async () => {
    if (!projectRoot) return;
    setExporting(true);
    try {
      const dlg = await window.electronAPI.dialogSaveJsonFile("prismnext-commands.json");
      if (dlg.canceled || !dlg.path) return;
      await writeExportFile(dlg.path, projectRoot);
      toast.success("Commands exported.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  };

  const handleImportPick = async () => {
    if (!projectRoot) return;
    try {
      const dlg = await window.electronAPI.dialogOpenJsonFile();
      if (dlg.canceled || !dlg.path) return;
      const pack = await readImportFile(dlg.path);
      const preview = await previewImport(projectRoot, pack);
      if (preview.incoming.length === 0) {
        toast.error("No valid commands found in file.");
        return;
      }
      setImportPack(pack);
      setImportPreview(preview);
      setImportDialogOpen(true);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not read import file.");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className={SUB_HEADER}>Built-in commands</p>
        <p className={SUB_DESC}>
          App slash shortcuts (compile, setup, checkpoints). Toggle visibility in the composer{" "}
          <span className="font-mono">/</span> menu.
        </p>
        <div className={SETTINGS_CARD}>
          <div className={SETTINGS_ROW}>
            <div className="min-w-0 flex-1 pr-4">
              <p className={SETTINGS_ROW_LABEL}>App shortcuts</p>
              <p className={SETTINGS_ROW_DESC}>
                {loaded && builtInCount > 0
                  ? `${builtInEnabledCount} of ${builtInCount} enabled in the composer menu.`
                  : "Loading built-in commands…"}
              </p>
            </div>
            <Button
              variant="ghost"
              size="xs"
              className="shrink-0"
              onClick={() => openSettingsPanel({ kind: "builtin-commands" })}
            >
              View built-in commands
            </Button>
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-start justify-between gap-3 mb-1.5">
          <p className={SUB_HEADER}>Custom commands</p>
          {projectRoot ? (
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="xs"
                className="shrink-0"
                disabled={exporting || customCommands.length === 0}
                onClick={() => void handleExport()}
              >
                Export
              </Button>
              <Button
                variant="ghost"
                size="xs"
                className="shrink-0"
                onClick={() => void handleImportPick()}
              >
                Import
              </Button>
            </div>
          ) : null}
        </div>
        {!projectRoot ? (
          <p className={SUB_DESC}>Open a project to create and manage custom commands.</p>
        ) : (
          <>
            <p className={SUB_DESC}>
              Per-project prompt templates in{" "}
              <code className="text-[length:var(--font-size-11)] bg-muted px-1 py-0.5 rounded">
                .prismnext/agent/commands/
              </code>
            </p>
            <div className={SETTINGS_CARD}>
              {customCommands.length === 0 ? (
                <div className={cn(SETTINGS_ROW, "!block")}>
                  <p className="text-[length:var(--font-size-12)] text-muted-foreground">
                    No custom commands yet.
                  </p>
                </div>
              ) : (
                customCommands.map((cmd) => (
                  <div key={cmd.id} className={SETTINGS_ROW}>
                    <div className="min-w-0 flex-1 pr-4">
                      <div className="flex items-center gap-2">
                        <p className={SETTINGS_ROW_LABEL}>/{cmd.name}</p>
                      </div>
                      <p className={SETTINGS_ROW_DESC}>{cmd.description}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="ghost"
                        size="xs"
                        className="shrink-0"
                        onClick={() => openEdit(cmd.id, cmd.name)}
                      >
                        Edit
                      </Button>
                      <InlineDeleteButton
                        itemId={cmd.id}
                        pending={deleteConfirm.isPending(cmd.id)}
                        onRequest={() => deleteConfirm.setPendingId(cmd.id)}
                        onConfirm={() => void confirmDelete(cmd.id)}
                      />
                    </div>
                  </div>
                ))
              )}
              <div className="py-2.5">
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() =>
                    openSettingsPanel({ kind: "custom-command", mode: "new" })
                  }
                >
                  + Add custom command
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {projectRoot && importPreview && importPack ? (
        <CommandsImportDialog
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
          projectRoot={projectRoot}
          conflictCount={importPreview.conflicts.length}
          invalidCount={importPreview.invalid.length}
          incomingCount={importPreview.incoming.length}
          pack={importPack}
          onComplete={() => void loadCommands()}
        />
      ) : null}
    </div>
  );
}
