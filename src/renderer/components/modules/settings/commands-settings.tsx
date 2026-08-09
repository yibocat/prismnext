// Commands settings — unified single-card list (mirrors Teams & Agents).
// Every slash command is one row: /name + description + origin badge
// (Built-in / pack name / My commands) + an enable switch. When the list
// grows long it folds to a preview with "Show all (N) / Show less".
// App-level vs project-level follows the owning TEAM: a command whose pack is
// installed at app level but DISABLED in this project is greyed out (row dimmed
// + switch disabled) — same visual language as the team cards.
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { PlusIcon } from "lucide-react";
import { useCommandStore } from "@/stores/command-store";
import { useDocumentStore } from "@/stores/document-store";
import { usePacksStore } from "@/stores/packs-store";
import { openSettingsPanel } from "@/stores/settings-panel-store";
import { useOnSettingsEditorKindsClosed } from "@/hooks/use-settings-editor";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useInlineDeleteConfirm } from "@/hooks/use-inline-delete-confirm";
import { InlineDeleteButton } from "./inline-delete-button";
import { CommandsImportDialog } from "./commands-import-dialog";
import type { CommandDef } from "@commands/types";
import { CORE_PACK_ID, LOCAL_PACK_ID } from "@shared/packs/types";
import {
  SETTINGS_CARD,
  SETTINGS_ROW,
  SETTINGS_ROW_DESC,
  SETTINGS_ROW_LABEL,
} from "./settings-tokens";

const BADGE =
  "inline-flex items-center rounded px-1.5 py-0.5 text-[length:var(--font-size-10)] font-medium uppercase tracking-wide shrink-0";
/** Fold long lists after this many rows (like Skills). */
const COMMANDS_PAGE_INITIAL_COUNT = 10;

/** Origin badge: core pack → "Built-in"; local → "My commands"; else pack name. */
function originBadge(cmd: CommandDef, t: (key: string) => string) {
  if (cmd.packId === CORE_PACK_ID) {
    return (
      <span className={cn(BADGE, "bg-muted text-muted-foreground")}>
        {t("settings.commandsPage.builtin")}
      </span>
    );
  }
  if (cmd.packId === LOCAL_PACK_ID) {
    return (
      <span className={cn(BADGE, "bg-muted text-muted-foreground")}>
        {t("settings.commandsPage.mine")}
      </span>
    );
  }
  return (
    <span className={cn(BADGE, "bg-muted text-muted-foreground")}>{cmd.packName}</span>
  );
}

/** Sort: core built-ins first, then packs alphabetically, then my commands. */
function sortCommands(cmds: CommandDef[]): CommandDef[] {
  const rank = (c: CommandDef) =>
    c.packId === CORE_PACK_ID ? 0 : c.packId === LOCAL_PACK_ID ? 2 : 1;
  return [...cmds].sort(
    (a, b) => rank(a) - rank(b) || a.packName.localeCompare(b.packName) || a.name.localeCompare(b.name),
  );
}

export default function CommandsSettings() {
  const { t } = useTranslation();
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const commands = useCommandStore((s) => s.commands);
  const loaded = useCommandStore((s) => s.loaded);
  const loadCommands = useCommandStore((s) => s.loadCommands);
  const deleteCommand = useCommandStore((s) => s.deleteCommand);
  const toggleCommand = useCommandStore((s) => s.toggleCommand);
  const writeExportFile = useCommandStore((s) => s.writeExportFile);
  const readImportFile = useCommandStore((s) => s.readImportFile);
  const previewImport = useCommandStore((s) => s.previewImport);

  // App-level install → project-level enable lives on the owning pack.
  const packs = usePacksStore((s) => s.catalog);
  const packEnabledById = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const p of packs) map.set(p.manifest.id, p.enabled);
    return map;
  }, [packs]);

  const deleteConfirm = useInlineDeleteConfirm();

  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importPack, setImportPack] = useState<unknown>(null);
  const [importPreview, setImportPreview] = useState<{
    incoming: string[];
    conflicts: string[];
    invalid: string[];
  } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [showAllCommands, setShowAllCommands] = useState(false);

  useEffect(() => {
    void loadCommands();
  }, [loadCommands]);

  // Reload when the packs store changes (install / enable / disable at app or
  // project level) — command enabled flags follow the resolver view.
  useEffect(() => {
    void loadCommands();
  }, [packs, loadCommands]);

  useEffect(() => {
    setShowAllCommands(false);
  }, [projectRoot]);

  useOnSettingsEditorKindsClosed(["custom-command", "builtin-commands"], () => {
    void loadCommands();
  });

  const sorted = useMemo(() => sortCommands(commands), [commands]);
  const visibleCommands =
    showAllCommands || sorted.length <= COMMANDS_PAGE_INITIAL_COUNT
      ? sorted
      : sorted.slice(0, COMMANDS_PAGE_INITIAL_COUNT);
  const hasMoreCommands = sorted.length > COMMANDS_PAGE_INITIAL_COUNT;
  const customCount = commands.filter((c) => c.packId === LOCAL_PACK_ID).length;

  /** A command's owning pack must be enabled in THIS project for it to run. */
  const packEnabled = (cmd: CommandDef): boolean => {
    if (cmd.packId === LOCAL_PACK_ID) return true;
    return packEnabledById.get(cmd.packId) ?? true;
  };

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
      toast.success(t("settings.commandsPage.toast.exported"));
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
        toast.error(t("settings.commandsPage.toast.noValid"));
        return;
      }
      setImportPack(pack);
      setImportPreview(preview);
      setImportDialogOpen(true);
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : t("settings.commandsPage.toast.importReadFailed"),
      );
    }
  };

  if (!projectRoot) {
    return (
      <div className={SETTINGS_CARD}>
        <div className={cn(SETTINGS_ROW, "!block")}>
          <p className="text-[length:var(--font-size-12)] text-muted-foreground">
            {t("settings.commandsPage.openProject")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toolbar: create / import / export (project-level, My commands) */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="xs"
            onClick={() => openSettingsPanel({ kind: "custom-command", mode: "new" })}
          >
            <PlusIcon className="size-3 mr-1" />
            {t("settings.commandsPage.addCustom")}
          </Button>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="xs"
            className="shrink-0"
            disabled={exporting || customCount === 0}
            onClick={() => void handleExport()}
          >
            {t("settings.commandsPage.export")}
          </Button>
          <Button
            variant="ghost"
            size="xs"
            className="shrink-0"
            onClick={() => void handleImportPick()}
          >
            {t("settings.commandsPage.importBtn")}
          </Button>
        </div>
      </div>

      {!loaded ? (
        <div className={cn(SETTINGS_CARD, "py-3")}>
          <p className="text-[length:var(--font-size-12)] text-muted-foreground">
            {t("common.loading")}
          </p>
        </div>
      ) : sorted.length === 0 ? (
        <div className={cn(SETTINGS_CARD, "!divide-y-0")}>
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-[length:var(--font-size-13)] text-muted-foreground">
              {t("settings.commandsPage.emptyCommands")}
            </p>
          </div>
        </div>
      ) : (
        <div className={SETTINGS_CARD}>
          {visibleCommands.map((cmd) => {
            const packOn = packEnabled(cmd);
            return (
              <div
                key={cmd.id}
                className={cn(SETTINGS_ROW, !packOn && "opacity-60")}
              >
                <div className="min-w-0 flex-1 pr-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className={SETTINGS_ROW_LABEL}>/{cmd.name}</p>
                    {originBadge(cmd, t)}
                    {!packOn && (
                      <span className={cn(BADGE, "bg-destructive/10 text-destructive")}>
                        {t("settings.commandsPage.disabledInProject")}
                      </span>
                    )}
                  </div>
                  <p className={SETTINGS_ROW_DESC}>{cmd.description}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {cmd.packId === LOCAL_PACK_ID ? (
                    <>
                      <Button
                        variant="ghost"
                        size="xs"
                        className="shrink-0"
                        onClick={() => openEdit(cmd.id, cmd.name)}
                      >
                        {t("common.edit")}
                      </Button>
                      <InlineDeleteButton
                        itemId={cmd.id}
                        pending={deleteConfirm.isPending(cmd.id)}
                        onRequest={() => deleteConfirm.setPendingId(cmd.id)}
                        onConfirm={() => void confirmDelete(cmd.id)}
                      />
                    </>
                  ) : null}
                  <Switch
                    checked={cmd.enabled}
                    disabled={!packOn}
                    onCheckedChange={(enabled) => void toggleCommand(cmd.id, enabled)}
                    aria-label={`Enable /${cmd.name}`}
                  />
                </div>
              </div>
            );
          })}
          {hasMoreCommands && (
            <div className="py-2.5 flex justify-center border-t border-border">
              <Button
                variant="ghost"
                size="xs"
                className="text-[length:var(--font-size-12)] text-muted-foreground"
                onClick={() => setShowAllCommands((v) => !v)}
              >
                {showAllCommands
                  ? t("settings.commandsPage.showLess")
                  : t("settings.commandsPage.showAll", { count: sorted.length })}
              </Button>
            </div>
          )}
        </div>
      )}

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
