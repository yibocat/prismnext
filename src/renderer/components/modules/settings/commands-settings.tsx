// Commands settings — flat SETTINGS_CARD list (name · team · description),
// aligned with Skills / MCP. No per-command Switch — availability is the
// active team's Commands allowlist (+ foreign) plus enabled assets.
// New commands always pick a writable team (Project / Common / custom).
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { PlusIcon, TerminalIcon } from "lucide-react";
import { useCommandStore } from "@/stores/command-store";
import { useDocumentStore } from "@/stores/document-store";
import { openSettingsPanel } from "@/stores/settings-panel-store";
import { useOnSettingsEditorKindsClosed } from "@/hooks/use-settings-editor";
import { teamDisplayName } from "@/lib/teams/team-display-name";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useInlineDeleteConfirm } from "@/hooks/use-inline-delete-confirm";
import { InlineDeleteButton } from "./inline-delete-button";
import {
  SETTINGS_CARD as CARD,
  SETTINGS_CATEGORY_HEADER as CATEGORY_HEADER,
  SETTINGS_ROW as ROW,
  SETTINGS_ROW_DESC as ROW_DESC,
  SETTINGS_ROW_LABEL as ROW_LABEL,
} from "./settings-tokens";
import type { AssetViewV2 } from "@shared/teams/view";
import type { CommandDef } from "@commands/types";

const COMMANDS_LIST_PREVIEW = 15;

export default function CommandsSettings() {
  const { t } = useTranslation();
  const projectRoot = useDocumentStore((s) => s.projectRoot);

  const [assets, setAssets] = useState<AssetViewV2[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [listExpanded, setListExpanded] = useState(false);
  const [saving, setSaving] = useState(false);

  const commands = useCommandStore((s) => s.commands);
  const loadCommands = useCommandStore((s) => s.loadCommands);
  const deleteCommand = useCommandStore((s) => s.deleteCommand);

  const deleteConfirm = useInlineDeleteConfirm();

  const cmdByFqid = useMemo(() => {
    const map = new Map<string, CommandDef>();
    for (const c of commands) map.set(c.id, c);
    return map;
  }, [commands]);

  const sortedAssets = useMemo(
    () =>
      [...assets].sort(
        (a, b) => a.name.localeCompare(b.name) || a.teamId.localeCompare(b.teamId),
      ),
    [assets],
  );

  const visibleAssets = useMemo(() => {
    if (listExpanded || sortedAssets.length <= COMMANDS_LIST_PREVIEW) return sortedAssets;
    return sortedAssets.slice(0, COMMANDS_LIST_PREVIEW);
  }, [sortedAssets, listExpanded]);

  const hiddenCount = Math.max(0, sortedAssets.length - COMMANDS_LIST_PREVIEW);

  const loadAll = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoaded(false);
    try {
      if (!projectRoot) {
        setAssets([]);
        return;
      }
      const [assetList] = await Promise.all([
        window.electronAPI.teamsListAssets(projectRoot, "command"),
        loadCommands(),
      ]);
      setAssets(assetList);
    } catch {
      setAssets([]);
    } finally {
      setLoaded(true);
    }
  }, [projectRoot, loadCommands]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    setListExpanded(false);
  }, [projectRoot]);

  useOnSettingsEditorKindsClosed(["custom-command", "builtin-commands"], () => {
    void loadAll({ silent: true });
  });

  const openCreate = () => {
    deleteConfirm.clearPending();
    openSettingsPanel({ kind: "custom-command", mode: "new" });
  };

  const openCommand = (asset: AssetViewV2) => {
    deleteConfirm.clearPending();
    openSettingsPanel({
      kind: "custom-command",
      mode: "edit",
      commandId: asset.fqid,
      title: `/${asset.name}`,
      teamId: asset.teamId,
    });
  };

  const confirmDelete = async (fqid: string) => {
    deleteConfirm.clearPending();
    setSaving(true);
    try {
      await deleteCommand(fqid);
      await loadAll({ silent: true });
      toast.success(t("settings.commandsPage.toast.removed", { name: fqid.split(":").pop() }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("settings.editor.command.toast.deleteFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-8 py-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[length:var(--font-dialog-title)] font-semibold">
              {t("settings.commandsPage.title")}
            </h2>
            <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">
              {t("settings.commandsPage.pageDesc")}
            </p>
            <p className="mt-1 text-[length:var(--font-size-11)] text-muted-foreground">
              {t("settings.commandsPage.appHint")}
            </p>
          </div>
        </div>

        {!projectRoot ? (
          <div className={cn(CARD, "!divide-y-0")}>
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <TerminalIcon className="size-8 text-muted-foreground/30" />
              <p className="text-[length:var(--font-size-13)] text-muted-foreground">
                {t("settings.commandsPage.openProject")}
              </p>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
              <p className={cn(CATEGORY_HEADER, "mb-0")}>{t("settings.commandsPage.installed")}</p>
              <Button variant="outline" size="xs" onClick={openCreate}>
                <PlusIcon className="size-3 mr-1" />
                {t("settings.commandsPage.addCustom")}
              </Button>
            </div>

            {!loaded ? (
              <div className={cn(CARD, "py-3 text-[length:var(--font-size-12)] text-muted-foreground")}>
                {t("common.loading")}
              </div>
            ) : sortedAssets.length === 0 ? (
              <div className={cn(CARD, "!divide-y-0")}>
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <TerminalIcon className="size-8 text-muted-foreground/30" />
                  <p className="text-[length:var(--font-size-13)] text-muted-foreground">
                    {t("settings.commandsPage.emptyCommands")}
                  </p>
                  <Button variant="outline" size="xs" onClick={openCreate}>
                    <PlusIcon className="size-3 mr-1" />
                    {t("settings.commandsPage.addCustom")}
                  </Button>
                </div>
              </div>
            ) : (
              <div className={CARD}>
                {visibleAssets.map((asset) => {
                  const cmd = cmdByFqid.get(asset.fqid);
                  const canDelete = Boolean(cmd?.removable ?? asset.editable);
                  const teamLabel = teamDisplayName(
                    asset.teamId,
                    asset.origin.teamName,
                    t,
                  );
                  const description = (cmd?.description || asset.description || "").trim();

                  return (
                    <div key={asset.fqid} className={ROW}>
                      <button
                        type="button"
                        className="min-w-0 flex-1 pr-3 text-left"
                        disabled={saving}
                        onClick={() => openCommand(asset)}
                      >
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 min-w-0">
                          <span className={cn(ROW_LABEL, "font-mono shrink-0")}>
                            /{asset.name}
                          </span>
                          <span
                            className="text-[length:var(--font-size-11)] text-muted-foreground truncate min-w-0"
                            title={teamLabel}
                          >
                            {teamLabel}
                          </span>
                        </div>
                        {description ? (
                          <p className={cn(ROW_DESC, "truncate")} title={description}>
                            {description}
                          </p>
                        ) : null}
                      </button>
                      {canDelete ? (
                        <InlineDeleteButton
                          itemId={asset.fqid}
                          pending={deleteConfirm.isPending(asset.fqid)}
                          disabled={saving}
                          onRequest={() => deleteConfirm.setPendingId(asset.fqid)}
                          onConfirm={() => void confirmDelete(asset.fqid)}
                        />
                      ) : null}
                    </div>
                  );
                })}
                {!listExpanded && hiddenCount > 0 ? (
                  <button
                    type="button"
                    className={cn(
                      ROW,
                      "w-full justify-center text-[length:var(--font-size-12)] text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => setListExpanded(true)}
                  >
                    {t("settings.commandsPage.loadMore", { count: hiddenCount })}
                  </button>
                ) : null}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
