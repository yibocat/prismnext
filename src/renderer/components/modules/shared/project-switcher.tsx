import { useRef } from "react";
import { useLayoutStore } from "@/stores/layout-store";
import { useDocumentStore } from "@/stores/document-store";
import { useProjectStore } from "@/stores/project-store";
import { useProjectOpen } from "@/hooks/use-project-open";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NewProjectDialog } from "@/components/modules/project/new-project-dialog";
import {
  FolderOpenIcon,
  FolderPlusIcon,
  FolderIcon,
  LogOutIcon,
} from "lucide-react";

interface ProjectSwitcherProps {
  className?: string;
}

export function ProjectSwitcher({ className }: ProjectSwitcherProps) {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const openProject = useDocumentStore((s) => s.openProject);
  const recentProjects = useProjectStore((s) => s.recentProjects);
  const addRecentProject = useProjectStore((s) => s.addRecentProject);
  const setLeftSidebarOverlay = useLayoutStore((s) => s.setLeftSidebarOverlay);
  const projectOpen = useProjectOpen();

  const projectName = projectRoot
    ? projectRoot.split(/[/\\]/).pop() || projectRoot
    : "No Project Open";

  const newProjectTriggerRef = useRef<HTMLButtonElement>(null);

  const handleOpenProjectPath = async (path: string) => {
    const ok = await projectOpen(path);
    if (!ok) return;
    addRecentProject(path);
    await openProject(path);
    setLeftSidebarOverlay(false);
  };

  const handleOpenProjectDialog = async () => {
    const result = await window.electronAPI.dialogOpenFolder();
    if (result.canceled || !result.path) return;
    await handleOpenProjectPath(result.path);
  };

  const handleCloseProject = () => {
    useDocumentStore.getState().closeProject();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={className}
          >
            <FolderOpenIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate flex-1 text-left">{projectName}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-[var(--radix-dropdown-menu-trigger-width)]"
        >
          {recentProjects.length > 0 ? (
            recentProjects.map((p) => (
              <DropdownMenuItem
                key={p.path}
                className="flex items-center gap-2 text-[length:var(--font-menu-item)] focus:bg-sidebar-accent focus:text-sidebar-accent-foreground"
                onClick={() => handleOpenProjectPath(p.path)}
              >
                <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate">{p.name}</span>
                <span className="shrink-0 text-[length:var(--font-path)] text-muted-foreground/60 truncate max-w-[100px]">{p.path}</span>
              </DropdownMenuItem>
            ))
          ) : (
            <div className="px-2 py-3 text-[length:var(--font-empty-state)] text-muted-foreground text-center">
              No recent projects
            </div>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="flex items-center gap-2 text-[length:var(--font-menu-item)] focus:bg-sidebar-accent focus:text-sidebar-accent-foreground"
            onClick={() => newProjectTriggerRef.current?.click()}
          >
            <FolderPlusIcon className="size-3.5 shrink-0" />
            New Project...
          </DropdownMenuItem>
          <DropdownMenuItem
            className="flex items-center gap-2 text-[length:var(--font-menu-item)] focus:bg-sidebar-accent focus:text-sidebar-accent-foreground"
            onClick={handleOpenProjectDialog}
          >
            <FolderOpenIcon className="size-3.5 shrink-0" />
            Open Project...
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="flex items-center gap-2 text-[length:var(--font-menu-item)] focus:bg-sidebar-accent focus:text-sidebar-accent-foreground"
            onClick={handleCloseProject}
          >
            <LogOutIcon className="size-3.5 shrink-0" />
            Close Project
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <NewProjectDialog>
        <button ref={newProjectTriggerRef} className="hidden" />
      </NewProjectDialog>
    </>
  );
}
