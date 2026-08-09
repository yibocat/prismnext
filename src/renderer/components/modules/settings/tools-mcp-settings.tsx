// MCP settings — unified list of every MCP server this project can use.
// Each row carries its SOURCE clearly:
//   - From team <name>  (pack-declared, app-level resource, project-gated;
//                        read-only — follows the owning team, greyed out when
//                        the team is disabled in this project)
//   - This project      (manually added to .prismnext/agent/mcp.json; full
//                        control: toggle / configure / delete)
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  PlugIcon,
  FileJsonIcon,
  PlusIcon,
  RefreshCwIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useDocumentStore } from "@/stores/document-store";
import { openSettingsPanel } from "@/stores/settings-panel-store";
import {
  useOnSettingsEditorKindsClosed,
  useSettingsEditorSlotOfKind,
} from "@/hooks/use-settings-editor";
import { useMcpServersStore } from "@/stores/mcp-servers-store";
import { usePacksStore } from "@/stores/teams-store";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useInlineDeleteConfirm } from "@/hooks/use-inline-delete-confirm";
import { InlineDeleteButton } from "./inline-delete-button";
import { isBuiltinMcpServer, serverIsConfigurable } from "@/lib/agent/mcp-presets";
import type { McpServerEntry } from "@/lib/agent/mcp-config";
import type { ResolvedMcp } from "@shared/teams/types";

const CATEGORY_HEADER =
  "text-[length:var(--font-size-12)] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2";
const CARD = "rounded-lg border border-border px-4 divide-y divide-border";
const ROW = "flex items-center justify-between gap-3 py-2.5";
const ROW_LABEL = "text-[length:var(--font-size-13)] font-medium";
const ROW_DESC = "text-[length:var(--font-size-12)] text-muted-foreground mt-0.5";
const BADGE =
  "inline-flex items-center rounded px-1.5 py-0.5 text-[length:var(--font-size-10)] font-medium uppercase tracking-wide shrink-0";

function serverSummary(entry: McpServerEntry): string {
  if (entry.type === "remote") return entry.url || "Remote server";
  if (entry.command.length === 0) return "Local process (stdio)";
  const cmd = entry.command.join(" ");
  return cmd.length > 72 ? `${cmd.slice(0, 72)}…` : cmd;
}

function mcpTransportSummary(mcp: ResolvedMcp): string {
  if (mcp.transport.type === "http") return mcp.transport.url || "Remote (http)";
  const { command, args } = mcp.transport;
  const cmd = [command, ...(args ?? [])].join(" ");
  return cmd.length > 72 ? `${cmd.slice(0, 72)}…` : cmd;
}

export function ToolsMcpSettings() {
  const { t } = useTranslation();
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const servers = useMcpServersStore((s) => s.servers);
  const loaded = useMcpServersStore((s) => s.loaded);
  const saving = useMcpServersStore((s) => s.saving);
  const load = useMcpServersStore((s) => s.load);
  const persist = useMcpServersStore((s) => s.persist);
  const teamMcps = usePacksStore((s) => s.teamMcps);

  const openMcpServerSlot = useSettingsEditorSlotOfKind("mcp-server");
  const deleteConfirm = useInlineDeleteConfirm();
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    void load(projectRoot);
  }, [projectRoot, load]);

  // Pack-declared MCP servers come from the shared packs store (refreshed on
  // every packs load — install / enable / disable at app or project level).
  useEffect(() => {
    if (!projectRoot) return;
    void usePacksStore.getState().load(projectRoot);
  }, [projectRoot]);

  const handleApplyMcp = async () => {
    if (!projectRoot) return;
    setApplying(true);
    try {
      const result = await window.electronAPI.mcpApply(projectRoot);
      await load(projectRoot);
      if (!result.ok) {
        toast.error(result.error || t("settings.mcp.toast.applyFailed"));
        return;
      }
      toast.success(
        result.reloadedSessions > 0
          ? t("settings.mcp.toast.appliedSessions", { count: result.reloadedSessions })
          : t("settings.mcp.toast.appliedNoSessions"),
      );
    } catch {
      toast.error(t("settings.mcp.toast.applyFailed"));
    } finally {
      setApplying(false);
    }
  };

  useOnSettingsEditorKindsClosed(
    ["mcp-json", "mcp-catalog", "mcp-paste-json", "mcp-server"],
    () => {
      void load(projectRoot);
    },
  );

  const handleToggleEnabled = async (name: string, enabled: boolean) => {
    if (!projectRoot) return;
    deleteConfirm.clearPending();
    const next = servers.map((s) => (s.name === name ? { ...s, enabled } : s));
    await persist(projectRoot, next);
  };

  const handleDelete = async (name: string) => {
    if (!projectRoot) return;
    deleteConfirm.clearPending();
    await persist(
      projectRoot,
      servers.filter((s) => s.name !== name),
    );
    toast.success(t("settings.mcp.toast.removed", { name }));
  };

  // Per-item toggle for pack-declared MCP (disabledContent, same chain as
  // experts/commands). The owning pack must still be enabled in this project.
  const handleTogglePackMcp = async (fqid: string, enabled: boolean) => {
    if (!projectRoot) return;
    usePacksStore.getState().setEnabledLocalMcp(fqid, enabled);
    try {
      await window.electronAPI.teamsSetAssetEnabled(projectRoot, fqid, enabled);
      await usePacksStore.getState().load(projectRoot, { force: true });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
      await usePacksStore.getState().load(projectRoot, { force: true });
    }
  };

  const openConfigure = (entry: McpServerEntry) => {
    deleteConfirm.clearPending();
    openSettingsPanel({
      kind: "mcp-server",
      serverName: entry.name,
      title: entry.name,
    });
  };

  const renderAddButtons = (className?: string) => (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Button
        variant="outline"
        size="xs"
        onClick={() => openSettingsPanel({ kind: "mcp-catalog" })}
      >
        <PlusIcon className="size-3 mr-1" />
        {t("settings.mcp.browseCatalog")}
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

  if (!projectRoot) {
    return (
      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto px-8 py-8">
          <div className={cn(CARD, "!divide-y-0")}>
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <PlugIcon className="size-8 text-muted-foreground/30" />
              <p className="text-[length:var(--font-size-13)] text-muted-foreground">
                {t("settings.mcp.openProject")}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-8 py-8 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-[length:var(--font-dialog-title)] font-semibold">{t("settings.mcp.title")}</h2>
            <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">
              {t("settings.mcp.pageDesc")}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="xs"
              className="shrink-0"
              disabled={saving || applying}
              onClick={() => void handleApplyMcp()}
              title={t("settings.mcp.applyToChatsHint")}
            >
              <RefreshCwIcon
                className={cn("size-3 mr-1", applying && "animate-spin")}
              />
              {t("settings.mcp.applyToChats")}
            </Button>
            <Button
              variant="outline"
              size="xs"
              className="shrink-0"
              onClick={() => openSettingsPanel({ kind: "mcp-json" })}
            >
              <FileJsonIcon className="size-3 mr-1" />
              {t("settings.mcp.editJson")}
            </Button>
          </div>
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
            <p className={cn(CATEGORY_HEADER, "mb-0")}>{t("settings.mcp.installed")}</p>
            {renderAddButtons()}
          </div>

          {/* Unified list: pack-declared (from teams) + this-project servers,
              each row labelled with its source. */}
          <div className={CARD}>
            {!loaded ? (
              <div className="py-3 text-[length:var(--font-size-12)] text-muted-foreground">
                Loading…
              </div>
            ) : servers.length === 0 && teamMcps.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <PlugIcon className="size-8 text-muted-foreground/30" />
                <p className="text-[length:var(--font-size-13)] text-muted-foreground">
                  {t("settings.mcp.empty")}
                </p>
                {renderAddButtons("justify-center")}
              </div>
            ) : (
              <>
                {/* This-project servers (manual) — full control. */}
                {[...servers]
                  .sort(
                    (a, b) =>
                      Number(isBuiltinMcpServer(b.name)) -
                      Number(isBuiltinMcpServer(a.name)),
                  )
                  .map((entry) => {
                    const configurable = serverIsConfigurable(entry);
                    const configuring =
                      openMcpServerSlot?.serverName === entry.name;
                    const builtin = isBuiltinMcpServer(entry.name);

                    return (
                      <div key={entry.name} className={ROW}>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={cn(ROW_LABEL, "font-mono")}>{entry.name}</span>
                            {builtin ? (
                              <span
                                className={cn(
                                  BADGE,
                                  "bg-muted text-primary normal-case tracking-normal",
                                )}
                              >
                                {t("settings.mcp.sourceBuiltin")}
                              </span>
                            ) : (
                              <span className={cn(BADGE, "bg-muted text-muted-foreground")}>
                                {t("settings.mcp.sourceProject")}
                              </span>
                            )}
                          </div>
                          <p className={ROW_DESC}>{serverSummary(entry)}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {configurable ? (
                            <Button
                              variant="ghost"
                              size="xs"
                              className="shrink-0"
                              disabled={saving}
                              onClick={() => openConfigure(entry)}
                            >
                              {configuring ? "Editing…" : "Configure"}
                            </Button>
                          ) : null}
                          <Switch
                            checked={entry.enabled}
                            disabled={saving}
                            onCheckedChange={(v) =>
                              void handleToggleEnabled(entry.name, v)
                            }
                            aria-label={`Enable ${entry.name}`}
                          />
                          <InlineDeleteButton
                            itemId={entry.name}
                            pending={deleteConfirm.isPending(entry.name)}
                            disabled={saving}
                            onRequest={() => deleteConfirm.setPendingId(entry.name)}
                            onConfirm={() => void handleDelete(entry.name)}
                          />
                        </div>
                      </div>
                    );
                  })}

                {/* Pack-declared MCP (from teams) — per-item toggle available;
                    the owning team must be enabled in this project too. */}
                {teamMcps.map((mcp) => (
                  <div
                    key={mcp.fqid}
                    className={cn(ROW, !mcp.enabled && "opacity-60")}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn(ROW_LABEL, "font-mono")}>{mcp.name}</span>
                        <span className={cn(BADGE, "bg-muted text-muted-foreground")}>
                          {t("settings.mcp.sourceTeam", { team: mcp.origin.teamName })}
                        </span>
                        {!mcp.enabled && (
                          <span className={cn(BADGE, "bg-destructive/10 text-destructive")}>
                            {t("settings.mcp.disabledInProject")}
                          </span>
                        )}
                      </div>
                      <p className={ROW_DESC}>{mcpTransportSummary(mcp)}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Switch
                        checked={mcp.enabled}
                        disabled={saving}
                        onCheckedChange={(v) => void handleTogglePackMcp(mcp.fqid, v)}
                        aria-label={`Enable ${mcp.name}`}
                      />
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
