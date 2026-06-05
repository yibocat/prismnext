import { useMemo, useCallback, useEffect, useState } from "react";
import {
  FolderIcon,
  FolderGit2Icon,
  RefreshCwIcon,
  GitBranchIcon,
} from "lucide-react";
import { useGitStore } from "@/stores/git-store";
import { useDocumentStore } from "@/stores/document-store";
import {
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";

// ─── Main Component ───

export function GitSidebar() {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const folders = useDocumentStore((s) => s.folders);

  const isGitRepo = useGitStore((s) => s.isGitRepo);
  const unitRoot = useGitStore((s) => s.unitRoot);
  const refreshStatus = useGitStore((s) => s.refreshStatus);
  const refreshBranches = useGitStore((s) => s.refreshBranches);
  const gitFolderVersion = useGitStore((s) => s.gitFolderVersion);

  // Per-folder git status
  const [gitFolders, setGitFolders] = useState<Set<string>>(new Set());

  // Top-level folders only
  const topFolders = useMemo(
    () => folders.filter((f) => !f.includes("/")).sort(),
    [folders],
  );

  // Check which folders have .git
  useEffect(() => {
    if (!projectRoot) return;
    let cancelled = false;

    async function check() {
      const results = new Set<string>();
      for (const folder of topFolders) {
        const gitDir = `${projectRoot}/${folder}/.git`;
        try {
          const exists = await window.electronAPI.fsExists(gitDir);
          if (!cancelled) {
            if (exists) results.add(folder);
          }
        } catch {
          // ignore
        }
        if (cancelled) return;
      }
      if (!cancelled) setGitFolders(results);
    }

    check();
    return () => { cancelled = true; };
  }, [projectRoot, topFolders, gitFolderVersion]);

  const handleSelectUnit = useCallback(
    (folderPath: string) => {
      if (!projectRoot) return;
      useGitStore.getState().selectUnit(`${projectRoot}/${folderPath}`);
    },
    [projectRoot],
  );

  const handleRefresh = useCallback(async () => {
    const root = unitRoot ?? projectRoot;
    if (!root) return;
    await refreshStatus(root);
    await refreshBranches(root);
  }, [unitRoot, projectRoot, refreshStatus, refreshBranches]);

  return (
    <>
      {/* ── Header ── */}
      <SidebarHeader className="flex h-[var(--height-mode-selector)] shrink-0 flex-row items-center justify-between px-3">
        <span className="truncate text-[length:var(--font-size-12)] font-medium text-muted-foreground">
          Git
        </span>
        <button
          type="button"
          onClick={handleRefresh}
          className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          title="Refresh"
        >
          <RefreshCwIcon className="size-3.5" />
        </button>
      </SidebarHeader>

      {/* ── Body ── */}
      <SidebarContent className="px-1.5 py-1">
        <SidebarMenu className="gap-0.5">
          {topFolders.map((folder) => {
            const absPath = projectRoot ? `${projectRoot}/${folder}` : folder;
            const isCurrent = unitRoot === absPath;
            const hasGit = gitFolders.has(folder);

            return (
              <SidebarMenuItem key={folder}>
                <SidebarMenuButton
                  size="sm"
                  isActive={isCurrent}
                  onClick={() => handleSelectUnit(folder)}
                  className="[&>svg]:!size-3 h-6 py-0.5 text-[length:var(--font-size-12)] rounded-sm text-muted-foreground w-full justify-start gap-2 pl-2"
                >
                  {hasGit ? (
                    <FolderGit2Icon className="shrink-0" />
                  ) : (
                    <FolderIcon className="shrink-0" />
                  )}
                  <span className="truncate flex-1">{folder}</span>
                  {hasGit && (
                    <GitBranchIcon className="size-3 shrink-0 opacity-40" />
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>
    </>
  );
}
