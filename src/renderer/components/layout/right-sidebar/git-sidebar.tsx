import { useCallback, useEffect } from "react";
import {
  FolderGit2Icon,
  RefreshCwIcon,
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

export function GitSidebar() {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const unitRoot = useGitStore((s) => s.unitRoot);
  const isGitRepo = useGitStore((s) => s.isGitRepo);
  const checkingRepo = useGitStore((s) => s.checkingRepo);
  const branch = useGitStore((s) => s.branch);
  const refreshStatus = useGitStore((s) => s.refreshStatus);
  const refreshBranches = useGitStore((s) => s.refreshBranches);
  const selectUnit = useGitStore((s) => s.selectUnit);

  // Auto-select the git root on mount
  useEffect(() => {
    if (!projectRoot) return;
    selectUnit(projectRoot);
  }, [projectRoot, selectUnit]);

  const handleRefresh = useCallback(async () => {
    if (!unitRoot) return;
    await refreshStatus(unitRoot);
    await refreshBranches(unitRoot);
  }, [unitRoot, refreshStatus, refreshBranches]);

  const displayName = projectRoot?.split("/").pop() || "project";
  const displayBranch = branch;

  return (
    <>
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

      <SidebarContent className="px-1.5 py-1">
        {checkingRepo ? (
          <div className="px-2 py-4 text-[length:var(--font-size-12)] text-muted-foreground text-center">
            Checking git...
          </div>
        ) : !isGitRepo ? (
          <div className="px-2 py-4 text-[length:var(--font-size-12)] text-muted-foreground text-center">
            No git repository
          </div>
        ) : (
          <SidebarMenu className="gap-0.5">
            <SidebarMenuItem>
              <SidebarMenuButton
                size="sm"
                isActive
                className="[&>svg]:!size-3 h-6 py-0.5 text-[length:var(--font-size-12)] rounded-sm text-muted-foreground w-full justify-start gap-2 pl-2"
              >
                <FolderGit2Icon className="shrink-0" />
                <span className="truncate flex-1">{displayName}</span>
                <span className="text-[length:var(--font-hint)] text-muted-foreground/50 shrink-0">
                  {displayBranch}
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        )}
      </SidebarContent>
    </>
  );
}
