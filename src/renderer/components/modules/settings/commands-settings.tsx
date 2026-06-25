import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useCommandStore } from "@/stores/command-store";
import { useDocumentStore } from "@/stores/document-store";
import { openSettingsPanel } from "@/stores/settings-panel-store";
import { useOnSettingsEditorKindsClosed } from "@/hooks/use-settings-editor";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useInlineDeleteConfirm } from "@/hooks/use-inline-delete-confirm";
import { InlineDeleteButton } from "./inline-delete-button";
import { CommandsImportDialog } from "./commands-import-dialog";

const CARD = "rounded-lg border border-border px-4 divide-y divide-border";
const ROW = "flex items-center justify-between py-2.5 group";
const ROW_LABEL = "text-[length:var(--font-size-13)] font-medium";
const ROW_DESC = "text-[length:var(--font-size-12)] text-muted-foreground mt-0.5 truncate";
const BADGE =
  "inline-flex items-center rounded px-1.5 py-0.5 text-[length:var(--font-size-10)] font-medium uppercase tracking-wide";
const SUB_HEADER = "text-[length:var(--font-size-12)] font-medium text-foreground mb-1.5";
const SUB_DESC = "text-[length:var(--font-size-12)] text-muted-foreground mb-2";

export default function CommandsSettings() {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const commands = useCommandStore((s) => s.commands);
  const loaded = useCommandStore((s) => s.loaded);
  const loadCommands = useCommandStore((s) => s.loadCommands);
  const deleteCommand = useCommandStore((s) => s.deleteCommand);
  const toggleCommand = useCommandStore((s) => s.toggleCommand);
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

  useOnSettingsEditorKindsClosed(["custom-command"], () => {
    void loadCommands();
  });

  const builtInCommands = commands.filter((c) => c.source === "builtin");
  const customCommands = commands.filter((c) => c.source === "user");

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
        <p className={SUB_HEADER}>App shortcuts</p>
        <p className={SUB_DESC}>
          Built-in slash commands that run locally in the app (compile, setup, checkpoints). Toggle
          to enable or disable. Combine with free text in chat when needed.
        </p>
        <div className={CARD}>
          {!loaded ? (
            <div className={cn(ROW, "!block")}>
              <p className="text-[length:var(--font-size-12)] text-muted-foreground">Loading…</p>
            </div>
          ) : builtInCommands.length === 0 ? (
            <div className={cn(ROW, "!block")}>
              <p className="text-[length:var(--font-size-12)] text-muted-foreground">
                No built-in commands available.
              </p>
            </div>
          ) : (
            builtInCommands.map((cmd) => (
              <div key={cmd.id} className={ROW}>
                <div className="min-w-0 flex-1 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-primary text-[length:var(--font-size-13)] font-medium">
                      /{cmd.name}
                    </span>
                    {cmd.action ? (
                      <span className={cn(BADGE, "bg-primary/10 text-primary")}>Shortcut</span>
                    ) : null}
                    <span className={cn(BADGE, "bg-muted text-muted-foreground")}>Built-in</span>
                  </div>
                  <p className={ROW_DESC}>{cmd.description}</p>
                </div>
                <Switch
                  checked={cmd.enabled}
                  onCheckedChange={(v) => toggleCommand(cmd.id, v)}
                />
              </div>
            ))
          )}
        </div>
      </div>

      <div>
        <div className="flex items-start justify-between gap-3 mb-1.5">
          <p className={SUB_HEADER}>Custom Commands</p>
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
            <div className={CARD}>
              {customCommands.length === 0 ? (
                <div className={cn(ROW, "!block")}>
                  <p className="text-[length:var(--font-size-12)] text-muted-foreground">
                    No custom commands yet.
                  </p>
                </div>
              ) : (
                customCommands.map((cmd) => (
                  <div key={cmd.id} className={ROW}>
                    <div className="min-w-0 flex-1 pr-4">
                      <div className="flex items-center gap-2">
                        <p className={ROW_LABEL}>/{cmd.name}</p>
                      </div>
                      <p className={ROW_DESC}>{cmd.description}</p>
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
