import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRightIcon, LibraryIcon, Loader2Icon, SearchIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useDocumentStore } from "@/stores/document-store";
import { openUrlInBrowser } from "@/lib/browser-link";
import { bumpSkillsRefresh } from "@/lib/settings/skills-refresh";
import {
  SKILL_CATEGORY_LABELS,
  type BundledSkillInfo,
  type SkillCategory,
} from "@/lib/agent/skill-categories";
import { PRISM_CURATED_LIBRARY } from "@/lib/agent/skill-libraries";
import { useInlineDeleteConfirm } from "@/hooks/use-inline-delete-confirm";
import { InlineDeleteButton } from "./inline-delete-button";
import { cn } from "@/lib/utils";
import {
  SETTINGS_CATEGORY_HEADER,
  SETTINGS_DETAIL_SHELL,
  SETTINGS_ROW_DESC,
} from "./settings-tokens";

const PRISM_CURATED_SOURCE_ID = PRISM_CURATED_LIBRARY.id;
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
  kind: "bundled" | "remote";
  url?: string;
  connected: boolean;
  name: string;
  description: string;
  removable: boolean;
}

interface CatalogSkillItem {
  key: string;
  id: string;
  name: string;
  description: string;
  sourceLabel: string;
  sourceKind: "bundled" | "remote";
  category?: SkillCategory;
  artifactUrl?: string;
  artifactType?: string;
}

function buildBundledCatalogItems(
  bundled: BundledSkillInfo[],
  source: LibrarySource,
): CatalogSkillItem[] {
  return bundled.map((skill) => ({
    key: `bundled:${skill.id}`,
    id: skill.id,
    name: skill.name,
    description: skill.description,
    sourceLabel: source.name,
    sourceKind: "bundled" as const,
    category: skill.category,
  }));
}

function filterCatalogItems(items: CatalogSkillItem[], query: string): CatalogSkillItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.sourceLabel.toLowerCase().includes(q) ||
      (s.category && SKILL_CATEGORY_LABELS[s.category].toLowerCase().includes(q)),
  );
}

export function SkillLibraryPanel() {
  const projectRoot = useDocumentStore((s) => s.projectRoot);

  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set());
  const [bundledSkills, setBundledSkills] = useState<BundledSkillInfo[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogSkillItem[]>([]);
  const [catalogTailLoading, setCatalogTailLoading] = useState(false);
  const [visibleCount, setVisibleCount] = useState(LIBRARY_PAGE_SIZE);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  const scrollRootRef = useRef<HTMLDivElement>(null);
  const librarySentinelRef = useRef<HTMLDivElement>(null);
  const loadedRemoteIdsRef = useRef<Set<string>>(new Set());
  const fetchingRemotesRef = useRef(false);

  const [librarySearch, setLibrarySearch] = useState("");
  const [librarySources, setLibrarySources] = useState<LibrarySource[]>([]);
  const [addLibraryUrl, setAddLibraryUrl] = useState("");
  const [addLibraryError, setAddLibraryError] = useState<string | null>(null);
  const sourceRemoveConfirm = useInlineDeleteConfirm();

  const connectedLibrarySources = useMemo(
    () => librarySources.filter((s) => s.connected),
    [librarySources],
  );

  const filteredCatalogItems = useMemo(
    () => filterCatalogItems(catalogItems, librarySearch),
    [catalogItems, librarySearch],
  );

  const visibleCatalogItems = useMemo(
    () => filteredCatalogItems.slice(0, visibleCount),
    [filteredCatalogItems, visibleCount],
  );

  const hasMoreRemotesToFetch = useMemo(
    () =>
      connectedLibrarySources.some(
        (s) => s.kind === "remote" && s.url && !loadedRemoteIdsRef.current.has(s.id),
      ),
    [connectedLibrarySources, catalogItems],
  );

  const hasMoreLibraryItems =
    visibleCount < filteredCatalogItems.length || hasMoreRemotesToFetch;

  const resetLibraryCatalog = useCallback(() => {
    const items: CatalogSkillItem[] = [];
    const bundledSource = connectedLibrarySources.find(
      (s) => s.id === PRISM_CURATED_SOURCE_ID,
    );
    if (bundledSource) {
      items.push(...buildBundledCatalogItems(bundledSkills, bundledSource));
    }
    loadedRemoteIdsRef.current = new Set();
    fetchingRemotesRef.current = false;
    setCatalogItems(items);
    setVisibleCount(LIBRARY_PAGE_SIZE);
    setCatalogTailLoading(false);
  }, [bundledSkills, connectedLibrarySources]);

  const fetchNextRemoteBatch = useCallback(async (): Promise<boolean> => {
    const nextSource = connectedLibrarySources.find(
      (s) => s.kind === "remote" && s.url && !loadedRemoteIdsRef.current.has(s.id),
    );
    if (!nextSource?.url) return false;

    loadedRemoteIdsRef.current.add(nextSource.id);
    try {
      const { skills: remoteSkills } =
        await window.electronAPI.agentFetchSkillRegistry(nextSource.url);
      const batch = remoteSkills.map((skill) => ({
        key: `remote:${nextSource.id}:${skill.name}`,
        id: skill.name.trim().toLowerCase(),
        name: skill.name,
        description: skill.description || skill.name,
        sourceLabel: nextSource.name,
        sourceKind: "remote" as const,
        artifactUrl: skill.url,
        artifactType: skill.type,
      }));
      setCatalogItems((prev) => [...prev, ...batch]);
      return true;
    } catch {
      toast.error(`Failed to load skills from "${nextSource.name}".`);
      return false;
    }
  }, [connectedLibrarySources]);

  const loadMoreLibraryItems = useCallback(async () => {
    if (visibleCount < filteredCatalogItems.length) {
      setVisibleCount((count) => count + LIBRARY_PAGE_SIZE);
      return;
    }

    const hasRemotes = connectedLibrarySources.some(
      (s) => s.kind === "remote" && s.url && !loadedRemoteIdsRef.current.has(s.id),
    );
    if (!hasRemotes || fetchingRemotesRef.current) return;

    fetchingRemotesRef.current = true;
    setCatalogTailLoading(true);
    try {
      const loaded = await fetchNextRemoteBatch();
      if (loaded) {
        setVisibleCount((count) => count + LIBRARY_PAGE_SIZE);
      }
    } finally {
      fetchingRemotesRef.current = false;
      setCatalogTailLoading(false);
    }
  }, [connectedLibrarySources, fetchNextRemoteBatch, filteredCatalogItems.length, visibleCount]);

  const loadPanelData = useCallback(async () => {
    setLoaded(false);
    try {
      const bundledPromise = window.electronAPI.agentListBundledSkills();
      if (!projectRoot) {
        setBundledSkills(await bundledPromise);
        setInstalledIds(new Set());
        setLibrarySources([]);
        return;
      }
      const [list, sources, bundled] = await Promise.all([
        window.electronAPI.agentListSkills(projectRoot),
        window.electronAPI.agentListSkillLibrarySources(projectRoot),
        bundledPromise,
      ]);
      setInstalledIds(new Set(list.map((s) => s.id)));
      setLibrarySources(sources);
      setBundledSkills(bundled);
    } catch {
      setInstalledIds(new Set());
      setLibrarySources([]);
      setBundledSkills([]);
    } finally {
      setLoaded(true);
    }
  }, [projectRoot]);

  useEffect(() => {
    void loadPanelData();
  }, [loadPanelData]);

  useEffect(() => {
    resetLibraryCatalog();
  }, [resetLibraryCatalog]);

  useEffect(() => {
    setVisibleCount(LIBRARY_PAGE_SIZE);
  }, [librarySearch]);

  useEffect(() => {
    const root = scrollRootRef.current;
    const sentinel = librarySentinelRef.current;
    if (!root || !sentinel || !hasMoreLibraryItems) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMoreLibraryItems();
        }
      },
      { root, rootMargin: "240px", threshold: 0 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [
    catalogItems.length,
    catalogTailLoading,
    hasMoreLibraryItems,
    loadMoreLibraryItems,
    visibleCatalogItems.length,
  ]);

  const installCatalogSkill = async (item: CatalogSkillItem) => {
    if (!projectRoot) return;
    if (installedIds.has(item.id)) return;

    if (item.sourceKind === "remote") {
      if (item.artifactType === "archive") {
        toast.error("Archive skills are not supported yet — only SKILL.md installs.");
        return;
      }
      if (!item.artifactUrl) return;
    }

    setSaving(true);
    try {
      if (item.sourceKind === "bundled") {
        await window.electronAPI.agentInstallBundledSkill(projectRoot, item.id);
      } else {
        await window.electronAPI.agentInstallSkillFromRegistry(
          projectRoot,
          item.name,
          item.artifactUrl!,
        );
      }
      await window.electronAPI.chatPrewarm(projectRoot);
      bumpSkillsRefresh();
      setInstalledIds((prev) => new Set([...prev, item.id]));
      toast.success(`Installed "${item.name}" — start a new chat to use it.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Install failed.");
    } finally {
      setSaving(false);
    }
  };

  const addLibrarySource = async (registryUrl: string) => {
    if (!projectRoot) return;
    setSaving(true);
    setAddLibraryError(null);
    try {
      const result = await window.electronAPI.agentAddSkillLibrarySource(projectRoot, registryUrl);
      setLibrarySources(result.sources);
      setAddLibraryUrl("");
      await window.electronAPI.chatPrewarm(projectRoot);
      toast.success("Skill library source added.");
    } catch (err) {
      setAddLibraryError(err instanceof Error ? err.message : "Invalid registry URL.");
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
      await window.electronAPI.chatPrewarm(projectRoot);
      toast.success(connected ? `"${source.name}" connected.` : `"${source.name}" disconnected.`);
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
      await window.electronAPI.chatPrewarm(projectRoot);
      toast.success(`Removed "${source.name}".`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove source.");
    } finally {
      setSaving(false);
    }
  };

  const handleAddLibrary = async () => {
    const url = addLibraryUrl.trim();
    if (!url) {
      setAddLibraryError("Enter a registry URL or site hostname.");
      return;
    }
    await addLibrarySource(url);
  };

  if (!projectRoot) {
    return (
      <div className="flex flex-1 items-center justify-center px-8 text-[length:var(--font-size-13)] text-muted-foreground">
        Open a project to browse skill libraries.
      </div>
    );
  }

  return (
    <div ref={scrollRootRef} className="flex-1 min-h-0 overflow-auto">
      <div className={SETTINGS_DETAIL_SHELL}>
        <p className={SETTINGS_ROW_DESC}>
          Connect registry sources, then install skills into your project. Installed skills appear
          on the main Skills page.
        </p>

        <div className="space-y-3">
          <p className={SETTINGS_CATEGORY_HEADER}>Library sources</p>
          <div className="flex gap-2">
            <input
              type="url"
              className={cn(INPUT, "flex-1")}
              placeholder="https://example.com/.well-known/agent-skills/index.json"
              value={addLibraryUrl}
              onChange={(e) => {
                setAddLibraryUrl(e.target.value);
                setAddLibraryError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleAddLibrary();
              }}
            />
            <Button size="xs" disabled={saving} onClick={() => void handleAddLibrary()}>
              Add source
            </Button>
          </div>
          {addLibraryError && (
            <p className="text-[length:var(--font-size-12)] text-destructive">{addLibraryError}</p>
          )}

          <div className={cn(CARD, "!px-0")}>
            {librarySources.length === 0 ? (
              <div className="py-6 text-center text-[length:var(--font-size-12)] text-muted-foreground">
                No sources yet.
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
                          source.connected
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {source.connected ? "Connected" : "Disconnected"}
                      </span>
                    </div>
                    <p className={ROW_DESC}>{source.description}</p>
                    {source.url && (
                      <p className="text-[length:var(--font-size-11)] font-mono text-muted-foreground/70 mt-0.5 truncate">
                        {source.url}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
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
                        Disconnect
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
                        Connect
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
          <p className={SETTINGS_CATEGORY_HEADER}>Browse skills</p>
          <div className="relative">
            <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <input
              type="search"
              className={cn(INPUT, "pl-8")}
              placeholder="Search loaded skills…"
              value={librarySearch}
              onChange={(e) => setLibrarySearch(e.target.value)}
            />
          </div>

          {!loaded ? (
            <div className="flex items-center gap-2 text-[length:var(--font-size-12)] text-muted-foreground py-4">
              <Loader2Icon className="size-3.5 animate-spin" />
              Loading…
            </div>
          ) : connectedLibrarySources.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border py-10 text-center">
              <p className="text-[length:var(--font-size-13)] text-muted-foreground">
                Connect a library source above to browse skills.
              </p>
            </div>
          ) : visibleCatalogItems.length === 0 && !catalogTailLoading ? (
            <div className="rounded-lg border border-dashed border-border py-10 text-center">
              <p className="text-[length:var(--font-size-13)] text-muted-foreground">
                {librarySearch.trim()
                  ? "No loaded skills match your search."
                  : "No skills available yet."}
              </p>
            </div>
          ) : (
            <div className="@container space-y-2">
              <div className="grid grid-cols-1 @md:grid-cols-2 gap-2.5">
                {visibleCatalogItems.map((item) => {
                  const installed = installedIds.has(item.id);
                  const isArchive = item.artifactType === "archive";
                  return (
                    <div
                      key={item.key}
                      className="flex flex-col gap-1.5 rounded-md border border-border/70 px-3 py-2.5 hover:border-border transition-colors"
                    >
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span
                          className="text-[length:var(--font-size-13)] font-medium leading-snug break-words"
                        >
                          {item.name}
                        </span>
                        {item.category && (
                          <span
                            className={cn(
                              BADGE,
                              "bg-muted/80 text-muted-foreground normal-case tracking-normal",
                            )}
                          >
                            {SKILL_CATEGORY_LABELS[item.category]}
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
                          {item.sourceKind === "remote" && item.artifactUrl ? (
                            <button
                              type="button"
                              className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                              title="Open skill URL in browser"
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
                              Installed
                            </span>
                          ) : isArchive ? (
                            <span
                              className={cn(
                                BADGE,
                                "bg-muted text-muted-foreground normal-case tracking-normal shrink-0",
                              )}
                            >
                              N/A
                            </span>
                          ) : (
                            <Button
                              variant="outline"
                              size="xs"
                              className="h-6 px-2.5 shrink-0 text-[length:var(--font-size-11)]"
                              disabled={saving}
                              onClick={() => void installCatalogSkill(item)}
                            >
                              Install
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
                >
                  {catalogTailLoading ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2Icon className="size-3.5 animate-spin" />
                      Loading more skills…
                    </span>
                  ) : null}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
