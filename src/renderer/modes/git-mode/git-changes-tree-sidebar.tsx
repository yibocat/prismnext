import { useCallback, useEffect, useMemo } from "react";
import {
  ChevronRightIcon,
  FolderIcon,
  FolderOpenIcon,
} from "lucide-react";
import { Icon } from "@iconify/react";
import { useGitStore, type GitFileItem } from "@/stores/git-store";
import { cn } from "@/lib/utils";
import { getFileIconName } from "@/lib/files/file-icon-class";
import {
  collectGitChangeFolderPaths,
  flattenGitChangesTree,
  preserveGitChangesScroll,
} from "./git-changes-tree";
import {
  gitChangeStatusTextClass,
  resolveGitChangeStatusBadge,
} from "./git-change-status";

const INDENT = (depth: number) => 8 + depth * 16;

interface GitChangesTreeSidebarProps {
  files: GitFileItem[];
}

export function GitChangesTreeSidebar({ files }: GitChangesTreeSidebarProps) {
  const gitExpandedFolders = useGitStore((s) => s.gitExpandedFolders);
  const toggleGitFolder = useGitStore((s) => s.toggleGitFolder);

  const expandedSet = useMemo(
    () => new Set(gitExpandedFolders),
    [gitExpandedFolders],
  );

  const fileById = useMemo(
    () => new Map(files.map((f) => [f.id, f])),
    [files],
  );

  const flatRows = useMemo(
    () => flattenGitChangesTree(files, expandedSet),
    [files, expandedSet],
  );

  useEffect(() => {
    if (files.length === 0) return;
    const folders = collectGitChangeFolderPaths(files);
    const current = useGitStore.getState().gitExpandedFolders;
    if (current.length === 0 && folders.length > 0) {
      useGitStore.setState({ gitExpandedFolders: folders });
    }
  }, [files]);

  const handleFileClick = useCallback((fileId: string) => {
    preserveGitChangesScroll(() => {
      useGitStore.getState().selectChangeFromSidebar(fileId);
    });
  }, []);

  if (files.length === 0) {
    return (
      <div className="px-3 py-3 text-center">
        <p className="text-[length:var(--font-hint)] text-muted-foreground/60">
          No changes — working tree clean
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-0.5 px-1 mb-2">
      {flatRows.map((row) => {
        if (row.type === "folder") {
          const isOpen = expandedSet.has(row.key);
          return (
            <button
              key={row.key}
              type="button"
              onClick={() => toggleGitFolder(row.key)}
              className="flex h-6 w-full items-center gap-1 rounded-sm px-1 text-[length:var(--font-size-12)] text-muted-foreground hover:bg-accent/50 transition-colors"
              style={{ paddingLeft: INDENT(row.depth) }}
            >
              <ChevronRightIcon
                className={cn(
                  "size-3 shrink-0 transition-transform",
                  isOpen && "rotate-90",
                )}
              />
              {isOpen ? (
                <FolderOpenIcon className="size-3.5 shrink-0 opacity-70" />
              ) : (
                <FolderIcon className="size-3.5 shrink-0 opacity-70" />
              )}
              <span className="truncate">{row.name}</span>
            </button>
          );
        }

        const file = row.gitFileId ? fileById.get(row.gitFileId) : undefined;
        if (!file) return null;

        return (
          <GitChangeTreeLeaf
            key={row.key}
            file={file}
            depth={row.depth}
            onSelect={() => handleFileClick(file.id)}
          />
        );
      })}
    </div>
  );
}

function GitChangeTreeLeaf({
  file,
  depth,
  onSelect,
}: {
  file: GitFileItem;
  depth: number;
  onSelect: () => void;
}) {
  const fileName = file.path.split("/").pop() || file.path;
  const iconName = getFileIconName(fileName);
  const badge = resolveGitChangeStatusBadge(file);

  return (
    <div
      className="flex items-center gap-1 h-6 rounded-sm cursor-pointer transition-colors hover:bg-accent/50"
      style={{ paddingLeft: INDENT(depth) }}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <Icon icon={iconName} className="size-3.5 shrink-0 opacity-80" />

      <span
        className={cn(
          "truncate flex-1 text-[length:var(--font-size-12)]",
          gitChangeStatusTextClass(badge.tone),
        )}
      >
        {fileName}
      </span>

      <span
        className={cn(
          "text-[length:var(--font-size-10)] font-medium tabular-nums shrink-0 pr-1",
          gitChangeStatusTextClass(badge.tone),
        )}
      >
        {badge.letter}
      </span>
    </div>
  );
}
