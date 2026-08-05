import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { ArrowUpRightIcon, EyeIcon, LibraryIcon, Loader2Icon, SearchIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useDocumentStore } from "@/stores/document-store";
import { openUrlInBrowser } from "@/lib/browser-link";
import { openSettingsPanel } from "@/stores/settings-panel-store";
import { bumpSkillsRefresh } from "@/lib/settings/skills-refresh";
import { SKILL_CATEGORY_LABELS } from "@/lib/agent/skill-categories";
import { GITHUB_SKILL_PRESETS } from "@/lib/agent/skill-libraries";
import type { LibraryCatalogItem } from "../../../../shared/skill-library-types";
import { useInlineDeleteConfirm } from "@/hooks/use-inline-delete-confirm";
import { InlineDeleteButton } from "./inline-delete-button";
import { cn } from "@/lib/utils";
import {
  SETTINGS_CATEGORY_HEADER,
  SETTINGS_DETAIL_SHELL,
  SETTINGS_ROW_DESC,
} from "./settings-tokens";

const LIBRARY_PAGE_SIZE = 40;

const CARD = "rounded-lg border border-border divide-y divide-border";
const ROW = "flex items-center justify-between gap-3 px-4 py-2.5";
const ROW_LABEL = "text-[length:var(--font-size-13)] font-medium";
const ROW_DESC = "text-[length:var(--font-size-12)] text-muted-foreground mt-0.5 line-clamp-2";
const BADGE =
  "inline-flex items-center rounded px-1.5 py-0.5 text-[length:var(--font-size-10)] font-medium uppercase tracking-wide shrink-0";
const INPUT =
  "w-full rounded-md border border-input bg-transparent px-3 py-1.5 text-[length:var(--font-size-13)] outline-none focus:border-primary/40";

interface LibrarySource {
  id: string;
  kind: "bundled" | "remote" | "github";
  url?: string;
  repo?: string;
  ref?: string;
  connected: boolean;
  name: string;
  description: string;
  removable: boolean;
}

function filterCatalogItems(
  items: LibraryCatalogItem[],
  query: string,
  t: TFunction,
): LibraryCatalogItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((s) => {
    const categoryEn = s.category ? SKILL_CATEGORY_LABELS[s.category].toLowerCase() : "";
    const categoryTr = s.category
      ? t(`settings.editor.skills.category.${s.category}`).toLowerCase()
      : "";
    return (
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.sourceLabel.toLowerCase().includes(q) ||
      (categoryEn && categoryEn.includes(q)) ||
      (categoryTr && categoryTr.includes(q))
    );
  });
}

export function SkillLibraryPanel() {
  const { t } = useTranslation();
  const projectRoot = useDocumentStore((s) => s.projectRoot);

  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set());
  const [catalogItems, setCatalogItems] = useState<LibraryCatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [visibleCount, setVisibleCount] = useState(LIBRARY_PAGE_SIZE);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  const scrollRootRef = useRef<HTMLDivElement>(null);
  const librarySentinelRef = useRef<HTMLDivElement>(null);
  const loadedSourceIdsRef = useRef<Set<string>>(new Set());

  const [librarySearch, setLibrarySearch] = useState("");
  const [librarySources, setLibrarySources] = useState<LibrarySource[]>([]);
  const [addSourceUrl, setAddSourceUrl] = useState("");
  const [addSourceError, setAddSourceError] = useState<string | null>(null);
  const sourceRemoveConfirm = useInlineDeleteConfirm();

  const connectedSources = useMemo(
    () => librarySources.filter((s) => s.connected),
    [librarySources],
  );

  const filteredCatalogItems = useMemo(
    () => filterCatalogItems(catalogItems, librarySearch, t),
    [catalogItems, librarySearch, t],
  );

  const visibleCatalogItems = useMemo(
    () => filteredCatalogItems.slice(0, visibleCount),
    [filteredCatalogItems, visibleCount],
  );

  const hasMoreLibraryItems = visibleCount < filteredCatalogItems.length;

  const loadPanelData = useCallback(async () => {
    setLoaded(false);
    loadedSourceIdsRef.current = new Set();
    setCatalogItems([]);
    try {
      if (!projectRoot) {
        setInstalledIds(new Set());
        setLibrarySources([]);
        return;
      }
      const [list, sources] = await Promise.all([
        window.electronAPI.agentListSkills(projectRoot),
        window.electronAPI.agentListSkillLibrarySources(projectRoot),
      ]);
      setInstalledIds(new Set(list.map((s) => s.id)));
      setLibrarySources(sources);
    } catch {
      setInstalledIds(new Set());
      setLibrarySources([]);
    } finally {
      setLoaded(true);
    }
  }, [projectRoot]);

  const reloadAllCatalogs = useCallback(async () => {
    if (!projectRoot) return;
    loadedSourceIdsRef.current = new Set();
    setCatalogItems([]);
    setCatalogLoading(true);
    try {
      for (const source of connectedSources) {
        loadedSourceIdsRef.current.add(source.id);
        const batch = await window.electronAPI.agentFetchSkillLibraryCatalog(
          projectRoot,
          source.id,
        );
        setCatalogItems((prev) => [...prev, ...batch]);
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("settings.editor.skills.toast.loadFailed"),
      );
    } finally {
      setCatalogLoading(false);
    }
  }, [connectedSources, projectRoot, t]);

  useEffect(() => {
    void loadPanelData();
  }, [loadPanelData]);

  const connectedSourceKey = connectedSources.map((s) => s.id).join(",");

  useEffect(() => {
    if (!loaded || !projectRoot) return;
    void reloadAllCatalogs();
  }, [loaded, projectRoot, connectedSourceKey, reloadAllCatalogs]);

  useEffect(() => {
    setVisibleCount(LIBRARY_PAGE_SIZE);
  }, [librarySearch, catalogItems.length]);

  useEffect(() => {
    const root = scrollRootRef.current;
    const sentinel = librarySentinelRef.current;
    if (!root || !sentinel || !hasMoreLibraryItems) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleCount((count) => count + LIBRARY_PAGE_SIZE);
        }
      },
      { root, rootMargin: "240px", threshold: 0 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMoreLibraryItems, visibleCatalogItems.length]);

  const installCatalogItem = async (item: LibraryCatalogItem) => {
    if (!projectRoot || installedIds.has(item.skillId)) return;
    setSaving(true);
    try {
      const result = await window.electronAPI.agentInstallLibraryCatalogItem(projectRoot, item);
      await window.electronAPI.chatPrewarm(projectRoot);
      bumpSkillsRefresh();
      setInstalledIds((prev) => new Set([...prev, ...result.installedIds]));
      toast.success(t("settings.editor.skills.toast.installed", { name: item.name }));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("settings.editor.skills.toast.installFailed"),
      );
    } finally {
      setSaving(false);
    }
  };

  const installAllFromSource = async (source: LibrarySource) => {
    if (!projectRoot || source.kind !== "github") return;
    setSaving(true);
    try {
      const result = await window.electronAPI.agentInstallAllFromLibrarySource(
        projectRoot,
        source.id,
      );
      await window.electronAPI.chatPrewarm(projectRoot);
      bumpSkillsRefresh();
      setInstalledIds((prev) => new Set([...prev, ...result.installedIds]));
      toast.success(
        t("settings.editor.skills.toast.installedBatch", {
          count: result.installedIds.length,
          name: source.name,
        }),
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("settings.editor.skills.toast.installAllFailed"),
      );
    } finally {
      setSaving(false);
    }
  };

  const addLibrarySource = async (input: string) => {
    if (!projectRoot) return;
    setSaving(true);
    setAddSourceError(null);
    try {
      const result = await window.electronAPI.agentAddSkillLibrarySource(projectRoot, input);
      setLibrarySources(result.sources);
      setAddSourceUrl("");
      await window.electronAPI.chatPrewarm(projectRoot);
      toast.success(
        t("settings.editor.skills.toast.githubAdded", { count: result.skillCount }),
      );
    } catch (err) {
      setAddSourceError(
        err instanceof Error ? err.message : t("settings.editor.skills.toast.addSourceFailed"),
      );
    } finally {
      setSaving(false);
    }
  };

  const toggleLibrarySource = async (source: LibrarySource, connected: boolean) => {
    if (!projectRoot) return;
    sourceRemoveConfirm.clearPending();
    setSaving(true);
    try {
      const result = await window.electronAPI.agentSetSkillLibrarySourceConnected(
        projectRoot,
        source.id,
        connected,
      );
      setLibrarySources(result.sources);
      if (!connected) {
        loadedSourceIdsRef.current.delete(source.id);
        setCatalogItems((prev) => prev.filter((item) => item.sourceId !== source.id));
      }
      await window.electronAPI.chatPrewarm(projectRoot);
    } finally {
      setSaving(false);
    }
  };

  const removeLibrarySource = async (source: LibrarySource) => {
    if (!projectRoot || !source.removable) return;
    sourceRemoveConfirm.clearPending();
    setSaving(true);
    try {
      const result = await window.electronAPI.agentRemoveSkillLibrarySource(
        projectRoot,
        source.id,
      );
      setLibrarySources(result.sources);
      loadedSourceIdsRef.current.delete(source.id);
      setCatalogItems((prev) => prev.filter((item) => item.sourceId !== source.id));
      await window.electronAPI.chatPrewarm(projectRoot);
      toast.success(t("settings.editor.skills.toast.sourceRemoved", { name: source.name }));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("settings.editor.skills.toast.removeFailed"),
      );
    } finally {
      setSaving(false);
    }
  };

  if (!projectRoot) {
    return (
      <div className="flex flex-1 items-center justify-center px-8 text-[length:var(--font-size-13)] text-muted-foreground">
        {t("settings.editor.skills.openProject")}
      </div>
    );
  }

  return (
    <div ref={scrollRootRef} className="flex-1 min-h-0 overflow-auto">
      <div className={SETTINGS_DETAIL_SHELL}>
        <p className={SETTINGS_ROW_DESC}>{t("settings.editor.skills.intro")}</p>

        <div className="space-y-3">
          <p className={SETTINGS_CATEGORY_HEADER}>{t("settings.editor.skills.sources")}</p>
          <div className="flex gap-2">
            <input
              type="url"
              className={cn(INPUT, "flex-1")}
              placeholder={t("settings.editor.skills.sourcePlaceholder")}
              value={addSourceUrl}
              onChange={(e) => {
                setAddSourceUrl(e.target.value);
                setAddSourceError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void addLibrarySource(addSourceUrl);
              }}
            />
            <Button
              size="xs"
              disabled={saving || !addSourceUrl.trim()}
              onClick={() => void addLibrarySource(addSourceUrl)}
            >
              {t("settings.editor.skills.addSource")}
            </Button>
          </div>
          {addSourceError && (
            <p className="text-[length:var(--font-size-12)] text-destructive">{addSourceError}</p>
          )}

          <div className="flex flex-wrap gap-2">
            {GITHUB_SKILL_PRESETS.map((preset) => (
              <Button
                key={preset.id}
                variant="outline"
                size="xs"
                className="h-7 text-[length:var(--font-size-11)]"
                disabled={saving}
                onClick={() => void addLibrarySource(preset.repoUrl)}
              >
                {t("settings.editor.skills.addSourceNamed", { name: preset.name })}
              </Button>
            ))}
          </div>

          <div className={cn(CARD, "!px-0")}>
            {!loaded ? (
              <div className="flex items-center gap-2 px-4 py-4 text-[length:var(--font-size-12)] text-muted-foreground">
                <Loader2Icon className="size-3.5 animate-spin" />
                {t("settings.editor.skills.loadingSources")}
              </div>
            ) : (
              librarySources.map((source) => (
                <div key={source.id} className={ROW}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <LibraryIcon className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className={ROW_LABEL}>{source.name}</span>
                      <span
                        className={cn(
                          BADGE,
                          source.kind === "bundled"
                            ? "bg-muted text-muted-foreground normal-case tracking-normal"
                            : source.kind === "github"
                              ? "bg-muted/60 text-muted-foreground/80 normal-case tracking-normal"
                              : "bg-muted/60 text-muted-foreground/80 normal-case tracking-normal",
                        )}
                      >
                        {source.kind === "bundled"
                          ? t("settings.editor.skills.kind.bundled")
                          : source.kind === "github"
                            ? t("settings.editor.skills.kind.github")
                            : t("settings.editor.skills.kind.registry")}
                      </span>
                      <span
                        className={cn(
                          BADGE,
                          source.connected
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {source.connected
                          ? t("settings.editor.skills.connected")
                          : t("settings.editor.skills.disconnected")}
                      </span>
                    </div>
                    <p className={ROW_DESC}>{source.description}</p>
                    {source.url && (
                      <p className="text-[length:var(--font-size-11)] font-mono text-muted-foreground/70 mt-0.5 truncate">
                        {source.url}
                      </p>
                    )}
                    {source.repo && (
                      <p className="text-[length:var(--font-size-11)] font-mono text-muted-foreground/70 mt-0.5 truncate">
                        {source.repo}@{source.ref ?? "main"}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {source.kind === "github" && source.connected && (
                      <Button
                        variant="outline"
                        size="xs"
                        disabled={saving}
                        onClick={() => void installAllFromSource(source)}
                      >
                        {t("settings.editor.skills.installAll")}
                      </Button>
                    )}
                    {source.connected ? (
                      <Button
                        variant="outline"
                        size="xs"
                        disabled={saving}
                        onClick={() => {
                          sourceRemoveConfirm.clearPending();
                          void toggleLibrarySource(source, false);
                        }}
                      >
                        {t("settings.editor.skills.disconnect")}
                      </Button>
                    ) : (
                      <Button
                        size="xs"
                        disabled={saving}
                        onClick={() => {
                          sourceRemoveConfirm.clearPending();
                          void toggleLibrarySource(source, true);
                        }}
                      >
                        {t("settings.editor.skills.connect")}
                      </Button>
                    )}
                    {source.removable && (
                      <InlineDeleteButton
                        itemId={source.id}
                        pending={sourceRemoveConfirm.isPending(source.id)}
                        variant="text"
                        disabled={saving}
                        onRequest={() => sourceRemoveConfirm.setPendingId(source.id)}
                        onConfirm={() => void removeLibrarySource(source)}
                      />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-3">
          <p className={SETTINGS_CATEGORY_HEADER}>{t("settings.editor.skills.browse")}</p>
          <div className="relative">
            <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <input
              type="search"
              className={cn(INPUT, "pl-8")}
              placeholder={t("settings.editor.skills.searchPlaceholder")}
              value={librarySearch}
              onChange={(e) => setLibrarySearch(e.target.value)}
            />
          </div>

          {!loaded || catalogLoading ? (
            <div className="flex items-center gap-2 text-[length:var(--font-size-12)] text-muted-foreground py-4">
              <Loader2Icon className="size-3.5 animate-spin" />
              {t("settings.editor.skills.loadingLibrary")}
            </div>
          ) : connectedSources.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border py-10 text-center">
              <p className="text-[length:var(--font-size-13)] text-muted-foreground">
                {t("settings.editor.skills.connectSourceHint")}
              </p>
            </div>
          ) : visibleCatalogItems.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border py-10 text-center">
              <p className="text-[length:var(--font-size-13)] text-muted-foreground">
                {librarySearch.trim()
                  ? t("settings.editor.skills.emptySearch")
                  : t("settings.editor.skills.empty")}
              </p>
            </div>
          ) : (
            <div className="@container space-y-2">
              <div className="grid grid-cols-1 @md:grid-cols-2 gap-2.5">
                {visibleCatalogItems.map((item) => {
                  const installed = installedIds.has(item.skillId);
                  return (
                    <div
                      key={item.key}
                      className="flex flex-col gap-1.5 rounded-md border border-border/70 px-3 py-2.5 hover:border-border transition-colors"
                    >
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-[length:var(--font-size-13)] font-medium leading-snug break-words">
                          {item.name}
                        </span>
                        {item.category && (
                          <span
                            className={cn(
                              BADGE,
                              "bg-muted/80 text-muted-foreground normal-case tracking-normal",
                            )}
                          >
                            {t(`settings.editor.skills.category.${item.category}`)}
                          </span>
                        )}
                      </div>
                      <p
                        className="text-[length:var(--font-size-11)] text-muted-foreground line-clamp-2 leading-snug"
                        title={item.description}
                      >
                        {item.description}
                      </p>
                      <div className="flex items-center justify-between gap-2 pt-0.5">
                        <span
                          className="text-[length:var(--font-size-10)] text-muted-foreground/70 truncate min-w-0"
                          title={item.sourceLabel}
                        >
                          {item.sourceLabel}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          {item.sourceKind === "bundled" ? (
                            <button
                              type="button"
                              className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                              title={t("settings.editor.skills.preview")}
                              onClick={() =>
                                openSettingsPanel({
                                  kind: "skill-markdown",
                                  mode: "preview-bundled",
                                  skillId: item.skillId,
                                  title: item.name,
                                })
                              }
                            >
                              <EyeIcon className="size-3.5" />
                            </button>
                          ) : null}
                          {item.sourceKind === "remote" && item.artifactUrl ? (
                            <button
                              type="button"
                              className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                              title={t("settings.editor.skills.openUrl")}
                              onClick={() => openUrlInBrowser(item.artifactUrl!)}
                            >
                              <ArrowUpRightIcon className="size-3.5" />
                            </button>
                          ) : null}
                          {installed ? (
                            <span
                              className={cn(
                                BADGE,
                                "bg-primary/10 text-primary normal-case tracking-normal shrink-0",
                              )}
                            >
                              {t("settings.editor.skills.installed")}
                            </span>
                          ) : (
                            <Button
                              variant="outline"
                              size="xs"
                              className="h-6 px-2.5 shrink-0 text-[length:var(--font-size-11)]"
                              disabled={saving}
                              onClick={() => void installCatalogItem(item)}
                            >
                              {t("settings.editor.skills.install")}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {hasMoreLibraryItems && (
                <div
                  ref={librarySentinelRef}
                  className="min-h-8 py-1 text-center text-[length:var(--font-size-12)] text-muted-foreground"
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
