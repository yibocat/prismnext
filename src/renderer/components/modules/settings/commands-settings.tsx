// Commands settings — uses AssetGroupList (design §8.4) as the list
// component, with teamsListAssets as the primary data source. The legacy
// useCommandStore is kept for export/import/edit/delete operations, bridged
// through renderActions by fqid lookup.
// Standard settings shell: max-w-3xl + SETTINGS_CARD + shadcn controls.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { PlusIcon } from "lucide-react";
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
  SETTINGS_CARD as CARD,
} from "./settings-tokens";
import { AssetGroupList } from "../teams/asset-group-list";
import type { AssetViewV2 } from "@shared/teams/view";
import { LOCAL_TEAM_ID } from "@shared/teams/types";
import type { CommandDef } from "@commands/types";

export default function CommandsSettings() {
  const { t } = useTranslation();
  const projectRoot = useDocumentStore((s) => s.projectRoot);

  // Primary data: AssetViewV2[] from the new resolver.
  const [assets, setAssets] = useState<AssetViewV2[]>([]);
  // Secondary data: CommandDef[] from useCommandStore (for edit/delete/export/import).
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
    incoming: string[]; conflicts: string[]; invalid: string[];
  } | null>(null);
  const [exporting, setExporting] = useState(false);

  // Index CommandDef by fqid for renderActions lookup.
  const cmdByFqid = useMemo(() => {
    const map = new Map<string, CommandDef>();
    for (const c of commands) map.set(c.id, c);
    return map;
  }, [commands]);

  const loadAll = useCallback(async () => {
    if (!projectRoot) {
      setAssets([]);
      return;
    }
    try {
      const [assetList] = await Promise.all([
        window.electronAPI.teamsListAssets(projectRoot, "command"),
        loadCommands(),
      ]);
      setAssets(assetList);
    } catch {
      setAssets([]);
    }
  }, [projectRoot, loadCommands]);

  useEffect(() => { void loadAll(); }, [loadAll]);
  useEffect(() => { void loadAll(); }, [loadAll, commands]);

  useOnSettingsEditorKindsClosed(["custom-command", "builtin-commands"], () => {
    void loadAll();
  });

  const customCount = commands.filter((c) => c.teamId === LOCAL_TEAM_ID).length;

  const handleSetEnabled = useCallback(async (fqid: string, enabled: boolean | null) => {
    if (!projectRoot) return;
    deleteConfirm.clearPending();
    setAssets((cur) => cur.map((a) => (a.fqid === fqid ? { ...a, enabled: enabled ?? true } : a)));
    try {
      await window.electronAPI.teamsSetAssetEnabled(projectRoot, fqid, enabled, "project");
      await loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      await loadAll();
    }
  }, [projectRoot, deleteConfirm, loadAll]);

  const openEdit = (commandId: string, title: string) => {
    deleteConfirm.clearPending();
    openSettingsPanel({ kind: "custom-command", mode: "edit", commandId, title });
  };

  const confirmDelete = async (id: string) => {
    deleteConfirm.clearPending();
    await deleteCommand(id);
    await loadAll();
  };

  const handleExport = async () => {
    if (!projectRoot) return;
    setExporting(true);
    try {
      const dlg = await window.electronAPI.dialogSaveJsonFile("prismnext-commands.json");
      if (dlg.canceled || !dlg.path) return;
      await writeExportFile(dlg.path, projectRoot);
      toast.success(t("settings.commandsPage.toast.exported"));
    } catch (err) {
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
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("settings.commandsPage.toast.importReadFailed"));
    }
  };

  const renderActions = (asset: AssetViewV2) => {
    const cmd = cmdByFqid.get(asset.fqid);
    if (!cmd || cmd.teamId !== LOCAL_TEAM_ID) return null;
    return (
      <div className="flex items-center gap-2 shrink-0">
        <Button variant="ghost" size="xs" className="shrink-0" onClick={() => openEdit(cmd.id, cmd.name)}>
          {t("common.edit")}
        </Button>
        <InlineDeleteButton itemId={cmd.id} pending={deleteConfirm.isPending(cmd.id)} disabled={false}
          onRequest={() => deleteConfirm.setPendingId(cmd.id)}
          onConfirm={() => void confirmDelete(cmd.id)} />
      </div>
    );
  };

  if (!projectRoot) {
    return (
      <div className={cn(CARD, "!divide-y-0")}>
        <div className="py-3 text-[length:var(--font-size-12)] text-muted-foreground">
          {t("settings.commandsPage.openProject")}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-8 py-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[length:var(--font-dialog-title)] font-semibold">{t("settings.commandsPage.title")}</h2>
            <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">{t("settings.commandsPage.pageDesc")}</p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <Button variant="outline" size="xs" onClick={() => openSettingsPanel({ kind: "custom-command", mode: "new" })}>
            <PlusIcon className="size-3 mr-1" />{t("settings.commandsPage.addCustom")}
          </Button>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="xs" className="shrink-0" disabled={exporting || customCount === 0}
              onClick={() => void handleExport()}>
              {t("settings.commandsPage.export")}
            </Button>
            <Button variant="ghost" size="xs" className="shrink-0" onClick={() => void handleImportPick()}>
              {t("settings.commandsPage.importBtn")}
            </Button>
          </div>
        </div>

        {!loaded ? (
          <div className={cn(CARD, "py-3 text-[length:var(--font-size-12)] text-muted-foreground")}>
            {t("common.loading")}
          </div>
        ) : assets.length === 0 ? (
          <div className={cn(CARD, "!divide-y-0")}>
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-[length:var(--font-size-13)] text-muted-foreground">{t("settings.commandsPage.emptyCommands")}</p>
            </div>
          </div>
        ) : (
          <AssetGroupList
            assets={assets}
            onSetEnabled={handleSetEnabled}
            renderActions={renderActions}
            emptyHint={t("settings.commandsPage.emptyCommands")}
          />
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
            onComplete={() => void loadAll()}
          />
        ) : null}
      </div>
    </div>
  );
}
