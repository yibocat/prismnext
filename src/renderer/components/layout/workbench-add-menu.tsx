import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { useLayoutStore } from "@/stores/layout-store";
import { useDocumentStore } from "@/stores/document-store";
import { useProjectStore } from "@/stores/project-store";
import { useProjectOpen } from "@/hooks/use-project-open";
import {
  AppMenu,
  AppMenuContent,
  AppMenuItem,
  AppMenuTrigger,
} from "@/components/ui/app-menu";
import { NewProjectDialog } from "@/components/modules/project/new-project-dialog";
import { Hint } from "@/components/ui/hint";
import { FolderPlus } from "lucide-react";

const sidebarItemClass =
  "focus:bg-sidebar-accent focus:text-sidebar-accent-foreground";

/** Header “+” — join a folder to the workbench. Not a current-project switcher. */
export function WorkbenchAddMenu() {
  const { t } = useTranslation();
  const openProject = useDocumentStore((s) => s.openProject);
  const addRecentProject = useProjectStore((s) => s.addRecentProject);
  const setLeftSidebarOverlay = useLayoutStore((s) => s.setLeftSidebarOverlay);
  const projectOpen = useProjectOpen();
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

  return (
    <>
      <AppMenu>
        <Hint label={t("nav.workbench.addProject")}>
          <AppMenuTrigger asChild>
            <button
              type="button"
              className="flex size-4 items-center justify-center rounded text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            >
              <FolderPlus className="size-3" />
            </button>
          </AppMenuTrigger>
        </Hint>
        <AppMenuContent align="end" className="min-w-[10rem]">
          <AppMenuItem
            className={sidebarItemClass}
            onClick={() => newProjectTriggerRef.current?.click()}
          >
            {t("nav.project.newProject")}
          </AppMenuItem>
          <AppMenuItem className={sidebarItemClass} onClick={() => void handleOpenProjectDialog()}>
            {t("nav.project.openProject")}
          </AppMenuItem>
        </AppMenuContent>
      </AppMenu>
      <NewProjectDialog>
        <button ref={newProjectTriggerRef} type="button" className="hidden" />
      </NewProjectDialog>
    </>
  );
}
