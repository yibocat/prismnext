import { useRef } from "react";
import { useLayoutStore } from "@/stores/layout-store";
import { useDocumentStore } from "@/stores/document-store";
import { useProjectStore } from "@/stores/project-store";
import { useProjectOpen } from "@/hooks/use-project-open";
import {
  AppMenu,
  AppMenuContent,
  AppMenuItem,
  AppMenuSeparator,
  AppMenuTrigger,
  appMenuFontClass,
} from "@/components/ui/app-menu";
import { NewProjectDialog } from "@/components/modules/project/new-project-dialog";
import { FolderOpenIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProjectSwitcherProps {
  className?: string;
}

const sidebarItemClass =
  "focus:bg-sidebar-accent focus:text-sidebar-accent-foreground";

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
      <AppMenu>
        <AppMenuTrigger asChild>
          <button type="button" className={className}>
            <FolderOpenIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate flex-1 text-left">{projectName}</span>
          </button>
        </AppMenuTrigger>
        <AppMenuContent
          align="start"
          sideOffset={2}
          alignOffset={-1}
          collisionPadding={8}
          className="min-w-[var(--radix-dropdown-menu-trigger-width)] max-w-[min(20rem,var(--radix-dropdown-menu-content-available-width))]"
        >
          {recentProjects.length > 0 ? (
            recentProjects.map((p) => (
              <AppMenuItem
                key={p.path}
                className={sidebarItemClass}
                leading={<FolderOpenIcon className="size-3.5 shrink-0 text-muted-foreground" />}
                description={p.path}
                onClick={() => handleOpenProjectPath(p.path)}
              >
                {p.name}
              </AppMenuItem>
            ))
          ) : (
            <div
              className={cn(
                "px-2 py-3 text-muted-foreground text-center",
                appMenuFontClass,
              )}
            >
              No recent projects
            </div>
          )}
          <AppMenuSeparator />
          <AppMenuItem
            className={sidebarItemClass}
            onClick={() => newProjectTriggerRef.current?.click()}
          >
            New Project...
          </AppMenuItem>
          <AppMenuItem className={sidebarItemClass} onClick={handleOpenProjectDialog}>
            Open Project...
          </AppMenuItem>
          <AppMenuSeparator />
          <AppMenuItem className={sidebarItemClass} onClick={handleCloseProject}>
            Close Project
          </AppMenuItem>
        </AppMenuContent>
      </AppMenu>

      <NewProjectDialog>
        <button ref={newProjectTriggerRef} className="hidden" />
      </NewProjectDialog>
    </>
  );
}
