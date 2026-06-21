import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PuzzleIcon,
  SearchIcon,
  PlusIcon,
  FileTextIcon,
  FolderOpenIcon,
  LibraryIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useDocumentStore } from "@/stores/document-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  buildSkillMd,
  DEFAULT_SKILL_BODY,
  isValidSkillName,
  normalizePastedSkill,
  parseSkillMd,
} from "@/lib/skill-config";
import {
  SKILL_CATEGORY_LABELS,
  type BundledSkillInfo,
  type SkillCategory,
} from "@/lib/skill-categories";
import {
  PRISM_CURATED_LIBRARY,
} from "@/lib/skill-libraries";
import { useInlineDeleteConfirm } from "@/hooks/use-inline-delete-confirm";
import { InlineDeleteButton } from "./inline-delete-button";

const PRISM_CURATED_SOURCE_ID = PRISM_CURATED_LIBRARY.id;
const LIBRARY_PAGE_SIZE = 40;

const CATEGORY_HEADER =
  "text-[length:var(--font-size-12)] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2";
const CARD = "rounded-lg border border-border px-4 divide-y divide-border";
const ROW = "flex items-center justify-between gap-3 py-2.5";
const ROW_LABEL = "text-[length:var(--font-size-13)] font-medium";
const ROW_DESC = "text-[length:var(--font-size-12)] text-muted-foreground mt-0.5 line-clamp-2";
const BADGE =
  "inline-flex items-center rounded px-1.5 py-0.5 text-[length:var(--font-size-10)] font-medium uppercase tracking-wide shrink-0";
const INPUT =
  "w-full rounded-md border border-input bg-transparent px-3 py-1.5 text-[length:var(--font-size-13)] outline-none focus:border-primary/40";

interface InstalledSkill {
  id: string;
  name: string;
  description: string;
  skillDirRel: string;
  enabled: boolean;
}

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

export function SkillsSettings() {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const openFile = useRightPanelStore((s) => s.openFile);

  const [skills, setSkills] = useState<InstalledSkill[]>([]);
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

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createBody, setCreateBody] = useState(DEFAULT_SKILL_BODY);
  const [pasteText, setPasteText] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const [configureId, setConfigureId] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState("");
  const [editBody, setEditBody] = useState("");

  const deleteConfirm = useInlineDeleteConfirm();
  const sourceRemoveConfirm = useInlineDeleteConfirm();

  const [librarySources, setLibrarySources] = useState<LibrarySource[]>([]);
  const [sourcesDialogOpen, setSourcesDialogOpen] = useState(false);
  const [addLibraryUrl, setAddLibraryUrl] = useState("");
  const [addLibraryError, setAddLibraryError] = useState<string | null>(null);

  const installedIds = useMemo(() => new Set(skills.map((s) => s.id)), [skills]);

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

  const loadSkills = useCallback(async () => {
    setLoaded(false);
    try {
      const bundledPromise = window.electronAPI.agentListBundledSkills();
      if (!projectRoot) {
        setBundledSkills(await bundledPromise);
        setSkills([]);
        setLibrarySources([]);
        return;
      }
      const [list, sources, bundled] = await Promise.all([
        window.electronAPI.agentListSkills(projectRoot),
        window.electronAPI.agentListSkillLibrarySources(projectRoot),
        bundledPromise,
      ]);
      setSkills(list);
      setLibrarySources(sources);
      setBundledSkills(bundled);
    } catch {
      setSkills([]);
      setLibrarySources([]);
      setBundledSkills([]);
    } finally {
      setLoaded(true);
    }
  }, [projectRoot]);

  useEffect(() => {
    void loadSkills();
  }, [loadSkills]);

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

  const closeCreate = () => {
    setCreateOpen(false);
    setCreateName("");
    setCreateDescription("");
    setCreateBody(DEFAULT_SKILL_BODY);
    setPasteText("");
    setCreateError(null);
  };

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
      await loadSkills();
      toast.success(`Installed "${item.name}" — start a new chat to use it.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Install failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    if (!projectRoot) return;
    setCreateError(null);

    let name = createName.trim();
    let description = createDescription.trim();
    let body = createBody.trim();

    if (pasteText.trim()) {
      const normalized = normalizePastedSkill(pasteText, createName.trim() || undefined);
      if (normalized.error === "invalid_name") {
        setCreateError("Enter a valid skill id (lowercase, hyphens, e.g. my-skill).");
        return;
      }
      if (normalized.error === "missing_description" && !createDescription.trim()) {
        setCreateError("Add a short description or include it in the pasted SKILL.md frontmatter.");
        return;
      }
      if (normalized.error === "empty") {
        setCreateError("Paste SKILL.md content or fill the form.");
        return;
      }
      name = normalized.meta.name || name;
      description = normalized.meta.description || description;
      body = normalized.meta.body;
    }

    if (!isValidSkillName(name)) {
      setCreateError("Skill id must match folder name: lowercase letters, numbers, hyphens.");
      return;
    }
    if (!description.trim()) {
      setCreateError("Description is required (shown to the agent when choosing skills).");
      return;
    }
    if (!body.trim()) {
      setCreateError("Skill body cannot be empty.");
      return;
    }
    if (installedIds.has(name) && configureId !== name) {
      setCreateError(`Skill "${name}" already exists.`);
      return;
    }

    setSaving(true);
    try {
      const content = buildSkillMd({ name, description, body });
      await window.electronAPI.agentInstallSkill(projectRoot, name, content);
      await window.electronAPI.chatPrewarm(projectRoot);
      await loadSkills();
      closeCreate();
      toast.success(`Created skill "${name}" — start a new chat to use it.`);
    } finally {
      setSaving(false);
    }
  };

  const openConfigure = async (skill: InstalledSkill) => {
    if (!projectRoot) return;
    deleteConfirm.clearPending();
    setConfigureId(skill.id);
    try {
      const path = `${projectRoot}/${skill.skillDirRel}/SKILL.md`;
      const result = await window.electronAPI.fsRead(path);
      const parsed = parseSkillMd(result.content);
      setEditDescription(parsed.description);
      setEditBody(parsed.body);
    } catch {
      setEditDescription(skill.description);
      setEditBody("");
    }
  };

  const saveConfigure = async () => {
    if (!projectRoot || !configureId) return;
    if (!editDescription.trim() || !editBody.trim()) {
      toast.error("Description and body are required.");
      return;
    }
    setSaving(true);
    try {
      const content = buildSkillMd({
        name: configureId,
        description: editDescription.trim(),
        body: editBody.trim(),
      });
      await window.electronAPI.agentInstallSkill(projectRoot, configureId, content);
      await window.electronAPI.chatPrewarm(projectRoot);
      setConfigureId(null);
      await loadSkills();
      toast.success("Skill updated.");
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async (skillId: string, enabled: boolean) => {
    if (!projectRoot) return;
    deleteConfirm.clearPending();
    setSaving(true);
    try {
      await window.electronAPI.agentSetSkillEnabled(projectRoot, skillId, enabled);
      await window.electronAPI.chatPrewarm(projectRoot);
      await loadSkills();
    } finally {
      setSaving(false);
    }
  };

  const deleteSkill = async (skillId: string) => {
    if (!projectRoot) return;
    if (configureId === skillId) setConfigureId(null);
    deleteConfirm.clearPending();
    setSaving(true);
    try {
      await window.electronAPI.agentDeleteSkill(projectRoot, skillId);
      await window.electronAPI.chatPrewarm(projectRoot);
      await loadSkills();
      toast.success(`Removed "${skillId}".`);
    } finally {
      setSaving(false);
    }
  };

  const openSkillsFolder = () => {
    openFile(".prismnext/agent/skills", ".prismnext/agent/skills", "skills");
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

  const renderAddButtons = (className?: string) => (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Button variant="outline" size="xs" onClick={() => { closeCreate(); setCreateOpen(true); }}>
        <FileTextIcon className="size-3 mr-1" />
        Create skill
      </Button>
    </div>
  );

  const renderSkillRow = (item: CatalogSkillItem) => {
    const installed = installedIds.has(item.id);
    const isArchive = item.artifactType === "archive";
    return (
      <div key={item.key} className={ROW}>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={ROW_LABEL}>{item.name}</span>
            {item.category && (
              <span className={cn(BADGE, "bg-muted text-muted-foreground")}>
                {SKILL_CATEGORY_LABELS[item.category]}
              </span>
            )}
            <span className={cn(BADGE, "bg-muted/50 text-muted-foreground/80 normal-case")}>
              {item.sourceLabel}
            </span>
          </div>
          <p className={ROW_DESC}>{item.description}</p>
        </div>
        {installed ? (
          <span className={cn(BADGE, "bg-primary/10 text-primary shrink-0")}>Installed</span>
        ) : isArchive ? (
          <span className={cn(BADGE, "bg-muted text-muted-foreground shrink-0")}>N/A</span>
        ) : (
          <Button
            variant="outline"
            size="xs"
            className="shrink-0"
            disabled={saving || !projectRoot}
            onClick={() => void installCatalogSkill(item)}
          >
            Install
          </Button>
        )}
      </div>
    );
  };

  const renderSourcesDialog = () => (
    <Dialog
      open={sourcesDialogOpen}
      onOpenChange={(o) => {
        setSourcesDialogOpen(o);
        if (!o) {
          setAddLibraryUrl("");
          setAddLibraryError(null);
          sourceRemoveConfirm.clearPending();
        }
      }}
    >
      <DialogContent className="w-[560px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-[length:var(--font-dialog-title)]">
            Skill library sources
          </DialogTitle>
        </DialogHeader>
        <p className="text-[length:var(--font-size-12)] text-muted-foreground -mt-2">
          Add registry URLs below. Connect shows skills in Skill library; disconnect hides them.
          Remove deletes a source from this project.
        </p>

        <div className="space-y-2 shrink-0">
          <div className="flex gap-2">
            <input
              type="url"
              className={cn(INPUT, "flex-1")}
              placeholder="https://example.com/.well-known/agent-skills/index.json"
              value={addLibraryUrl}
              onChange={(e) => { setAddLibraryUrl(e.target.value); setAddLibraryError(null); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleAddLibrary();
              }}
            />
            <Button size="xs" disabled={saving || !projectRoot} onClick={() => void handleAddLibrary()}>
              Add
            </Button>
          </div>
          {addLibraryError && (
            <p className="text-[length:var(--font-size-12)] text-destructive">{addLibraryError}</p>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <p className={cn(CATEGORY_HEADER, "mt-2")}>Sources</p>
          <div className={cn(CARD, "!px-0")}>
            {librarySources.length === 0 ? (
              <div className="py-6 text-center text-[length:var(--font-size-12)] text-muted-foreground">
                No sources yet.
              </div>
            ) : (
              librarySources.map((source) => (
                <div key={source.id} className={cn(ROW, "px-4")}>
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
      </DialogContent>
    </Dialog>
  );

  const renderCreateDialog = () => (
    <Dialog open={createOpen} onOpenChange={(o) => { if (o) setCreateOpen(true); else closeCreate(); }}>
      <DialogContent className="w-[560px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-[length:var(--font-dialog-title)]">Create skill</DialogTitle>
        </DialogHeader>
        <p className="text-[length:var(--font-size-12)] text-muted-foreground -mt-2">
          Fill the form or paste a complete SKILL.md below.
        </p>
        <div className="space-y-3 overflow-y-auto flex-1 min-h-0 pr-1">
          <input
            type="text"
            className={INPUT}
            placeholder="Skill id (folder name, e.g. my-workflow)"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
          />
          <input
            type="text"
            className={INPUT}
            placeholder="Short description (shown to agent)"
            value={createDescription}
            onChange={(e) => setCreateDescription(e.target.value)}
          />
          <Textarea
            className="min-h-32 !field-sizing-fixed font-mono !text-[length:var(--font-size-12)] resize-y bg-background"
            placeholder="Skill instructions (markdown body)"
            value={createBody}
            onChange={(e) => setCreateBody(e.target.value)}
          />
          <p className="text-[length:var(--font-size-11)] text-muted-foreground">Or paste SKILL.md</p>
          <Textarea
            className="min-h-28 !field-sizing-fixed font-mono !text-[length:var(--font-size-12)] resize-y bg-background"
            placeholder={"---\nname: my-skill\ndescription: When to use this skill\n---\n\n# Instructions"}
            value={pasteText}
            onChange={(e) => { setPasteText(e.target.value); setCreateError(null); }}
          />
          {createError && (
            <p className="text-[length:var(--font-size-12)] text-destructive">{createError}</p>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="xs" onClick={closeCreate} disabled={saving}>Cancel</Button>
          <Button size="xs" onClick={() => void handleCreate()} disabled={saving}>Create</Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  return (
    <div ref={scrollRootRef} className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-8 py-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[length:var(--font-dialog-title)] font-semibold">Skills</h2>
            <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">
              Reusable instruction packs the agent loads on demand via the skill tool.
            </p>
          </div>
          {projectRoot && (
            <Button variant="outline" size="xs" className="shrink-0" onClick={openSkillsFolder}>
              <FolderOpenIcon className="size-3 mr-1" />
              Open folder
            </Button>
          )}
        </div>

        {!projectRoot ? (
          <div className={cn(CARD, "!divide-y-0")}>
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <PuzzleIcon className="size-8 text-muted-foreground/30" />
              <p className="text-[length:var(--font-size-13)] text-muted-foreground">Open a project to manage skills.</p>
            </div>
          </div>
        ) : (
          <>
            <p className="text-[length:var(--font-size-12)] text-muted-foreground -mt-2">
              Stored in{" "}
              <code className="text-[length:var(--font-size-11)] bg-muted px-1 py-0.5 rounded">
                .prismnext/agent/skills/&lt;name&gt;/SKILL.md
              </code>
              . OpenCode discovers them via project{" "}
              <code className="text-[length:var(--font-size-11)] bg-muted px-1 py-0.5 rounded">.opencode/opencode.json</code>.
              New chat tabs pick up changes.
            </p>

            <div>
              <div className="flex items-center justify-between gap-3 mb-2">
                <p className={cn(CATEGORY_HEADER, "mb-0")}>Installed</p>
                {renderAddButtons("shrink-0")}
              </div>
              <div className={CARD}>
                {!loaded ? (
                  <div className="py-3 text-[length:var(--font-size-12)] text-muted-foreground">Loading…</div>
                ) : skills.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 py-10 text-center">
                    <PuzzleIcon className="size-8 text-muted-foreground/30" />
                    <p className="text-[length:var(--font-size-13)] text-muted-foreground">No skills yet.</p>
                    <p className="text-[length:var(--font-size-12)] text-muted-foreground/80">
                      Install from Skill libraries below or create your own.
                    </p>
                    {renderAddButtons()}
                  </div>
                ) : (
                  skills.map((skill) => {
                    const configuring = configureId === skill.id;
                    return (
                      <div key={skill.id}>
                        <div className={ROW}>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={cn(ROW_LABEL, "font-mono")}>{skill.name}</span>
                              {!skill.enabled && (
                                <span className={cn(BADGE, "bg-muted/60 text-muted-foreground/70")}>off</span>
                              )}
                            </div>
                            <p className={ROW_DESC}>{skill.description || skill.id}</p>
                          </div>
                          <Switch
                            checked={skill.enabled}
                            onCheckedChange={(v) => void toggleEnabled(skill.id, v)}
                            disabled={saving}
                          />
                          <Button
                            variant="ghost"
                            size="xs"
                            className="shrink-0"
                            disabled={saving}
                            onClick={() => {
                              deleteConfirm.clearPending();
                              if (configuring) setConfigureId(null);
                              else void openConfigure(skill);
                            }}
                          >
                            {configuring ? "Close" : "Edit"}
                          </Button>
                          <InlineDeleteButton
                            itemId={skill.id}
                            pending={deleteConfirm.isPending(skill.id)}
                            disabled={saving}
                            onRequest={() => deleteConfirm.setPendingId(skill.id)}
                            onConfirm={() => void deleteSkill(skill.id)}
                          />
                        </div>
                        {configuring && (
                          <div className="px-4 pb-4 border-t border-border/50 space-y-3">
                            <input
                              type="text"
                              className={INPUT}
                              value={editDescription}
                              onChange={(e) => setEditDescription(e.target.value)}
                              placeholder="Description"
                            />
                            <Textarea
                              className="min-h-40 !field-sizing-fixed font-mono !text-[length:var(--font-size-12)] resize-y bg-background"
                              value={editBody}
                              onChange={(e) => setEditBody(e.target.value)}
                            />
                            <div className="flex gap-2">
                              <Button size="xs" onClick={() => void saveConfigure()} disabled={saving}>Save</Button>
                              <Button variant="ghost" size="xs" onClick={() => setConfigureId(null)} disabled={saving}>Cancel</Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-3 mb-2">
                <p className={cn(CATEGORY_HEADER, "mb-0")}>Skill library</p>
                <Button
                  variant="outline"
                  size="xs"
                  className="shrink-0"
                  onClick={() => setSourcesDialogOpen(true)}
                >
                  <LibraryIcon className="size-3 mr-1" />
                  Manage sources
                </Button>
              </div>
              <p className="text-[length:var(--font-size-12)] text-muted-foreground mb-3">
                Browse connected libraries and install into your project. Scroll to load more skills.
              </p>

              <div className="relative mb-3">
                <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <input
                  type="search"
                  className={cn(INPUT, "pl-8")}
                  placeholder="Search loaded skills…"
                  value={librarySearch}
                  onChange={(e) => setLibrarySearch(e.target.value)}
                />
              </div>

              {connectedLibrarySources.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border py-10 text-center">
                  <p className="text-[length:var(--font-size-13)] text-muted-foreground">
                    No connected libraries yet.
                  </p>
                  <Button
                    variant="outline"
                    size="xs"
                    className="mt-3"
                    onClick={() => setSourcesDialogOpen(true)}
                  >
                    Connect a skill library
                  </Button>
                </div>
              ) : visibleCatalogItems.length === 0 && !catalogTailLoading ? (
                <div className="rounded-lg border border-dashed border-border py-10 text-center">
                  <p className="text-[length:var(--font-size-13)] text-muted-foreground">
                    {librarySearch.trim()
                      ? "No loaded skills match your search."
                      : "No skills available yet."}
                  </p>
                  {hasMoreRemotesToFetch && librarySearch.trim() && (
                    <p className="text-[length:var(--font-size-12)] text-muted-foreground/80 mt-2">
                      Scroll down to load more libraries, then search again.
                    </p>
                  )}
                </div>
              ) : (
                <div className={CARD}>
                  {visibleCatalogItems.map(renderSkillRow)}
                  {hasMoreLibraryItems && (
                    <div
                      ref={librarySentinelRef}
                      className="min-h-8 py-2 text-center text-[length:var(--font-size-12)] text-muted-foreground"
                    >
                      {catalogTailLoading ? "Loading more skills…" : null}
                    </div>
                  )}
                </div>
              )}
            </div>

            {renderSourcesDialog()}
            {renderCreateDialog()}
          </>
        )}
      </div>
    </div>
  );
}
