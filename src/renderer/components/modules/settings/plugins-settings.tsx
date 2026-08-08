// Settings → 插件（§9.2 管理面）——只管【已安装】的 pack。
// 布局完全对齐 skills-settings：max-w-3xl 容器 + 页头（标题/描述 + 右侧
// outline xs 按钮）+ CATEGORY_HEADER 分节 + SETTINGS_CARD 行 + Switch +
// InlineDeleteButton 二次确认卸载。浏览/安装去 Nav 的 Plugins 页。
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ChevronDownIcon, ChevronRightIcon, Package, StoreIcon } from "lucide-react";
import { useDocumentStore } from "@/stores/document-store";
import { useLayoutStore } from "@/stores/layout-store";
import { useProLicenseStore } from "@/stores/pro-license-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  SETTINGS_CARD as CARD,
  SETTINGS_ROW as ROW,
  SETTINGS_ROW_DESC as ROW_DESC,
  SETTINGS_ROW_LABEL as ROW_LABEL,
  SETTINGS_CATEGORY_HEADER as CATEGORY_HEADER,
} from "./settings-tokens";
import { useInlineDeleteConfirm } from "@/hooks/use-inline-delete-confirm";
import { InlineDeleteButton } from "./inline-delete-button";
import { PackIcon } from "../plugins/pack-icon";
import type {
  ContentKind,
  Fqid,
  ProjectPackView,
  ResolvedContent,
} from "@shared/packs/types";

const CONTENT_KINDS: ContentKind[] = ["orchestrator", "expert", "skill", "command"];

const KIND_LABEL_KEYS: Record<ContentKind, string> = {
  orchestrator: "settings.pluginsPage.kinds.orchestrator",
  expert: "settings.pluginsPage.kinds.expert",
  skill: "settings.pluginsPage.kinds.skill",
  command: "settings.pluginsPage.kinds.command",
  mcp: "settings.pluginsPage.kinds.mcp",
};

interface Suggestion {
  fqid: Fqid;
  packName: string;
}

export default function PluginsSettings() {
  const { t } = useTranslation();
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  // §8.5：license 变化 → pro pack 的 locked/激活态翻转，管理面即时刷新。
  const license = useProLicenseStore((s) => s.license);

  const [packs, setPacks] = useState<ProjectPackView[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [contents, setContents] = useState<ResolvedContent[]>([]);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const deleteConfirm = useInlineDeleteConfirm();

  const reload = useCallback(async () => {
    if (!projectRoot) {
      setPacks([]);
      return;
    }
    const all = await window.electronAPI.packsListCatalog(projectRoot);
    // 管理面只展示已安装（core/local 为隐式已装）
    setPacks(all.filter((p) => p.installed));
  }, [projectRoot]);

  useEffect(() => {
    void reload();
  }, [reload, license]);

  useEffect(() => {
    if (!projectRoot || !expanded) {
      setContents([]);
      return;
    }
    void Promise.all(
      CONTENT_KINDS.map((kind) => window.electronAPI.packsGetContentView(projectRoot, kind)),
    ).then((groups) => setContents(groups.flat().filter((c) => c.packId === expanded)));
  }, [projectRoot, expanded]);

  const handleMutation = async (
    packId: string,
    mutate: () => Promise<{ suggestedOrchestrator?: Fqid } | void>,
  ) => {
    if (!projectRoot) return;
    setBusy(packId);
    try {
      const result = await mutate();
      const pack = packs.find((p) => p.manifest.id === packId);
      if (result?.suggestedOrchestrator) {
        setSuggestion({ fqid: result.suggestedOrchestrator, packName: pack?.manifest.name ?? packId });
      }
      await reload();
    } catch (err) {
      toast.error(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(null);
    }
  };

  const toggle = (pack: ProjectPackView, enabled: boolean) => {
    if (!enabled && pack.kind === "core") {
      if (!window.confirm(t("settings.pluginsPage.confirm.disableCore"))) return;
    }
    return handleMutation(pack.manifest.id, () =>
      window.electronAPI.packsSetEnabled(projectRoot!, pack.manifest.id, enabled),
    );
  };

  const uninstall = async (packId: string) => {
    deleteConfirm.clearPending();
    await handleMutation(packId, () => window.electronAPI.packsUninstall(projectRoot!, packId));
    if (expanded === packId) setExpanded(null);
  };

  const toggleContent = async (fqid: Fqid, enabled: boolean) => {
    if (!projectRoot) return;
    await window.electronAPI.packsSetContentEnabled(projectRoot, fqid, enabled);
    setContents((prev) => prev.map((c) => (c.fqid === fqid ? { ...c, enabled } : c)));
  };

  const acceptSuggestion = async () => {
    if (!projectRoot || !suggestion) return;
    try {
      await window.electronAPI.packsSetDefaultOrchestrator(projectRoot, suggestion.fqid);
      toast.success(t("settings.pluginsPage.suggestion.done"));
    } catch (err) {
      toast.error(String(err instanceof Error ? err.message : err));
    }
    setSuggestion(null);
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-8 py-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[length:var(--font-dialog-title)] font-semibold">
              {t("settings.pluginsPage.title")}
            </h2>
            <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">
              {t("settings.pluginsPage.pageDesc")}
            </p>
          </div>
          {projectRoot && (
            <Button
              variant="outline"
              size="xs"
              className="shrink-0"
              onClick={() => useLayoutStore.getState().setLeftSidebarView("plugins")}
            >
              <StoreIcon className="size-3 mr-1" />
              {t("settings.pluginsPage.browse")}
            </Button>
          )}
        </div>

        {!projectRoot ? (
          <div className={cn(CARD, "!divide-y-0")}>
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <Package className="size-8 text-muted-foreground/30" />
              <p className="text-[length:var(--font-size-13)] text-muted-foreground">
                {t("settings.pluginsPage.noProject")}
              </p>
            </div>
          </div>
        ) : (
          <>
            {suggestion && (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/40 px-4 py-2.5">
                <div className="text-[length:var(--font-size-12)]">
                  {t("settings.pluginsPage.suggestion.text", { pack: suggestion.packName })}
                </div>
                <div className="flex gap-2">
                  <Button size="xs" onClick={() => void acceptSuggestion()}>
                    {t("settings.pluginsPage.suggestion.accept")}
                  </Button>
                  <Button size="xs" variant="ghost" onClick={() => setSuggestion(null)}>
                    {t("settings.pluginsPage.suggestion.dismiss")}
                  </Button>
                </div>
              </div>
            )}

            <div>
              <p className={CATEGORY_HEADER}>{t("settings.pluginsPage.installed")}</p>
              <div className={CARD}>
                {packs.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 py-10 text-center">
                    <Package className="size-8 text-muted-foreground/30" />
                    <p className="text-[length:var(--font-size-13)] text-muted-foreground">
                      {t("settings.pluginsPage.empty")}
                    </p>
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => useLayoutStore.getState().setLeftSidebarView("plugins")}
                    >
                      <StoreIcon className="size-3 mr-1" />
                      {t("settings.pluginsPage.browse")}
                    </Button>
                  </div>
                ) : (
                  packs.map((pack) => {
                    const id = pack.manifest.id;
                    const isOpen = expanded === id;
                    const canUninstall = pack.kind !== "core" && pack.kind !== "local";
                    return (
                      <div key={id}>
                        <div className={ROW}>
                          <button
                            type="button"
                            className="flex items-center gap-1 shrink-0 text-muted-foreground"
                            onClick={() => setExpanded(isOpen ? null : id)}
                          >
                            {isOpen ? (
                              <ChevronDownIcon className="size-3.5" />
                            ) : (
                              <ChevronRightIcon className="size-3.5" />
                            )}
                          </button>
                          <PackIcon size="sm" />
                          <div
                            className="min-w-0 flex-1 cursor-pointer"
                            onClick={() => setExpanded(isOpen ? null : id)}
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={ROW_LABEL}>{pack.manifest.name}</span>
                              <span className="text-[length:var(--font-size-11)] text-muted-foreground/70 tabular-nums">
                                v{pack.manifest.version}
                              </span>
                              <Badge variant="outline">{pack.manifest.publisher}</Badge>
                              {pack.manifest.tier === "pro" && <Badge variant="secondary">Pro</Badge>}
                            </div>
                            <div className={ROW_DESC}>{pack.manifest.description}</div>
                          </div>
                          <Switch
                            checked={pack.enabled}
                            disabled={busy === id || pack.kind === "local" || pack.locked}
                            onCheckedChange={(checked) => void toggle(pack, checked)}
                          />
                        </div>

                        {isOpen && (
                          <div className="border-t border-border/60 px-4 py-3 space-y-3">
                            {CONTENT_KINDS.map((kind) => {
                              const group = contents.filter((c) => c.kind === kind);
                              if (group.length === 0) return null;
                              return (
                                <div key={kind}>
                                  <div className="text-[length:var(--font-hint)] uppercase tracking-wider text-muted-foreground/60 mb-1">
                                    {t(KIND_LABEL_KEYS[kind])}（{group.length}）
                                  </div>
                                  {group.map((c) => (
                                    <div key={c.fqid} className="flex items-center gap-2 py-0.5">
                                      <span className="flex-1 truncate text-[length:var(--font-size-12)]">
                                        {c.name || c.id}
                                      </span>
                                      <Switch
                                        checked={c.enabled}
                                        onCheckedChange={(checked) =>
                                          void toggleContent(c.fqid, checked)
                                        }
                                      />
                                    </div>
                                  ))}
                                </div>
                              );
                            })}
                            {canUninstall && (
                              <div className="flex justify-end pt-1">
                                <InlineDeleteButton
                                  itemId={id}
                                  pending={deleteConfirm.isPending(id)}
                                  variant="text"
                                  requestLabel={t("settings.pluginsPage.actions.uninstall")}
                                  onRequest={() => deleteConfirm.setPendingId(id)}
                                  onConfirm={() => void uninstall(id)}
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
