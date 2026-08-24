// MCP settings — flat list of every team’s MCP servers (team-owned, no Switch,
// no cross-team "+"). Click a row to configure; self-owned can be deleted.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  PlugIcon,
  FileJsonIcon,
  LibraryIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useDocumentStore } from "@/stores/document-store";
import { openSettingsPanel } from "@/stores/settings-panel-store";
import { useOnSettingsEditorKindsClosed } from "@/hooks/use-settings-editor";
import { mcpDesktop } from "@/lib/desktop-api/mcp";
import { listTeamAssets } from "@/stores/teams-store";
import { useMcpServersStore } from "@/stores/mcp-servers-store";
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
import type { McpServerDef } from "@shared/teams/types";
import { parseTeamMcpConfig, serializeTeamMcpConfig } from "@/lib/agent/mcp-config";
import {
  matchesAgentAssetQuery,
  type AgentAssetPaneProps,
} from "./agent-assets-shared";

const MCP_LIST_PREVIEW = 15;

function mcpTransportSummary(mcp: AssetViewV2): string {
  const def = mcp.definition as McpServerDef;
  if (def.transport.type === "http") return def.transport.url || "Remote (http)";
  const { command, args } = def.transport;
  const cmd = [command, ...(args ?? [])].join(" ");
  return cmd.length > 72 ? `${cmd.slice(0, 72)}…` : cmd;
}

export function ToolsMcpSettings({
  embedded = false,
  searchQuery = "",
}: AgentAssetPaneProps = {}) {
  const { t } = useTranslation();
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const saving = useMcpServersStore((s) => s.saving);
  const mcpRevision = useMcpServersStore((s) => s.revision);
  const deleteConfirm = useInlineDeleteConfirm();
  const [assets, setAssets] = useState<AssetViewV2[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [listExpanded, setListExpanded] = useState(false);

  const loadAll = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoaded(false);
    try {
      if (!projectRoot) {
        setAssets([]);
        return;
      }
      await mcpDesktop.mcpEnsure(projectRoot);
      const list = await listTeamAssets(projectRoot, "mcp");
      setAssets(list);
    } catch {
      setAssets([]);
    } finally {
      setLoaded(true);
    }
  }, [projectRoot]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Install / paste / JSON save bump revision while the right panel stays open —
  // refresh the flat list immediately (do not wait for panel close).
  useEffect(() => {
    if (mcpRevision === 0) return;
    void loadAll({ silent: true });
  }, [mcpRevision, loadAll]);

  useEffect(() => {
    setListExpanded(false);
  }, [projectRoot]);

  useOnSettingsEditorKindsClosed(
    ["mcp-json", "mcp-catalog", "mcp-paste-json", "mcp-server"],
    () => {
      void loadAll({ silent: true });
    },
  );

  const sortedAssets = useMemo(() => {
    const sorted = [...assets].sort(
      (a, b) => a.name.localeCompare(b.name) || a.teamId.localeCompare(b.teamId),
    );
    return sorted.filter((a) =>
      matchesAgentAssetQuery(
        searchQuery,
        a.name,
        a.id,
        a.fqid,
        a.description,
        a.teamId,
        a.origin.teamName,
        mcpTransportSummary(a),
      ),
    );
  }, [assets, searchQuery]);

  const visibleAssets = useMemo(() => {
    if (listExpanded || sortedAssets.length <= MCP_LIST_PREVIEW) return sortedAssets;
    return sortedAssets.slice(0, MCP_LIST_PREVIEW);
  }, [sortedAssets, listExpanded]);

  const hiddenCount = Math.max(0, sortedAssets.length - MCP_LIST_PREVIEW);
  const unfilteredCount = assets.length;

  const handleDelete = async (asset: AssetViewV2) => {
    if (!projectRoot || !asset.editable) return;
    deleteConfirm.clearPending();
    try {
      const { content } = await mcpDesktop.mcpReadTeamJson(projectRoot, asset.teamId);
      const next = parseTeamMcpConfig(content).filter((s) => s.name !== asset.id && s.name !== asset.name);
      await mcpDesktop.mcpWriteTeamJson(
        projectRoot,
        serializeTeamMcpConfig(next),
        asset.teamId,
      );
      toast.success(t("settings.mcp.toast.removed", { name: asset.name }));
      await loadAll({ silent: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("settings.mcp.toast.applyFailed"));
    }
  };

  const openMcp = (asset: AssetViewV2) => {
    deleteConfirm.clearPending();
    openSettingsPanel({
      kind: "mcp-server",
      serverName: asset.id || asset.name,
      title: asset.name,
      teamId: asset.teamId,
      readOnly: !asset.editable,
    });
  };

  const renderAddButtons = (className?: string) => (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Button
        variant="outline"
        size="xs"
        onClick={() => openSettingsPanel({ kind: "mcp-catalog" })}
      >
        <LibraryIcon className="size-3 mr-1" />
        {t("settings.mcp.install")}
      </Button>
      <Button
        variant="outline"
        size="xs"
        onClick={() => openSettingsPanel({ kind: "mcp-paste-json" })}
      >
        <FileJsonIcon className="size-3 mr-1" />
        {t("settings.mcp.addFromJson")}
      </Button>
    </div>
  );

  const listBody = !projectRoot ? (
    <div className={cn(CARD, "min-w-0 !divide-y-0")}>
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <PlugIcon className="size-8 text-muted-foreground/30" />
        <p className="text-[length:var(--font-size-13)] text-muted-foreground">
          {t("settings.mcp.openProject")}
        </p>
      </div>
    </div>
  ) : (
    <div className="min-w-0 space-y-3">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <p className={cn(CATEGORY_HEADER, "mb-0")}>{t("settings.mcp.installed")}</p>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          {renderAddButtons()}
          <Button
            variant="outline"
            size="xs"
            onClick={() => openSettingsPanel({ kind: "mcp-json" })}
            title={t("settings.mcp.editJsonHint")}
          >
            <FileJsonIcon className="size-3 mr-1" />
            {t("settings.mcp.editJson")}
          </Button>
        </div>
      </div>

      <div className={cn(CARD, "min-w-0 overflow-hidden")}>
        {!loaded ? (
          <div className="py-3 text-[length:var(--font-size-12)] text-muted-foreground">
            {t("common.loading")}
          </div>
        ) : unfilteredCount === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <PlugIcon className="size-8 text-muted-foreground/30" />
            <p className="text-[length:var(--font-size-13)] text-muted-foreground">
              {t("settings.mcp.empty")}
            </p>
            {renderAddButtons("justify-center")}
          </div>
        ) : sortedAssets.length === 0 ? (
          <div className="py-3 text-[length:var(--font-size-12)] text-muted-foreground">
            {t("settings.agentAssets.noMatches")}
          </div>
        ) : (
          <>
            {visibleAssets.map((asset) => {
              const teamLabel = teamDisplayName(
                asset.teamId,
                asset.origin.teamName,
                t,
              );
              const summary = mcpTransportSummary(asset);
              return (
                <div key={asset.fqid} className={cn(ROW, "min-w-0 items-start")}>
                  <button
                    type="button"
                    className="min-w-0 flex-1 pr-2 text-left"
                    disabled={saving}
                    onClick={() => openMcp(asset)}
                  >
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className={cn(ROW_LABEL, "min-w-0 max-w-full truncate font-mono")}>
                        {asset.name}
                      </span>
                      <span
                        className="min-w-0 max-w-full truncate text-[length:var(--font-size-11)] text-muted-foreground"
                        title={teamLabel}
                      >
                        {teamLabel}
                      </span>
                    </div>
                    {summary ? (
                      <p className={cn(ROW_DESC, "line-clamp-2 break-all font-mono")} title={summary}>
                        {summary}
                      </p>
                    ) : null}
                  </button>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {asset.editable && (
                      <InlineDeleteButton
                        itemId={asset.fqid}
                        pending={deleteConfirm.isPending(asset.fqid)}
                        disabled={saving}
                        onRequest={() => deleteConfirm.setPendingId(asset.fqid)}
                        onConfirm={() => void handleDelete(asset)}
                      />
                    )}
                  </div>
                </div>
              );
            })}
            {!listExpanded && hiddenCount > 0 && (
              <button
                type="button"
                className={cn(
                  ROW,
                  "w-full justify-center text-[length:var(--font-size-12)] text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setListExpanded(true)}
              >
                {t("settings.mcp.loadMore", { count: hiddenCount })}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );

  if (embedded) {
    return <div className="min-w-0 space-y-6">{listBody}</div>;
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl min-w-0 space-y-6 px-4 py-8 sm:px-8">
        <div className="min-w-0">
          <h2 className="text-[length:var(--font-dialog-title)] font-semibold">
            {t("settings.mcp.title")}
          </h2>
          <p className="mt-0.5 text-[length:var(--font-dialog-label)] text-muted-foreground">
            {t("settings.mcp.pageDesc")}
          </p>
        </div>
        {listBody}
      </div>
    </div>
  );
}
