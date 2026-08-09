// Pack detail panel — right-side info panel for a team / pack, opened from
// Settings → Teams & Agents. Mirrors the Teams Center detail surface:
// meta info + content inventory (main agents / experts / skills / commands /
// MCP) + lifecycle actions (app-level uninstall / user-team delete) moved off
// the list card into this panel per the unified-card design.
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { StoreIcon, PackageIcon } from "lucide-react";
import { useDocumentStore } from "@/stores/document-store";
import { useLayoutStore } from "@/stores/layout-store";
import { useProLicenseStore } from "@/stores/pro-license-store";
import { usePacksStore } from "@/stores/packs-store";
import { closeSettingsPanel } from "@/stores/settings-panel-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { SettingsPanelSlot } from "@/lib/settings/settings-panel-slots";
import { SETTINGS_DETAIL_SHELL, SETTINGS_ROW_DESC } from "./settings-tokens";
import { useInlineDeleteConfirm } from "@/hooks/use-inline-delete-confirm";
import { InlineDeleteButton } from "./inline-delete-button";
import { PackIcon } from "../teams/pack-icon";
import type { ContentKind } from "@shared/packs/types";

type PackDetailSlot = Extract<SettingsPanelSlot, { kind: "pack-detail" }>;

interface PackContentEntry {
  kind: ContentKind;
  id: string;
  name: string;
  description: string;
}

const KIND_ORDER: ContentKind[] = ["orchestrator", "expert", "skill", "command", "mcp"];

const KIND_LABEL_KEYS: Record<ContentKind, string> = {
  orchestrator: "settings.teamsAgents.kinds.orchestrator",
  expert: "settings.teamsAgents.kinds.expert",
  skill: "settings.teamsAgents.kinds.skill",
  command: "settings.teamsAgents.kinds.command",
  mcp: "settings.teamsAgents.kinds.mcp",
};

export function PackDetailPanel({ slot }: { slot: PackDetailSlot }) {
  const { t } = useTranslation();
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const license = useProLicenseStore((s) => s.license);
  const pack = usePacksStore((s) =>
    s.catalog.find((p) => p.manifest.id === slot.packId) ?? null,
  );
  const [contents, setContents] = useState<PackContentEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const deleteConfirm = useInlineDeleteConfirm();

  const load = useCallback(async () => {
    if (!projectRoot) return;
    try {
      await usePacksStore.getState().load(projectRoot, { force: true });
      setContents(await window.electronAPI.packsGetPackContents(slot.packId));
    } catch {
      setContents([]);
    }
  }, [projectRoot, slot.packId]);

  useEffect(() => {
    void load();
  }, [load, license]);

  const uninstall = async () => {
    if (!projectRoot || !pack) return;
    deleteConfirm.clearPending();
    setBusy(true);
    try {
      const isUserTeam = pack.manifest.publisher === "user";
      if (isUserTeam) {
        await window.electronAPI.userPacksDelete(pack.manifest.id);
      } else {
        await window.electronAPI.packsUninstall(projectRoot, pack.manifest.id);
      }
      closeSettingsPanel();
    } catch (err) {
      toast.error(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(false);
    }
  };

  // Project-level enable/disable (pack is app-level; this controls THIS project).
  const toggleProjectEnabled = async (enabled: boolean) => {
    if (!projectRoot || !pack) return;
    if (!enabled && pack.kind === "core") {
      if (!window.confirm(t("settings.teamsAgents.confirm.disableCore"))) return;
    }
    setBusy(true);
    try {
      // Optimistic flip in the shared store (flips the panel switch AND the
      // card list in real time), then persist + reconcile with main.
      const result = await usePacksStore.getState().setEnabled(
        projectRoot,
        pack.manifest.id,
        enabled,
      );
      await load();
      // Disabling a team that owns the default main agent moves the default
      // back to the built-in agent — tell the user so it isn't a surprise.
      if (!enabled && result?.defaultMovedTo) {
        toast.info(t("settings.teamsAgents.toast.defaultMovedToBuiltin"));
      }
    } catch (err) {
      toast.error(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(false);
    }
  };

  if (!projectRoot) {
    return (
      <div className="flex flex-1 items-center justify-center px-8 py-8">
        <p className="text-[length:var(--font-size-13)] text-muted-foreground">
          {t("settings.teamsAgents.noProject")}
        </p>
      </div>
    );
  }

  if (!pack) {
    return (
      <div className="flex flex-1 items-center justify-center px-8 py-8">
        <p className="text-[length:var(--font-size-12)] text-muted-foreground">
          {t("common.loading")}
        </p>
      </div>
    );
  }

  const isUserTeam = pack.manifest.publisher === "user";
  const isCore = pack.kind === "core";
  const isLocal = pack.kind === "local";
  const removable = !isCore && !isLocal;

  return (
    <div className="flex-1 overflow-auto">
      <div className={SETTINGS_DETAIL_SHELL}>
        {/* Header — name row with Pro/version up top, lifecycle actions at the
            right edge aligned with the name (not buried below the content). */}
        <div className="flex items-start gap-3">
          <PackIcon size="lg" />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <h3 className="text-[length:var(--font-size-13)] font-medium">{pack.manifest.name}</h3>
              {pack.manifest.tier === "pro" && (
                <Badge variant="secondary" className="h-4.5 px-1 text-[length:var(--font-size-10)]">
                  Pro
                </Badge>
              )}
              <Badge variant="outline" className="h-4.5 px-1 text-[length:var(--font-size-10)]">
                v{pack.manifest.version}
              </Badge>
              {isUserTeam && (
                <Badge variant="outline" className="h-4.5 px-1 text-[length:var(--font-size-10)]">
                  {t("settings.teamsAgents.myTeam")}
                </Badge>
              )}
              {isCore && (
                <Badge variant="outline" className="h-4.5 px-1 text-[length:var(--font-size-10)]">
                  {t("settings.teamsAgents.coreLabel")}
                </Badge>
              )}
              {isLocal && (
                <Badge variant="outline" className="h-4.5 px-1 text-[length:var(--font-size-10)]">
                  {t("settings.teamsAgents.localLabel")}
                </Badge>
              )}
              {!pack.compatible && (
                <Badge variant="destructive" className="h-4.5 px-1 text-[length:var(--font-size-10)]">
                  {t("teamsCenter.card.incompatible")}
                </Badge>
              )}
              {pack.locked && (
                <Badge variant="secondary" className="h-4.5 px-1 text-[length:var(--font-size-10)]">
                  {t("teamsCenter.card.proLocked")}
                </Badge>
              )}
            </div>
            <p className={cn(SETTINGS_ROW_DESC, "mt-1.5")}>
              {pack.manifest.longDescription ?? pack.manifest.description}
            </p>
            {/* Meta row: creator first, then only tags — version already lives
                next to the name above. */}
            <div className="flex flex-wrap gap-1.5 mt-3">
              <Badge variant="outline" className="h-4.5 px-1 text-[length:var(--font-size-10)]">
                {pack.manifest.publisher}
              </Badge>
              {(pack.manifest.tags ?? []).map((tag) => (
                <Badge key={tag} variant="secondary" className="h-4.5 px-1 text-[length:var(--font-size-10)]">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
          {/* Lifecycle actions — top right, aligned with the name row. */}
          <div className="flex flex-col items-end gap-2 shrink-0">
            <Button
              variant="outline"
              size="xs"
              className="shadow-none"
              onClick={() => useLayoutStore.getState().setLeftSidebarView("teams")}
            >
              <StoreIcon className="size-3 mr-1" />
              {t("settings.teamsAgents.browse")}
            </Button>
            {pack.locked && (
              <Button
                size="xs"
                className="shadow-none"
                onClick={() => {
                  useLayoutStore.getState().setLeftSidebarView("settings");
                  useLayoutStore.getState().setSettingsCategory("about");
                  closeSettingsPanel();
                }}
              >
                {t("teamsCenter.card.goActivate")}
              </Button>
            )}
            {removable && (
              <InlineDeleteButton
                itemId={`pack:${pack.manifest.id}`}
                pending={deleteConfirm.isPending(`pack:${pack.manifest.id}`)}
                variant="text"
                disabled={busy}
                requestLabel={
                  isUserTeam
                    ? t("settings.teamsAgents.deleteTeam")
                    : t("settings.teamsAgents.actions.uninstall")
                }
                onRequest={() => deleteConfirm.setPendingId(`pack:${pack.manifest.id}`)}
                onConfirm={() => void uninstall()}
              />
            )}
          </div>
        </div>

        {/* Project enable/disable — above the content inventory (project-level
            override; pack install is app-level). */}
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3.5 py-2.5">
          <div className="min-w-0">
            <p className="text-[length:var(--font-size-12)] font-medium">
              {t("settings.teamsAgents.enableInProject")}
            </p>
            <p className={cn(SETTINGS_ROW_DESC, "!mt-0.5")}>
              {t("settings.teamsAgents.enableInProjectDesc")}
            </p>
          </div>
          <Switch
            checked={pack.enabled}
            disabled={isLocal || busy || pack.locked}
            onCheckedChange={(enabled) => void toggleProjectEnabled(enabled)}
            aria-label={t("settings.teamsAgents.enableInProject")}
          />
        </div>

        {/* Content inventory */}
        <div className="space-y-5">
          {KIND_ORDER.map((kind) => {
            const group = contents.filter((c) => c.kind === kind);
            if (group.length === 0) return null;
            return (
              <div key={kind}>
                <p className="text-[length:var(--font-size-11)] font-semibold uppercase tracking-wide text-muted-foreground/70 mb-2">
                  {t(KIND_LABEL_KEYS[kind])}
                  <span className="ml-1.5 text-muted-foreground/50 font-normal tabular-nums">
                    {group.length}
                  </span>
                </p>
                <div className="rounded-lg border border-border divide-y divide-border">
                  {group.map((c) => (
                    <div key={c.id} className="px-3 py-2">
                      <div className="text-[length:var(--font-size-12)]">{c.name || c.id}</div>
                      {c.description && (
                        <div className="text-[length:var(--font-size-11)] text-muted-foreground mt-0.5">
                          {c.description}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {contents.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-8 text-center rounded-lg border border-border">
              <PackageIcon className="size-8 text-muted-foreground/30" />
              <p className="text-[length:var(--font-size-12)] text-muted-foreground">
                {t("settings.teamsAgents.packDetailEmpty")}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
