import { useState, useCallback, useRef, memo } from "react";
import {
  FolderIcon,
  FolderOpenIcon,
  ChevronRightIcon,
} from "lucide-react";
import {
  AppContextMenu,
  AppContextMenuContent,
  AppContextMenuDestructiveItem,
  AppContextMenuItem,
  AppContextMenuSeparator,
  AppContextMenuTrigger,
} from "@/components/ui/app-context-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getFileIcon } from "@/lib/files/file-tree";
import { getFileIconName } from "@/lib/files/file-icon-class";
import { Icon } from "@iconify/react";
import { useDocumentStore } from "@/stores/document-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import type { FlatVisibleNode } from "@/lib/files/file-tree";
import type { FolderFunction } from "@/types/workspace";
import { WorkspaceFolderIcon } from "@/lib/workspace/workspace-folder-icon";

// ─── Callbacks interface ───

export interface VirtTreeCallbacks {
  onNewFile: (folderPath: string) => void;
  onNewFolder: (parentPath: string) => void;
  onRenameFile: (fileId: string, name: string) => void;
  onDeleteFile: (fileId: string) => void;
  onDeleteFolder: (folderPath: string) => void;
  onRenameFolder: (folderPath: string, name: string) => void;
  onRevealInFinder: (absPath: string) => void;
  onCopyPath: (text: string) => void;
  onCopyRelativePath: (relativePath: string) => void;
}

import type { GitChangeStatusBadge } from "@/modes/git-mode/git-change-status";
import {
  gitChangeStatusTextClass,
} from "@/modes/git-mode/git-change-status";

const ROW_BASE = "flex h-6 items-center gap-2 rounded-sm px-2 text-[length:var(--font-size-12)] text-muted-foreground";
const ROW_SELECTED = "bg-sidebar-accent text-sidebar-accent-foreground";
const INDENT = (depth: number) => 8 + depth * 16;

// ─── Folder Virt Row ───

export const FolderVirtRow = memo(function FolderVirtRow({
  item,
  depth,
  isExpanded,
  isSelected,
  onToggle,
  callbacks,
  workspaceFunction,
  folderIconName,
  folderBadgeTitle,
}: {
  item: FlatVisibleNode;
  depth: number;
  isExpanded: boolean;
  isSelected: boolean;
  onToggle: () => void;
  callbacks: VirtTreeCallbacks;
  workspaceFunction?: FolderFunction | null;
  folderIconName?: string | null;
  folderBadgeTitle?: string;
}) {
  const showBadge = Boolean(folderIconName);

  return (
    <AppContextMenu>
      <AppContextMenuTrigger asChild>
        <div
          className={cn(ROW_BASE, "cursor-pointer", isSelected && ROW_SELECTED)}
          style={{ paddingLeft: INDENT(depth) }}
          onClick={onToggle}
        >
          <ChevronRightIcon
            className={cn(
              "size-3 shrink-0 text-muted-foreground transition-transform",
              isExpanded && "rotate-90",
            )}
          />
          {isExpanded ? (
            <FolderOpenIcon className="size-3 shrink-0" />
          ) : (
            <FolderIcon className="size-3 shrink-0" />
          )}
          <span className="truncate">{item.name}</span>
          {showBadge && folderIconName ? (
            <WorkspaceFolderIcon
              name={folderIconName}
              className="ml-auto size-2.5 opacity-60"
              title={folderBadgeTitle ?? workspaceFunction ?? undefined}
            />
          ) : null}
        </div>
      </AppContextMenuTrigger>
      <AppContextMenuContent>
        <AppContextMenuItem onClick={() => callbacks.onNewFile(item.key)}>
          New File Here
        </AppContextMenuItem>
        <AppContextMenuItem onClick={() => callbacks.onNewFolder(item.key)}>
          New Folder
        </AppContextMenuItem>
        <AppContextMenuSeparator />
        <AppContextMenuItem onClick={() => callbacks.onRevealInFinder(item.key)}>
          Reveal in Finder
        </AppContextMenuItem>
        <AppContextMenuItem onClick={() => callbacks.onCopyRelativePath(item.key)}>
          Copy Relative Path
        </AppContextMenuItem>
        <AppContextMenuSeparator />
        <AppContextMenuItem onClick={() => callbacks.onRenameFolder(item.key, item.name)}>
          Rename
        </AppContextMenuItem>
        <AppContextMenuDestructiveItem onClick={() => callbacks.onDeleteFolder(item.key)}>
          Delete
        </AppContextMenuDestructiveItem>
      </AppContextMenuContent>
    </AppContextMenu>
  );
});

// ─── File Virt Row ───

export const FileVirtRow = memo(function FileVirtRow({
  item,
  depth,
  isActive,
  isDirty,
  gitBadge,
  onSelect,
  onOpenPinned,
  callbacks,
}: {
  item: FlatVisibleNode;
  depth: number;
  isActive: boolean;
  isDirty: boolean;
  gitBadge?: GitChangeStatusBadge;
  onSelect: () => void;
  onOpenPinned?: () => void;
  callbacks: VirtTreeCallbacks;
}) {
  const file = item.node.file!;

  return (
    <AppContextMenu>
      <AppContextMenuTrigger asChild>
        <div
          className={cn(
            ROW_BASE,
            "cursor-pointer",
            isActive && "bg-sidebar-accent text-sidebar-accent-foreground",
          )}
          style={{ paddingLeft: INDENT(depth) }}
          onClick={onSelect}
          onDoubleClick={(e) => {
            e.preventDefault();
            onOpenPinned?.();
          }}
        >
          {getFileIcon(file)}
          <span
            className={cn(
              "truncate flex-1",
              gitBadge && gitChangeStatusTextClass(gitBadge.tone),
              gitBadge?.tone === "deleted" && "line-through",
            )}
          >
            {item.name}
          </span>
          {isDirty && (
            <span className="size-2 shrink-0 rounded-full bg-info" title="Unsaved changes" />
          )}
          {gitBadge && (
            <span
              className={cn(
                "text-[length:var(--font-size-10)] font-medium tabular-nums shrink-0 pr-0.5",
                gitChangeStatusTextClass(gitBadge.tone),
              )}
            >
              {gitBadge.letter}
            </span>
          )}
        </div>
      </AppContextMenuTrigger>
      <AppContextMenuContent>
        <AppContextMenuItem onClick={() => callbacks.onRevealInFinder(file.absolutePath)}>
          Reveal in Finder
        </AppContextMenuItem>
        <AppContextMenuItem onClick={() => callbacks.onCopyPath(file.absolutePath)}>
          Copy Path
        </AppContextMenuItem>
        <AppContextMenuItem onClick={() => callbacks.onCopyRelativePath(file.relativePath)}>
          Copy Relative Path
        </AppContextMenuItem>
        <AppContextMenuSeparator />
        <AppContextMenuItem onClick={() => callbacks.onRenameFile(file.id, file.name)}>
          Rename
        </AppContextMenuItem>
        <AppContextMenuDestructiveItem onClick={() => callbacks.onDeleteFile(file.id)}>
          Delete
        </AppContextMenuDestructiveItem>
      </AppContextMenuContent>
    </AppContextMenu>
  );
});

// ─── Inline Edit Row ───

export const InlineEditRow = memo(function InlineEditRow({
  type,
  depth,
  parentPath,
  onCreated,
  onCancel,
}: {
  type: "file" | "folder";
  depth: number;
  parentPath?: string;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const committingRef = useRef(false);

  const createNewFile = useDocumentStore((s) => s.createNewFile);
  const createFolder = useDocumentStore((s) => s.createFolder);

  const commit = useCallback(async () => {
    if (committingRef.current) return;
    const trimmed = name.trim();
    if (!trimmed) { onCancel(); return; }
    committingRef.current = true;
    try {
      if (type === "file") {
        await createNewFile(trimmed, undefined, parentPath);
        const relativePath = parentPath ? `${parentPath}/${trimmed}` : trimmed;
        useDocumentStore.getState().setActiveFile(relativePath);
        useRightPanelStore.getState().openFile(relativePath, relativePath, trimmed);
      } else {
        await createFolder(trimmed, parentPath);
      }
    } catch { /* error handled in store */ }
    committingRef.current = false;
    onCreated();
  }, [name, type, parentPath, createNewFile, createFolder, onCreated, onCancel]);

  const iconName = type === "file" ? getFileIconName(name || "file") : null;

  return (
    <div
      className="flex h-6 items-center gap-2 rounded-sm px-2 text-[length:var(--font-size-12)]"
      style={{ paddingLeft: INDENT(depth) }}
    >
      {type === "file" && iconName ? (
        <Icon icon={iconName} className="size-3.5 shrink-0" />
      ) : (
        <FolderIcon className="size-3 shrink-0 text-muted-foreground" />
      )}
      <Input
        autoFocus
        value={name}
        placeholder={type === "file" ? "filename.ext" : "folder name"}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") onCancel();
        }}
        onBlur={commit}
        className="h-5 flex-1 min-w-0 rounded-none border-0 !bg-transparent p-0 text-[length:var(--font-size-12)] text-muted-foreground outline-none placeholder:text-muted-foreground/40 focus-visible:ring-0 focus-visible:ring-offset-0"
      />
    </div>
  );
});
