import { useTranslation } from "react-i18next";
import { useDocumentStore } from "@/stores/document-store";
import { FolderOpenIcon } from "lucide-react";
import {
  SidebarHeader,
  SidebarContent,
} from "@/components/ui/sidebar";

export function DashboardSidebar() {
  const { t } = useTranslation();
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const projectName = projectRoot?.split(/[/\\]/).pop() ?? "Project";

  return (
    <>
      <SidebarHeader className="flex h-8 shrink-0 items-center px-3">
        <span className="text-[length:var(--font-size-12)] font-medium text-muted-foreground truncate">
          {projectName}
        </span>
      </SidebarHeader>
      <SidebarContent className="overflow-auto">
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-12 text-center">
          <FolderOpenIcon className="size-8 text-muted-foreground/40" />
          <p className="text-[length:var(--font-empty-state)] text-muted-foreground">
            {t("shell.rightArea.openFileOrWorkspace")}
          </p>
          <p className="text-[length:var(--font-hint)] text-muted-foreground/60">
            {t("shell.rightArea.openFileOrWorkspaceHint")}
          </p>
        </div>
      </SidebarContent>
    </>
  );
}
