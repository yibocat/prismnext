// Teams Center（§9.1 浏览页）—— LeftSidebar Nav 的沉浸式页面。
// 布局完全对齐 TemplateCenter：max-w-6xl 容器 + 页头 + 左侧栏（分类/
// 信息）+ 右侧 @container（搜索 + 卡片网格 / 详情），卡片用 shadcn Card
// + muted 图标带，按钮 shadow-none，全页无彩色元素。
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  ArrowLeftIcon,
  Bot,
  CheckIcon,
  PuzzleIcon,
  SearchIcon,
  SlashIcon,
  SparklesIcon,
  PlugIcon,
  XIcon,
} from "lucide-react";
import { useDocumentStore } from "@/stores/document-store";
import { useLayoutStore } from "@/stores/layout-store";
import { useProLicenseStore } from "@/stores/pro-license-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AssetKind, Fqid } from "@shared/teams/types";
import type { TeamCardView } from "../../../stores/teams-store";
import { toCardView } from "../../../stores/teams-store";
import { PackIcon } from "./team-icon";

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
    void window.electronAPI.teamsGetTeamContents(selectedId).then(setContents);
  }, [selectedId]);

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
                .then(() => toast.success(t("teamsCenter.suggestion.done")));
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

  // 浏览对象 = 非 local 的 catalog pack
  const browsable = useMemo(() => packs.filter((p) => p.kind !== "local"), [packs]);

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

  const installButton = (pack: TeamCardView, fullWidth = false) => {
    const state = packDisplayState(pack);
    const buttonClass = cn(
      "gap-1 shadow-none",
      fullWidth && "h-7 w-full text-[length:var(--font-size-12)]",
    );
    if (state === "installedProLocked") {
      // Installed but license invalid → offer re-activation deep link.
      return (
        <Button
          size="sm"
          variant="secondary"
          className={buttonClass}
          onClick={(e) => {
            e.stopPropagation();
            goActivate();
          }}
        >
          {t("teamsCenter.card.installedProLocked")}
          <span className="text-primary">{t("teamsCenter.card.goActivate")}</span>
        </Button>
      );
    }
    if (pack.installed) {
      return (
        <Button size="sm" variant="secondary" disabled className={buttonClass}>
          <CheckIcon className="size-3.5" />
          {state === "installedActive"
            ? t("teamsCenter.card.installedActive")
            : t("teamsCenter.card.installedDisabled")}
        </Button>
      );
    }
    return (
      <Button
        size="sm"
        variant={fullWidth ? "default" : "outline"}
        className={buttonClass}
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

  return (
    <div className="flex-1 overflow-y-auto flex flex-col">
      <div className="max-w-6xl mx-auto w-full px-8 pt-8 pb-8">
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

        <div className="flex flex-col lg:flex-row lg:items-start min-h-0 gap-6">
          {/* 左侧栏：分类（浏览）/ 信息（详情），对齐 TemplateSidebar / DetailSidebar */}
          <div className="shrink-0 w-full lg:w-[200px]">
            <button
              type="button"
              className="flex items-center gap-1.5 text-[length:var(--font-size-12)] text-muted-foreground hover:text-foreground transition-colors mb-4 lg:hidden"
              onClick={selected ? () => setSelectedId(null) : onBack}
            >
              <ArrowLeftIcon className="size-3.5" />
              {t("common.back")}
            </button>

            {selected ? (
              <div className="lg:w-[200px] shrink-0 flex flex-col gap-1 px-2">
                <p className="px-2 pb-1 text-[length:var(--font-hint)] text-muted-foreground uppercase tracking-wider hidden lg:block">
                  {t("teamsCenter.meta.title")}
                </p>
                <div className="flex flex-col gap-y-3 text-[length:var(--font-size-12)] text-muted-foreground px-2">
                  <div>
                    <span>{t("teamsCenter.meta.status")}</span>
                    <p className="text-foreground font-medium">
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
                      <p className="text-foreground capitalize">{selected.manifest.category}</p>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="lg:w-[200px] shrink-0 flex flex-col gap-1 px-2">
                <p className="px-2 pb-1 text-[length:var(--font-hint)] text-muted-foreground uppercase tracking-wider hidden lg:block">
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
            )}
          </div>

          {/* 右侧主区 */}
          <div className="flex-1 min-w-0 @container">
            {selected ? (
              /* ── 详情页（对齐 template DetailView） ── */
              <div className="flex-1 pb-8">
                <button
                  type="button"
                  className="flex items-center gap-1.5 text-[length:var(--font-size-12)] text-muted-foreground hover:text-foreground transition-colors mb-6"
                  onClick={() => setSelectedId(null)}
                >
                  <ArrowLeftIcon className="size-3.5" />
                  {t("teamsCenter.backToList")}
                </button>

                <div className="space-y-6">
                  <div className="flex items-start gap-3">
                    <PackIcon size="lg" />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-[length:var(--font-size-13)] font-medium">
                          {selected.manifest.name}
                        </h3>
                        {selected.manifest.tier === "pro" && <Badge>Pro</Badge>}
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
                      <p className="text-[length:var(--font-size-12)] text-muted-foreground leading-relaxed mt-1">
                        {selected.manifest.longDescription ?? selected.manifest.description}
                      </p>
                      <div className="flex flex-wrap gap-2 mt-3">
                        <Badge variant="outline">{selected.manifest.publisher}</Badge>
                        <Badge variant="secondary">v{selected.manifest.version}</Badge>
                        {(selected.manifest.tags ?? []).map((tag) => (
                          <Badge key={tag} variant="secondary">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* 内容清单 */}
                  {KIND_ORDER.map((kind) => {
                    const group = contents.filter((c) => c.kind === kind);
                    if (group.length === 0) return null;
                    const Meta = KIND_META[kind];
                    return (
                      <div key={kind}>
                        <h3 className="text-[length:var(--font-size-13)] font-medium mb-2 flex items-center gap-1.5">
                          <Meta.icon className="size-3.5 text-muted-foreground" />
                          {t(Meta.labelKey)}
                          <span className="text-muted-foreground font-normal tabular-nums">
                            {group.length}
                          </span>
                        </h3>
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

                  {/* 操作 */}
                  <div className="flex items-center gap-2 pt-2">
                    {selected.installed &&
                    packDisplayState(selected) === "installedProLocked" ? (
                      <Button
                        size="sm"
                        className="shadow-none"
                        onClick={goActivate}
                      >
                        {t("teamsCenter.card.goActivate")}
                      </Button>
                    ) : (
                      !selected.installed &&
                      (selected.locked || !selected.compatible ? (
                        <Button size="sm" className="shadow-none" disabled>
                          {selected.locked
                            ? t("teamsCenter.card.proLocked")
                            : t("teamsCenter.card.incompatible")}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          className="shadow-none"
                          disabled={busy === selected.manifest.id}
                          onClick={() => void install(selected)}
                        >
                          {t("teamsCenter.card.install")}
                        </Button>
                      ))
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="shadow-none"
                      onClick={() => {
                        useLayoutStore.getState().setLeftSidebarView("settings");
                        useLayoutStore.getState().setSettingsCategory("teams");
                      }}
                    >
                      {t("teamsCenter.manage")}
                    </Button>
                  </div>
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
                  <div className="grid grid-cols-1 @sm:grid-cols-2 @md:grid-cols-3 gap-3">
                    {filtered.map((pack) => (
                      <Card
                        key={pack.manifest.id}
                        className={cn(
                          "cursor-pointer transition-colors overflow-hidden",
                          pack.installed ? "border-primary" : "hover:border-border",
                        )}
                        onClick={() => setSelectedId(pack.manifest.id)}
                      >
                        <div className="relative h-14 flex items-center justify-center bg-muted">
                          <PackIcon size="md" />
                          {pack.installed ? (
                            <Badge className="absolute top-1.5 right-1.5 h-5 px-1.5 text-[length:var(--font-size-10)]">
                              {packDisplayState(pack) === "installedActive"
                                ? t("teamsCenter.card.installedActive")
                                : packDisplayState(pack) === "installedDisabled"
                                  ? t("teamsCenter.card.installedDisabled")
                                  : t("teamsCenter.card.installedProLocked")}
                            </Badge>
                          ) : null}
                        </div>
                        <CardHeader className="p-2.5 gap-0">
                          <CardTitle className="text-[length:var(--font-size-12)] flex items-center gap-1.5">
                            {pack.manifest.name}
                            {pack.manifest.tier === "pro" && (
                              <Badge variant="secondary" className="h-4.5 px-1 text-[length:var(--font-size-10)]">
                                Pro
                              </Badge>
                            )}
                          </CardTitle>
                          <CardDescription className="text-[length:var(--font-badge)] line-clamp-2 leading-relaxed mt-0.5">
                            {pack.manifest.description}
                          </CardDescription>
                          <p className="mt-1.5 text-[length:var(--font-size-10)] uppercase tracking-wide text-muted-foreground">
                            {pack.manifest.publisher} · v{pack.manifest.version}
                          </p>
                        </CardHeader>
                        <div className="px-2.5 pb-2.5">{installButton(pack, true)}</div>
                      </Card>
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
