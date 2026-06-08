import { useState, useCallback, useRef, memo } from "react";
import {
  FolderIcon,
  FolderOpenIcon,
  ChevronRightIcon,
  FileTextIcon,
  FolderPlusIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getFileIcon } from "@/lib/file-tree";
import { getFileIconName } from "@/lib/file-icon-class";
import { Icon } from "@iconify/react";
import { useDocumentStore } from "@/stores/document-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import type { FlatVisibleNode } from "@/lib/file-tree";

// ─── Callbacks interface ───

export interface VirtTreeCallbacks {
  onNewFile: (folderPath: string) => void;
  onNewFolder: (parentPath: string) => void;
  onRenameFile: (fileId: string, name: string) => void;
  onDeleteFile: (fileId: string) => void;
  onDeleteFolder: (folderPath: string) => void;
  onRenameFolder: (folderPath: string, name: string) => void;
}

// ─── Git status type (subset used by FileVirtRow) ───

export interface GitStatusInfo {
  isDeleted: boolean;
  isStagedOnly: boolean;
  isUnstaged: boolean;
  isUntracked: boolean;
}

// ─── Shared row base style ───

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
}: {
  item: FlatVisibleNode;
  depth: number;
  isExpanded: boolean;
  isSelected: boolean;
  onToggle: () => void;
  callbacks: VirtTreeCallbacks;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
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
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => callbacks.onNewFile(item.key)}>
          <FileTextIcon className="mr-2 size-4" />
          New File Here
        </ContextMenuItem>
        <ContextMenuItem onClick={() => callbacks.onNewFolder(item.key)}>
          <FolderPlusIcon className="mr-2 size-4" />
          New Folder
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => callbacks.onRenameFolder(item.key, item.name)}>
          <PencilIcon className="mr-2 size-4" />
          Rename
        </ContextMenuItem>
        <ContextMenuItem onClick={() => callbacks.onDeleteFolder(item.key)}>
          <Trash2Icon className="mr-2 size-4" />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});

// ─── File Virt Row ───

export const FileVirtRow = memo(function FileVirtRow({
  item,
  depth,
  isActive,
  isDirty,
  gitStatus,
  onSelect,
  callbacks,
}: {
  item: FlatVisibleNode;
  depth: number;
  isActive: boolean;
  isDirty: boolean;
  gitStatus?: GitStatusInfo;
  onSelect: () => void;
  callbacks: VirtTreeCallbacks;
}) {
  const gitFileNameStyle: React.CSSProperties | undefined = gitStatus?.isDeleted
    ? { color: "var(--destructive)", textDecoration: "line-through" }
    : gitStatus?.isStagedOnly
      ? { color: "var(--success)" }
      : gitStatus?.isUnstaged || gitStatus?.isUntracked
        ? { color: "var(--warning)" }
        : undefined;

  const gitTitle = gitStatus
    ? gitStatus.isStagedOnly
      ? "Staged"
      : gitStatus.isUnstaged
        ? "Modified"
        : gitStatus.isUntracked
          ? "Untracked"
          : gitStatus.isDeleted
            ? "Deleted"
            : ""
    : undefined;

  const file = item.node.file!;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            ROW_BASE,
            "cursor-pointer",
            isActive && "bg-sidebar-accent text-sidebar-accent-foreground",
          )}
          style={{ paddingLeft: INDENT(depth) }}
          onClick={onSelect}
        >
          {getFileIcon(file)}
          <span className="truncate" style={gitFileNameStyle} title={gitTitle}>
            {item.name}
          </span>
          {isDirty && (
            <span className="ml-auto size-2 shrink-0 rounded-full bg-info" title="Unsaved changes" />
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => callbacks.onRenameFile(file.id, file.name)}>
          <PencilIcon className="mr-2 size-4" />
          Rename
        </ContextMenuItem>
        <ContextMenuItem onClick={() => callbacks.onDeleteFile(file.id)}>
          <Trash2Icon className="mr-2 size-4" />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
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
