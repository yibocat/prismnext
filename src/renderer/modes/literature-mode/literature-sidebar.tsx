import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronRightIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  LibraryIcon,
  Loader2Icon,
  PencilIcon,
  RefreshCwIcon,
  Trash2Icon,
  UserPlusIcon,
  FileTextIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useDocumentStore } from "@/stores/document-store";
import { useLiteratureStore } from "@/stores/literature-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import {
  SidebarContent,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AppContextMenu,
  AppContextMenuContent,
  AppContextMenuItem,
  AppContextMenuTrigger,
} from "@/components/ui/app-context-menu";
import type { LiteratureCollection, LiteratureLibraryView } from "@/types/electron.d";
import { cn } from "@/lib/utils";
import { Hint } from "@/components/ui/hint";
import { useLiteratureExtractStore } from "@/stores/literature-extract-store";
import { useSettingsStore } from "@/stores/settings-store";
import type { PaperExtractSource } from "@/types/electron.d";
import { EXTRACT_BATCH_MAX_PAPERS } from "../../../shared/literature/paper-extract";
import { LiteratureOrphanNotesSection } from "./literature-orphan-notes";
import { LiteraturePaperWorkspaceSidebar } from "./literature-sidebar-paper";

const headerBtn = cn(
  "flex size-5 items-center justify-center rounded text-muted-foreground",
  "hover:bg-accent hover:text-accent-foreground transition-colors",
);

const ROW_BASE =
  "flex h-6 items-center gap-2 rounded-sm px-2 text-[length:var(--font-size-12)] text-muted-foreground";
const ROW_SELECTED = "bg-sidebar-accent text-sidebar-accent-foreground";
const INDENT = (depth: number) => 8 + depth * 16;

function isBoundZoteroCollection(
  collection: LiteratureCollection,
  boundCollectionId: string | null,
): boolean {
  if (!boundCollectionId) return false;
  return collection.id === boundCollectionId || collection.zotero_key === boundCollectionId;
}

function shouldShowCollection(
  collection: LiteratureCollection,
  boundCollectionId: string | null,
): boolean {
  if (!collection.zotero_key) return true;
  return isBoundZoteroCollection(collection, boundCollectionId);
}

function resolveLocalParentId(
  view: LiteratureLibraryView,
  collections: LiteratureCollection[],
  boundCollectionId: string | null,
): string | null {
  if (view.kind !== "collection") return null;
  const parent = collections.find((c) => c.id === view.collectionId);
  if (!parent || isBoundZoteroCollection(parent, boundCollectionId)) return null;
  return parent.id;
}

type FlatCollectionRow = {
  collection: LiteratureCollection;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
};

function flattenVisibleCollections(
  roots: LiteratureCollection[],
  childrenOf: (parentId: string) => LiteratureCollection[],
  expanded: Set<string>,
  depth = 0,
): FlatCollectionRow[] {
  const rows: FlatCollectionRow[] = [];
  for (const collection of roots) {
    const kids = childrenOf(collection.id);
    const hasChildren = kids.length > 0;
    const isExpanded = expanded.has(collection.id);
    rows.push({ collection, depth, hasChildren, isExpanded });
    if (hasChildren && isExpanded) {
      rows.push(...flattenVisibleCollections(kids, childrenOf, expanded, depth + 1));
    }
  }
  return rows;
}

function ancestorIds(
  collectionId: string,
  byId: Map<string, LiteratureCollection>,
): string[] {
  const ids: string[] = [];
  let current = byId.get(collectionId);
  while (current?.parent_id) {
    ids.push(current.parent_id);
    current = byId.get(current.parent_id);
  }
  return ids;
}

function CollectionRow({
  collection,
  active,
  depth,
  hasChildren,
  isExpanded,
  isZoteroBound,
  writePending,
  selectedCount,
  onActivate,
  onRename,
  onDelete,
  onAddSelected,
  onNewSubcollection,
  onExtractAll,
}: {
  collection: LiteratureCollection;
  active: boolean;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
  isZoteroBound: boolean;
  writePending: boolean;
  selectedCount: number;
  onActivate: () => void;
  onRename: () => void;
  onDelete: () => void;
  onAddSelected: () => void;
  onNewSubcollection: () => void;
  onExtractAll: () => void;
}) {
  const { t } = useTranslation();
  return (
    <AppContextMenu>
      <AppContextMenuTrigger asChild>
        <div
          className={cn(ROW_BASE, "cursor-pointer", active && ROW_SELECTED)}
          style={{ paddingLeft: INDENT(depth) }}
          onClick={onActivate}
        >
          <ChevronRightIcon
            className={cn(
              "size-3 shrink-0 text-muted-foreground transition-transform",
              !hasChildren && "invisible",
              hasChildren && isExpanded && "rotate-90",
            )}
          />
          {writePending && isZoteroBound ? (
            <Loader2Icon className="size-3 shrink-0 animate-spin" />
          ) : isExpanded && hasChildren ? (
            <FolderOpenIcon className="size-3 shrink-0" />
          ) : (
            <FolderIcon className="size-3 shrink-0" />
          )}
          <span className="min-w-0 flex-1 truncate">{collection.name}</span>
          {isZoteroBound ? (
            <span
              className="shrink-0 rounded px-1 py-px text-[length:var(--font-size-10)] font-medium uppercase tracking-wide text-muted-foreground/70 bg-muted/60"
              title={t("modes.literature.linkedZoteroCollection")}
            >
              Zotero
            </span>
          ) : null}
          <span className="shrink-0 tabular-nums text-[length:var(--font-hint)] text-muted-foreground/60">
            {collection.paper_count ?? 0}
          </span>
        </div>
      </AppContextMenuTrigger>
      <AppContextMenuContent>
        <AppContextMenuItem onSelect={onExtractAll}>
          <FileTextIcon className="size-3.5" />
          Extract all in collection
        </AppContextMenuItem>
        {selectedCount > 0 ? (
          <AppContextMenuItem onSelect={onAddSelected}>
            <UserPlusIcon className="size-3.5" />
            Add {selectedCount} selected entr{selectedCount === 1 ? "y" : "ies"}
          </AppContextMenuItem>
        ) : null}
        {!isZoteroBound ? (
          <>
            <AppContextMenuItem onSelect={onNewSubcollection}>
              <FolderPlusIcon className="size-3.5" />
              New subcollection…
            </AppContextMenuItem>
            <AppContextMenuItem onSelect={onRename}>
              <PencilIcon className="size-3.5" />
              Rename
            </AppContextMenuItem>
            <AppContextMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2Icon className="size-3.5" />
              Delete collection
            </AppContextMenuItem>
          </>
        ) : null}
      </AppContextMenuContent>
    </AppContextMenu>
  );
}

export function LiteratureSidebar() {
  const tabs = useRightPanelStore((s) => s.tabs);
  const activeTabId = useRightPanelStore((s) => s.activeTabId);
  const papers = useLiteratureStore((s) => s.papers);

  const activeTab = tabs.find((tab) => tab.id === activeTabId);
  const readerPaper =
    activeTab?.kind === "literature" && activeTab.literaturePaperId
      ? (papers.find((p) => p.id === activeTab.literaturePaperId) ?? null)
      : null;

  if (readerPaper) {
    return <LiteraturePaperWorkspaceSidebar paper={readerPaper} />;
  }

  return <LiteratureLibrarySidebar />;
}

function LiteratureLibrarySidebar() {
  const { t } = useTranslation();
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const papers = useLiteratureStore((s) => s.papers);
  const collections = useLiteratureStore((s) => s.collections);
  const libraryView = useLiteratureStore((s) => s.libraryView);
  const checkedPaperIds = useLiteratureStore((s) => s.checkedPaperIds);
  const boundCollectionId = useLiteratureStore((s) => s.boundCollectionId);
  const lastZoteroSyncAt = useLiteratureStore((s) => s.lastZoteroSyncAt);
  const pullingFromZotero = useLiteratureStore((s) => s.pullingFromZotero);
  const collectionWritePending = useLiteratureStore((s) => s.collectionWritePending);
  const setLibraryView = useLiteratureStore((s) => s.setLibraryView);
  const loadViewPaperIds = useLiteratureStore((s) => s.loadViewPaperIds);
  const createCollection = useLiteratureStore((s) => s.createCollection);
  const renameCollection = useLiteratureStore((s) => s.renameCollection);
  const deleteCollection = useLiteratureStore((s) => s.deleteCollection);
  const addCheckedToCollection = useLiteratureStore((s) => s.addCheckedToCollection);
  const addPapersToCollection = useLiteratureStore((s) => s.addPapersToCollection);
  const removeCheckedFromCollection = useLiteratureStore((s) => s.removeCheckedFromCollection);
  const pullFromZotero = useLiteratureStore((s) => s.pullFromZotero);
  const enqueueCollection = useLiteratureExtractStore((s) => s.enqueueCollection);
  const settings = useSettingsStore((s) => s.settings);

  const handleExtractCollection = useCallback(
    async (collectionId: string) => {
      if (!projectRoot) return;
      const source =
        (settings.literatureExtractEngineDefault as PaperExtractSource | undefined) ?? "pdfjs";
      try {
        const result = await enqueueCollection(projectRoot, collectionId, source);
        const parts = [`Queued ${result.enqueued} paper${result.enqueued === 1 ? "" : "s"}`];
        if (result.skipped > 0) parts.push(`${result.skipped} skipped (no PDF/HTML)`);
        if (result.capped) parts.push(`capped at ${EXTRACT_BATCH_MAX_PAPERS}`);
        toast.message(parts.join(" · "));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Batch extract failed");
      }
    },
    [enqueueCollection, projectRoot, settings.literatureExtractEngineDefault],
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [createParentId, setCreateParentId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<LiteratureCollection | null>(null);
  const [renameName, setRenameName] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LiteratureCollection | null>(null);
  const [expandedCollectionIds, setExpandedCollectionIds] = useState<Set<string>>(new Set());

  const visibleCollections = useMemo(
    () => collections.filter((c) => shouldShowCollection(c, boundCollectionId)),
    [collections, boundCollectionId],
  );

  const collectionById = useMemo(
    () => new Map(visibleCollections.map((c) => [c.id, c])),
    [visibleCollections],
  );

  const childrenOf = useCallback(
    (parentId: string) => visibleCollections.filter((c) => c.parent_id === parentId),
    [visibleCollections],
  );

  const roots = useMemo(
    () => visibleCollections.filter((c) => !c.parent_id),
    [visibleCollections],
  );

  const flatRows = useMemo(
    () => flattenVisibleCollections(roots, childrenOf, expandedCollectionIds),
    [roots, childrenOf, expandedCollectionIds],
  );

  const activeCollectionId =
    libraryView.kind === "collection" ? libraryView.collectionId : null;

  useEffect(() => {
    if (!activeCollectionId) return;
    const chain = ancestorIds(activeCollectionId, collectionById);
    if (chain.length === 0) return;
    setExpandedCollectionIds((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const id of chain) {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [activeCollectionId, collectionById]);

  const toggleExpanded = useCallback((collectionId: string) => {
    setExpandedCollectionIds((prev) => {
      const next = new Set(prev);
      if (next.has(collectionId)) next.delete(collectionId);
      else next.add(collectionId);
      return next;
    });
  }, []);

  const selectView = useCallback(
    async (view: LiteratureLibraryView) => {
      if (!projectRoot) return;
      setLibraryView(view);
      await loadViewPaperIds(projectRoot);
    },
    [projectRoot, setLibraryView, loadViewPaperIds],
  );

  const activateCollection = useCallback(
    (collectionId: string, hasChildren: boolean) => {
      void selectView({ kind: "collection", collectionId });
      if (hasChildren) toggleExpanded(collectionId);
    },
    [selectView, toggleExpanded],
  );

  const openCreateDialog = (parentId: string | null) => {
    setCreateParentId(parentId);
    setNewName("");
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    if (!projectRoot || !newName.trim()) return;
    try {
      await createCollection(projectRoot, newName.trim(), createParentId);
      if (createParentId) {
        setExpandedCollectionIds((prev) => new Set(prev).add(createParentId));
      }
      setCreateOpen(false);
      setNewName("");
      setCreateParentId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create collection");
    }
  };

  const handleRename = async () => {
    if (!projectRoot || !renameTarget || !renameName.trim()) return;
    try {
      await renameCollection(projectRoot, renameTarget.id, renameName.trim());
      setRenameOpen(false);
      setRenameTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Rename failed");
    }
  };

  const handleDelete = async () => {
    if (!projectRoot || !deleteTarget) return;
    try {
      await deleteCollection(projectRoot, deleteTarget.id);
      setDeleteOpen(false);
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const createParentLabel =
    createParentId != null ? collectionById.get(createParentId)?.name : null;

  return (
    <>
      <SidebarHeader className="flex h-[var(--height-mode-selector)] shrink-0 flex-row items-center justify-between px-3">
        <span className="truncate text-[length:var(--font-size-12)] font-medium text-muted-foreground">
          {t("modes.literature.initialTitle")}
        </span>
        <div className="flex items-center gap-0.5 shrink-0">
          {boundCollectionId ? (
            <Hint
              label={
                lastZoteroSyncAt
                  ? t("modes.literature.refreshZoteroLastSync", {
                      time: new Date(lastZoteroSyncAt).toLocaleString(),
                    })
                  : t("modes.literature.refreshZotero")
              }
            >
              <button
                type="button"
                className={headerBtn}
                disabled={!projectRoot || pullingFromZotero}
                onClick={() => {
                  if (!projectRoot) return;
                  void pullFromZotero(projectRoot);
                }}
              >
                {pullingFromZotero ? (
                  <Loader2Icon className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCwIcon className="size-3.5" />
                )}
              </button>
            </Hint>
          ) : null}
          <Hint label={t("modes.literature.newCollection")}>
            <button
              type="button"
              className={headerBtn}
              disabled={!projectRoot || collectionWritePending}
              onClick={() =>
                openCreateDialog(resolveLocalParentId(libraryView, visibleCollections, boundCollectionId))
              }
            >
              <FolderPlusIcon className="size-3.5" />
            </button>
          </Hint>
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-0 overflow-auto px-1.5 py-1">
        <div
          className={cn(ROW_BASE, "cursor-pointer", libraryView.kind === "all" && ROW_SELECTED)}
          style={{ paddingLeft: INDENT(0) }}
          onClick={() => void selectView({ kind: "all" })}
        >
          <ChevronRightIcon className="size-3 shrink-0 invisible" aria-hidden />
          <LibraryIcon className="size-3 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{t("modes.literature.allEntries")}</span>
          <span className="shrink-0 tabular-nums text-[length:var(--font-hint)] text-muted-foreground/60">
            {papers.length}
          </span>
        </div>

        <p className="px-2 py-1 text-[length:var(--font-hint)] font-medium uppercase tracking-wide text-muted-foreground/55">
          {t("modes.literature.collections")}
        </p>

        {flatRows.length === 0 ? (
          <p className="px-2 py-2 text-[length:var(--font-hint)] text-muted-foreground/60">
            Create local collections to organize your library.
          </p>
        ) : (
          flatRows.map(({ collection, depth, hasChildren, isExpanded }) => (
            <CollectionRow
              key={collection.id}
              collection={collection}
              depth={depth}
              hasChildren={hasChildren}
              isExpanded={isExpanded}
              active={
                libraryView.kind === "collection" && libraryView.collectionId === collection.id
              }
              isZoteroBound={isBoundZoteroCollection(collection, boundCollectionId)}
              writePending={collectionWritePending}
              selectedCount={checkedPaperIds.length}
              onActivate={() => activateCollection(collection.id, hasChildren)}
              onRename={() => {
                setRenameTarget(collection);
                setRenameName(collection.name);
                setRenameOpen(true);
              }}
              onDelete={() => {
                setDeleteTarget(collection);
                setDeleteOpen(true);
              }}
              onAddSelected={() => {
                if (!projectRoot || checkedPaperIds.length === 0) return;
                void addPapersToCollection(projectRoot, collection.id, checkedPaperIds);
              }}
              onNewSubcollection={() => openCreateDialog(collection.id)}
              onExtractAll={() => void handleExtractCollection(collection.id)}
            />
          ))
        )}

        {activeCollectionId ? (
          <div className="mt-2 space-y-1 border-t border-border/60 pt-2 px-1">
            <Button
              size="xs"
              variant="secondary"
              className="w-full h-7"
              onClick={() => void handleExtractCollection(activeCollectionId)}
            >
              <FileTextIcon className="size-3 mr-1" />
              Extract all in collection
            </Button>
            {checkedPaperIds.length > 0 ? (
              <>
            <Button
              size="xs"
              variant="secondary"
              className="w-full h-7"
              disabled={collectionWritePending}
              onClick={() => void addCheckedToCollection(projectRoot!, activeCollectionId)}
            >
              Add {checkedPaperIds.length} selected
            </Button>
            <Button
              size="xs"
              variant="ghost"
              className="w-full h-7"
              disabled={collectionWritePending}
              onClick={() => void removeCheckedFromCollection(projectRoot!, activeCollectionId)}
            >
              Remove from collection
            </Button>
              </>
            ) : null}
          </div>
        ) : null}

        <LiteratureOrphanNotesSection />
      </SidebarContent>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("literature.dialogs.newCollection")}</DialogTitle>
          </DialogHeader>
          {createParentLabel ? (
            <p className="text-[length:var(--font-size-12)] text-muted-foreground">
              {t("literature.dialogs.insideParent", { name: createParentLabel })}
            </p>
          ) : null}
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t("literature.dialogs.collectionName")}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleCreate();
            }}
          />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button size="sm" onClick={() => void handleCreate()} disabled={!newName.trim()}>
              {t("common.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("literature.dialogs.renameCollection")}</DialogTitle>
          </DialogHeader>
          <Input
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleRename();
            }}
          />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRenameOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button size="sm" onClick={() => void handleRename()} disabled={!renameName.trim()}>
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("literature.dialogs.deleteCollection")}</DialogTitle>
          </DialogHeader>
          <p className="text-[length:var(--font-size-13)] text-muted-foreground">
            {t("literature.dialogs.deleteCollectionBody", { name: deleteTarget?.name ?? "" })}
          </p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" size="sm" onClick={() => void handleDelete()}>
              {t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
