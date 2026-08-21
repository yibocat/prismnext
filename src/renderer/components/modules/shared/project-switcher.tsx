import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLayoutStore } from "@/stores/layout-store";
import { useDocumentStore } from "@/stores/document-store";
import { useProjectStore } from "@/stores/project-store";
import { sameProjectPath, useWorkbenchStore } from "@/stores/workbench-store";
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
import {
  loadProjectIcon,
  ProjectIconBadge,
} from "@/components/modules/project/project-icon";
import type { IconSpec } from "@shared/icon-spec";
import { FolderOpenIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProjectSwitcherProps {
  className?: string;
}

const sidebarItemClass =
  "focus:bg-sidebar-accent focus:text-sidebar-accent-foreground";

export function ProjectSwitcher({ className }: ProjectSwitcherProps) {
  const { t } = useTranslation();
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const openProject = useDocumentStore((s) => s.openProject);
  const defaultLastPath = useWorkbenchStore((s) => s.defaultLastPath);
  const defaultProjectId = useWorkbenchStore((s) => s.defaultProjectId);
  const members = useWorkbenchStore((s) => s.members);
  const onDefaultProject = sameProjectPath(projectRoot, defaultLastPath);
  const focusedMember = members.find((member) => sameProjectPath(member.lastPath, projectRoot));
  const recentProjects = useProjectStore((s) => s.recentProjects);
  const addRecentProject = useProjectStore((s) => s.addRecentProject);
  const setLeftSidebarOverlay = useLayoutStore((s) => s.setLeftSidebarOverlay);
  const projectOpen = useProjectOpen();

  const [currentIcon, setCurrentIcon] = useState<IconSpec | null>(null);
  const [recentIcons, setRecentIcons] = useState<Record<string, IconSpec | null>>({});

  const projectName = projectRoot
    ? projectRoot.split(/[/\\]/).pop() || projectRoot
    : t("nav.project.noProject");

  const newProjectTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    if (!projectRoot) {
      setCurrentIcon(null);
      return;
    }
    void loadProjectIcon(projectRoot).then((icon) => {
      if (!cancelled) setCurrentIcon(icon);
    });
    return () => {
      cancelled = true;
    };
  }, [projectRoot]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const entries = await Promise.all(
        recentProjects.map(async (p) => {
          const icon = await loadProjectIcon(p.path);
          return [p.path, icon] as const;
        }),
      );
      if (cancelled) return;
      setRecentIcons(Object.fromEntries(entries));
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [recentProjects]);

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

  const handleRemoveFromWorkbench = async () => {
    if (!focusedMember || focusedMember.id === defaultProjectId) return;
    const next = await useWorkbenchStore.getState().removeProject(focusedMember.id);
    setLeftSidebarOverlay(false);
    if (next.defaultLastPath) {
      await useDocumentStore.getState().focusProject(next.defaultLastPath);
    }
  };

  return (
    <>
      <AppMenu>
        <AppMenuTrigger asChild>
          <button type="button" className={className}>
            {projectRoot ? (
              <ProjectIconBadge
                icon={currentIcon}
                name={projectName}
                projectPath={projectRoot}
                className="size-5 text-[length:var(--font-size-12)]"
              />
            ) : (
              <FolderOpenIcon className="size-3.5 shrink-0 text-muted-foreground" />
            )}
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
                leading={
                  <ProjectIconBadge
                    icon={recentIcons[p.path]}
                    name={p.name}
                    projectPath={p.path}
                    className="size-5 text-[length:var(--font-size-12)]"
                  />
                }
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
              {t("nav.project.noRecent")}
            </div>
          )}
          <AppMenuSeparator />
          <AppMenuItem
            className={sidebarItemClass}
            onClick={() => newProjectTriggerRef.current?.click()}
          >
            {t("nav.project.newProject")}
          </AppMenuItem>
          <AppMenuItem className={sidebarItemClass} onClick={handleOpenProjectDialog}>
            {t("nav.project.openProject")}
          </AppMenuItem>
          {onDefaultProject ? null : (
            <>
              <AppMenuSeparator />
              <AppMenuItem className={sidebarItemClass} onClick={handleCloseProject}>
                {t("nav.project.closeProject")}
              </AppMenuItem>
              {focusedMember ? (
                <AppMenuItem className={sidebarItemClass} onClick={() => void handleRemoveFromWorkbench()}>
                  {t("nav.project.removeFromWorkbench")}
                </AppMenuItem>
              ) : null}
            </>
          )}
        </AppMenuContent>
      </AppMenu>

      <NewProjectDialog>
        <button ref={newProjectTriggerRef} className="hidden" />
      </NewProjectDialog>
    </>
  );
}
