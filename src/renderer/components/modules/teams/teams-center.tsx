// Teams Center（§9.1 浏览页）—— LeftSidebar Nav 的沉浸式页面。
// 布局对齐 TemplateCenter：max-w-6xl + 页头 + 左侧分类/信息 + 右侧
// @container。列表卡片为紧凑双列行（图标 | 名+一行简介 | 安装/卸载）。
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  ArrowLeftIcon,
  Bot,
  DownloadIcon,
  PuzzleIcon,
  SearchIcon,
  Settings2Icon,
  SlashIcon,
  SparklesIcon,
  PlugIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useDocumentStore } from "@/stores/document-store";
import { useLayoutStore } from "@/stores/layout-store";
import { useProLicenseStore } from "@/stores/pro-license-store";
import { useChatStore } from "@/stores/chat-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  MY_CONTENT_TEAM_ID,
  PROJECT_DEFAULT_TEAM_ID,
  type AssetKind,
} from "@shared/teams/types";
import type { TeamCardView } from "../../../stores/teams-store";
import { toCardView } from "../../../stores/teams-store";
import { PackIcon } from "./team-icon";
import { ProBadge } from "./pro-badge";

/** Hangars + project-scoped teams are not marketplace items. */
function isStoreBrowsable(pack: TeamCardView): boolean {
  if (pack.kind === "local") return false;
  if (pack.manifest.id === MY_CONTENT_TEAM_ID) return false;
  if (pack.manifest.id === PROJECT_DEFAULT_TEAM_ID) return false;
  return true;
}

export interface TeamsCenterProps {
  onBack: () => void;
}

interface PackContentEntry {
  kind: AssetKind;
  id: string;
  name: string;
  description: string;
}

const KIND_ORDER: AssetKind[] = ["orchestrator", "subagent", "skill", "command", "mcp"];

const KIND_META: Record<AssetKind, { icon: typeof Bot; labelKey: string }> = {
  orchestrator: { icon: Bot, labelKey: "teamsCenter.kinds.orchestrator" },
  subagent: { icon: SparklesIcon, labelKey: "teamsCenter.kinds.expert" },
  skill: { icon: PuzzleIcon, labelKey: "teamsCenter.kinds.skill" },
  command: { icon: SlashIcon, labelKey: "teamsCenter.kinds.command" },
  mcp: { icon: PlugIcon, labelKey: "teamsCenter.kinds.mcp" },
};

type Filter = "all" | "installed" | `cat:${string}`;

/**
 * §6.3 状态矩阵（layering spec）→ 卡片/详情显示态。
 * - installed && enabled                    → 已安装·启用中
 * - installed && !enabled && locked         → 已安装·Pro 锁定（授权失效，提示重新激活）
 * - installed && !enabled && !locked        → 已安装·已停用（项目停用）
 * - !installed && locked                    → Pro 锁定（不可装）
 * - !installed && !locked                   → 可安装
 */
type PackDisplayState =
  | "installedActive"
  | "installedDisabled"
  | "installedProLocked"
  | "proLocked"
  | "installable";

function packDisplayState(pack: TeamCardView): PackDisplayState {
  if (pack.installed) {
    if (pack.enabled) return "installedActive";
    return pack.locked ? "installedProLocked" : "installedDisabled";
  }
  return pack.locked ? "proLocked" : "installable";
}

/** Deep-link to Settings → About (Pro activation surface). */
function goActivate(): void {
  useLayoutStore.getState().setLeftSidebarView("settings");
  useLayoutStore.getState().setSettingsCategory("about");
}

export function TeamsCenter({ onBack }: TeamsCenterProps) {
  const { t } = useTranslation();
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  // §8.5：license 激活/清除 → main 侧门控即时翻转，Gallery 重新拉 catalog
  //（locked 标记与可安装性随授权变化即时更新）。
  const license = useProLicenseStore((s) => s.license);

  const [packs, setPacks] = useState<TeamCardView[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [contents, setContents] = useState<PackContentEntry[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!projectRoot) {
      setPacks([]);
      return;
    }
    setPacks((await window.electronAPI.teamsList(projectRoot)).map(toCardView));
  }, [projectRoot]);

  useEffect(() => {
    void reload();
  }, [reload, license]);

  // 详情页内容清单（catalog 级扫描，未安装也可见）
  useEffect(() => {
    if (!selectedId) {
      setContents([]);
      return;
    }
    void window.electronAPI.teamsGetTeamContents(selectedId, projectRoot).then(setContents);
  }, [selectedId, projectRoot]);

  const selected = packs.find((p) => p.manifest.id === selectedId) ?? null;

  const install = async (pack: TeamCardView) => {
    if (!projectRoot) return;
    setBusy(pack.manifest.id);
    try {
      const { suggestedActiveTeam } = await window.electronAPI.teamsInstall(pack.manifest.id);
      toast.success(t("teamsCenter.toast.installed", { name: pack.manifest.name }));
      if (suggestedActiveTeam) {
        toast(t("teamsCenter.suggestion.text", { pack: pack.manifest.name }), {
          action: {
            label: t("teamsCenter.suggestion.accept"),
            onClick: () => {
              void window.electronAPI
                .teamsSetActiveTeam(projectRoot, suggestedActiveTeam, "project")
                .then(() => {
                  useChatStore.getState().clearSessionTeamOverrides();
                  toast.success(t("teamsCenter.suggestion.done"));
                });
            },
          },
        });
      }
      await reload();
    } catch (err) {
      toast.error(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(null);
    }
  };

  const uninstall = async (pack: TeamCardView) => {
    setBusy(pack.manifest.id);
    try {
      await window.electronAPI.teamsUninstall(pack.manifest.id);
      toast.success(t("teamsCenter.toast.uninstalled", { name: pack.manifest.name }));
      await reload();
    } catch (err) {
      toast.error(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(null);
    }
  };

  const openManageInSettings = () => {
    useLayoutStore.getState().setLeftSidebarView("settings");
    useLayoutStore.getState().setSettingsCategory("teams-agents");
  };

  // Browse = installable packs only (never Common Team / project hangar / local teams).
  const browsable = useMemo(() => packs.filter(isStoreBrowsable), [packs]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of browsable) set.add(p.manifest.category?.trim() || "general");
    return [...set].sort();
  }, [browsable]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return browsable.filter((p) => {
      if (filter === "installed" && !p.installed) return false;
      if (filter.startsWith("cat:") && (p.manifest.category?.trim() || "general") !== filter.slice(4)) {
        return false;
      }
      if (!q) return true;
      return (
        p.manifest.name.toLowerCase().includes(q) ||
        p.manifest.description.toLowerCase().includes(q) ||
        p.manifest.publisher.toLowerCase().includes(q) ||
        (p.manifest.tags ?? []).some((tag) => tag.toLowerCase().includes(q))
      );
    });
  }, [browsable, search, filter]);

  const countFor = (f: Filter) =>
    browsable.filter((p) => {
      if (f === "all") return true;
      if (f === "installed") return p.installed;
      return (p.manifest.category?.trim() || "general") === f.slice(4);
    }).length;

  const rowActionButton = (pack: TeamCardView) => {
    const state = packDisplayState(pack);
    if (state === "installedProLocked") {
      return (
        <Button
          size="xs"
          variant="outline"
          className="shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            goActivate();
          }}
        >
          {t("teamsCenter.card.goActivate")}
        </Button>
      );
    }
    if (pack.installed) {
      return (
        <Button
          size="xs"
          variant="outline"
          className="shrink-0"
          disabled={busy === pack.manifest.id}
          onClick={(e) => {
            e.stopPropagation();
            void uninstall(pack);
          }}
        >
          {t("teamsCenter.card.uninstall")}
        </Button>
      );
    }
    return (
      <Button
        size="xs"
        variant="outline"
        className="shrink-0"
        disabled={busy === pack.manifest.id || !pack.compatible || pack.locked}
        onClick={(e) => {
          e.stopPropagation();
          void install(pack);
        }}
      >
        {pack.locked ? t("teamsCenter.card.proLocked") : t("teamsCenter.card.install")}
      </Button>
    );
  };

  const sidebarItem = (id: Filter, label: string) => (
    <button
      key={id}
      type="button"
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[length:var(--font-session-item)] transition-colors text-left",
        filter === id
          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
          : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      )}
      onClick={() => setFilter(id)}
    >
      <span className="truncate flex-1">{label}</span>
      <span className="text-[length:var(--font-size-10)] tabular-nums text-muted-foreground shrink-0">
        {countFor(id)}
      </span>
    </button>
  );

  const renderDetailActions = () => {
    if (!selected) return null;
    return (
      <>
        {selected.installed && packDisplayState(selected) === "installedProLocked" ? (
          <Button size="xs" variant="outline" className="shrink-0" onClick={goActivate}>
            {t("teamsCenter.card.goActivate")}
          </Button>
        ) : selected.installed ? (
          <Button
            size="xs"
            variant="outline"
            className="shrink-0"
            disabled={busy === selected.manifest.id}
            onClick={() => void uninstall(selected)}
          >
            <Trash2Icon className="size-3" />
            {t("teamsCenter.card.uninstall")}
          </Button>
        ) : selected.locked || !selected.compatible ? (
          <Button size="xs" variant="outline" className="shrink-0" disabled>
            {selected.locked
              ? t("teamsCenter.card.proLocked")
              : t("teamsCenter.card.incompatible")}
          </Button>
        ) : (
          <Button
            size="xs"
            variant="outline"
            className="shrink-0"
            disabled={busy === selected.manifest.id}
            onClick={() => void install(selected)}
          >
            <DownloadIcon className="size-3" />
            {t("teamsCenter.card.install")}
          </Button>
        )}
        <Button
          size="xs"
          variant="outline"
          className="shrink-0"
          onClick={openManageInSettings}
        >
          <Settings2Icon className="size-3" />
          {t("teamsCenter.manage")}
        </Button>
      </>
    );
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
      <div className="mx-auto w-full min-w-0 max-w-6xl px-4 pt-6 pb-8 sm:px-8 sm:pt-8">
        {/* 页头（与 TemplateCenter 一致） */}
        <div className="mb-6 hidden lg:block space-y-1">
          <h2 className="text-[length:var(--font-session-item)] font-semibold">
            {selected ? selected.manifest.name : t("teamsCenter.title")}
          </h2>
          {!selected ? (
            <p className="text-[length:var(--font-size-12)] text-muted-foreground">
              {t("teamsCenter.subtitle")}
            </p>
          ) : null}
          {!projectRoot ? (
            <p className="text-[length:var(--font-size-12)] text-muted-foreground">
              {t("teamsCenter.noProject")}
            </p>
          ) : null}
        </div>

        <div className="flex min-h-0 min-w-0 flex-col gap-6 lg:flex-row lg:items-start">
          {/* 浏览：分类侧栏；详情：宽屏才显示信息栏（窄屏徽章已含关键信息） */}
          {selected ? (
            <div className="hidden w-[200px] shrink-0 flex-col gap-1 px-2 lg:flex">
              <p className="px-2 pb-1 text-[length:var(--font-hint)] text-muted-foreground uppercase tracking-wider">
                {t("teamsCenter.meta.title")}
              </p>
              <div className="flex flex-col gap-y-3 px-2 text-[length:var(--font-size-12)] text-muted-foreground">
                <div>
                  <span>{t("teamsCenter.meta.status")}</span>
                  <p className="font-medium text-foreground">
                    {packDisplayState(selected) === "installedActive" &&
                      t("teamsCenter.card.installedActive")}
                    {packDisplayState(selected) === "installedDisabled" &&
                      t("teamsCenter.card.installedDisabled")}
                    {packDisplayState(selected) === "installedProLocked" &&
                      t("teamsCenter.card.installedProLocked")}
                    {packDisplayState(selected) === "proLocked" &&
                      t("teamsCenter.card.proLocked")}
                    {packDisplayState(selected) === "installable" &&
                      t("teamsCenter.card.notInstalled")}
                  </p>
                </div>
                <div>
                  <span>{t("teamsCenter.meta.publisher")}</span>
                  <p className="text-foreground">{selected.manifest.publisher}</p>
                </div>
                <div>
                  <span>{t("teamsCenter.meta.version")}</span>
                  <p className="text-foreground">v{selected.manifest.version}</p>
                </div>
                <div>
                  <span>{t("teamsCenter.meta.tier")}</span>
                  <p className="text-foreground">
                    {selected.manifest.tier === "pro" ? "Pro" : "Free"}
                  </p>
                </div>
                {selected.manifest.category ? (
                  <div>
                    <span>{t("teamsCenter.meta.category")}</span>
                    <p className="capitalize text-foreground">{selected.manifest.category}</p>
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="w-full shrink-0 lg:w-[200px]">
              <button
                type="button"
                className="mb-4 flex items-center gap-1.5 text-[length:var(--font-size-12)] text-muted-foreground transition-colors hover:text-foreground lg:hidden"
                onClick={onBack}
              >
                <ArrowLeftIcon className="size-3.5" />
                {t("common.back")}
              </button>
              <div className="flex flex-col gap-1 px-2">
                <p className="hidden px-2 pb-1 text-[length:var(--font-hint)] text-muted-foreground uppercase tracking-wider lg:block">
                  {t("teamsCenter.sidebar")}
                </p>
                <div className="flex flex-col gap-1">
                  {sidebarItem("all", t("teamsCenter.tabs.all"))}
                  {sidebarItem("installed", t("teamsCenter.tabs.installed"))}
                  {categories.map((cat) =>
                    sidebarItem(
                      `cat:${cat}`,
                      t(`teamsCenter.categories.${cat}`, { defaultValue: cat }),
                    ),
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 右侧主区 */}
          <div className="min-w-0 flex-1 @container">
            {selected ? (
              /* ── 详情页（对齐 template DetailView） ── */
              <div className="min-w-0 flex-1 pb-8">
                <button
                  type="button"
                  className="mb-6 flex items-center gap-1.5 text-[length:var(--font-size-12)] text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => setSelectedId(null)}
                >
                  <ArrowLeftIcon className="size-3.5" />
                  {t("teamsCenter.backToList")}
                </button>

                <div className="min-w-0 space-y-6">
                  <div className="flex min-w-0 flex-col gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <PackIcon size="lg" />
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <h3 className="break-words text-[length:var(--font-size-13)] font-medium">
                            {selected.manifest.name}
                          </h3>
                          {selected.manifest.tier === "pro" && <ProBadge />}
                          {!selected.compatible && (
                            <Badge variant="destructive">
                              {t("teamsCenter.card.incompatible")}
                            </Badge>
                          )}
                          {selected.installed && (
                            <Badge variant="outline">
                              {packDisplayState(selected) === "installedActive"
                                ? t("teamsCenter.card.installedActive")
                                : packDisplayState(selected) === "installedDisabled"
                                  ? t("teamsCenter.card.installedDisabled")
                                  : t("teamsCenter.card.installedProLocked")}
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1 break-words text-[length:var(--font-size-12)] leading-relaxed text-muted-foreground">
                          {selected.manifest.longDescription ?? selected.manifest.description}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Badge variant="outline">{selected.manifest.publisher}</Badge>
                          <Badge variant="secondary">v{selected.manifest.version}</Badge>
                          {(selected.manifest.tags ?? []).map((tag) => (
                            <Badge key={tag} variant="secondary">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      {/* 宽容器：操作靠右；窄容器改到下方整行，避免挤扁简介 */}
                      <div className="hidden shrink-0 flex-wrap items-center justify-end gap-1.5 @md:flex">
                        {renderDetailActions()}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 @md:hidden">
                      {renderDetailActions()}
                    </div>
                  </div>

                  {/* 内容清单 */}
                  {KIND_ORDER.map((kind) => {
                    const group = contents.filter((c) => c.kind === kind);
                    if (group.length === 0) return null;
                    const Meta = KIND_META[kind];
                    return (
                      <div key={kind} className="min-w-0">
                        <h3 className="mb-2 flex items-center gap-1.5 text-[length:var(--font-size-13)] font-medium">
                          <Meta.icon className="size-3.5 shrink-0 text-muted-foreground" />
                          {t(Meta.labelKey)}
                          <span className="tabular-nums font-normal text-muted-foreground">
                            {group.length}
                          </span>
                        </h3>
                        <div className="divide-y divide-border rounded-lg border border-border">
                          {group.map((c) => (
                            <div key={c.id} className="min-w-0 px-3 py-2">
                              <div className="break-words text-[length:var(--font-size-12)]">
                                {c.name || c.id}
                              </div>
                              {c.description && (
                                <div className="mt-0.5 break-words text-[length:var(--font-size-11)] text-muted-foreground">
                                  {c.description}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* ── 卡片网格（对齐 template GalleryView） ── */
              <div className="flex-1 pb-8">
                <div className="relative mb-4">
                  <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t("teamsCenter.searchPlaceholder")}
                    className="h-8 pl-8 pr-7 text-[length:var(--font-size-12)] rounded-md border border-border bg-transparent hover:border-border focus:border-primary focus:ring-1 focus:ring-ring transition-all shadow-none"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2"
                    >
                      <XIcon className="size-3 text-muted-foreground hover:text-foreground" />
                    </button>
                  )}
                </div>

                {browsable.length > 0 && (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-4 text-[length:var(--font-size-11)] text-muted-foreground">
                    <span>{t("teamsCenter.count", { count: filtered.length })}</span>
                    {search.trim() ? (
                      <>
                        <span>·</span>
                        <button
                          type="button"
                          className="text-primary hover:underline underline-offset-2"
                          onClick={() => setSearch("")}
                        >
                          {t("teamsCenter.clearSearch")}
                        </button>
                      </>
                    ) : null}
                  </div>
                )}

                {filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                    <PackIcon size="lg" />
                    <p className="text-[length:var(--font-size-13)]">{t("teamsCenter.empty")}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 @md:grid-cols-2 gap-2">
                    {filtered.map((pack) => (
                      <button
                        key={pack.manifest.id}
                        type="button"
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-left transition-colors",
                          pack.installed ? "bg-muted" : "hover:bg-muted",
                        )}
                        onClick={() => setSelectedId(pack.manifest.id)}
                      >
                        <PackIcon size="md" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="truncate text-[length:var(--font-size-12)] font-medium text-foreground">
                              {pack.manifest.name}
                            </span>
                            {pack.manifest.tier === "pro" && <ProBadge />}
                          </div>
                          <p className="mt-0.5 truncate text-[length:var(--font-size-11)] text-muted-foreground">
                            {pack.manifest.description}
                          </p>
                        </div>
                        {rowActionButton(pack)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
