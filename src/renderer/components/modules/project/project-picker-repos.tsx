import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { FolderIcon, FolderOpen, LaptopIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RemoteHostNextAction } from "@/lib/remote/host-projects";
import { listLocalRepoEntries } from "@/lib/workspace/unified-project-picker";
import { RemoteHostsMenuSection } from "@/components/modules/remote/remote-hosts-menu";
import {
  AppMenuCheckItem,
  AppMenuItem,
  AppMenuSub,
  AppMenuSubContent,
  AppMenuSubTrigger,
} from "@/components/ui/app-menu";
import { sameProjectPath, useWorkbenchStore } from "@/stores/workbench-store";

const sidebarItemClass =
  "focus:bg-sidebar-accent focus:text-sidebar-accent-foreground";

const hostSubmenuClass = cn(
  "flex min-h-0 min-w-[22rem] w-max flex-col gap-0 overflow-hidden p-0",
  "max-w-[min(36rem,var(--radix-dropdown-menu-content-available-width))]",
  "max-h-[min(24rem,var(--radix-dropdown-menu-content-available-height))]",
);

export function ProjectPickerReposSection({
  query,
  visible,
  selectedPath,
  onPickPath,
  onOpenLocalFolder,
  onRequest,
}: {
  query: string;
  visible: boolean;
  selectedPath?: string | null;
  onPickPath: (path: string) => void;
  onOpenLocalFolder: () => void;
  onRequest: (alias: string, next: RemoteHostNextAction) => void;
}) {
  const { t } = useTranslation();
  const members = useWorkbenchStore((s) => s.members);
  const localEntries = useMemo(
    () => listLocalRepoEntries(members, query),
    [members, query],
  );

  return (
    <>
      <AppMenuSub>
        <AppMenuSubTrigger
          className={sidebarItemClass}
          leading={<LaptopIcon className="size-3.5 shrink-0 opacity-70" />}
        >
          {t("nav.workbench.localRepos")}
        </AppMenuSubTrigger>
        <AppMenuSubContent className={hostSubmenuClass}>
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-0.5">
            {localEntries.length === 0 ? (
              <p className="px-2 py-1.5 text-muted-foreground">
                {t("nav.project.noRecent")}
              </p>
            ) : (
              localEntries.map((item) => {
                const selected = Boolean(selectedPath && sameProjectPath(item.path, selectedPath));
                return (
                  <AppMenuCheckItem
                    key={item.path}
                    className={sidebarItemClass}
                    selected={selected}
                    leading={<FolderIcon className="size-3.5 shrink-0 opacity-70" />}
                    title={item.path}
                    onClick={() => onPickPath(item.path)}
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
                      <span className="min-w-0 shrink truncate">{item.name}</span>
                      <span
                        className="min-w-0 truncate text-muted-foreground"
                        title={item.description}
                      >
                        {item.description}
                      </span>
                    </span>
                  </AppMenuCheckItem>
                );
              })
            )}
          </div>
          <div className="shrink-0 bg-popover px-0.5 pt-0.5 pb-0.5">
            <AppMenuItem
              className={sidebarItemClass}
              leading={<FolderOpen className="size-3.5 shrink-0 opacity-70" />}
              onClick={onOpenLocalFolder}
            >
              {t("nav.workbench.openFolder")}
            </AppMenuItem>
          </div>
        </AppMenuSubContent>
      </AppMenuSub>
      <RemoteHostsMenuSection
        query={query}
        visible={visible}
        selectedPath={selectedPath}
        onRequest={onRequest}
        showHeading={false}
      />
    </>
  );
}
