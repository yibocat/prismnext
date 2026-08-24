import { useMemo, useRef, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  JOINABLE_RECENT_PREVIEW_COUNT,
  filterRecentWorkbenchProjects,
  openRecentFromAddPanel,
  pickAndJoinWorkbenchFolder,
  visibleJoinableRecentProjects,
} from "@/lib/workspace/project-lifecycle";
import { useProjectStore } from "@/stores/project-store";
import { defaultProjectAsMember, useWorkbenchStore } from "@/stores/workbench-store";
import {
  AppMenu,
  AppMenuContent,
  AppMenuItem,
  AppMenuLabel,
  AppMenuTrigger,
  appMenuInputClass,
} from "@/components/ui/app-menu";
import {
  LEFT_SIDEBAR_SECTION_ACTION,
  LEFT_SIDEBAR_SECTION_ACTION_ICON,
} from "@/components/layout/left-nav-button";
import { NewProjectDialog } from "@/components/modules/project/new-project-dialog";
import { Hint } from "@/components/ui/hint";
import { FolderIcon, FolderOpen, FolderPlus } from "lucide-react";

const sidebarItemClass =
  "focus:bg-sidebar-accent focus:text-sidebar-accent-foreground";

const recentRowClass = cn(
  sidebarItemClass,
  "h-auto min-h-0 items-start py-1.5",
);

const pickerPanelClass = cn(
  "flex min-h-0 min-w-[12rem] w-max flex-col gap-0 overflow-hidden p-0",
  "max-w-[min(22rem,var(--radix-dropdown-menu-content-available-width))]",
  "max-h-[min(24rem,var(--radix-dropdown-menu-content-available-height))]",
);

export function WorkbenchProjectPicker({
  children,
  hintLabel,
  disabled,
  onPickPath,
  onOpenFolder,
  onProjectCreated,
}: {
  children: ReactElement;
  hintLabel: string;
  disabled?: boolean;
  onPickPath: (path: string) => void;
  onOpenFolder: () => void;
  onProjectCreated?: (path: string) => void;
}) {
  const { t } = useTranslation();
  const newProjectTriggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);

  const recentProjects = useProjectStore((s) => s.recentProjects);
  const members = useWorkbenchStore((s) => s.members);
  const defaultMember = useWorkbenchStore((s) => defaultProjectAsMember(s));
  const memberPaths = useMemo(() => members.map((member) => member.lastPath), [members]);

  const filtered = useMemo(
    () => filterRecentWorkbenchProjects(
      recentProjects,
      memberPaths,
      query,
      defaultMember
        ? { path: defaultMember.lastPath, name: defaultMember.displayName }
        : null,
    ),
    [recentProjects, memberPaths, query, defaultMember],
  );
  const searching = query.trim().length > 0;
  const { items, remaining } = visibleJoinableRecentProjects(filtered, {
    expanded: expanded || searching,
    previewCount: JOINABLE_RECENT_PREVIEW_COUNT,
  });

  const handleOpenChange = (next: boolean) => {
    if (disabled && next) return;
    setOpen(next);
    if (!next) {
      setQuery("");
      setExpanded(false);
    }
  };

  return (
    <>
      <AppMenu open={open} onOpenChange={handleOpenChange}>
        <Hint label={hintLabel}>
          <AppMenuTrigger asChild disabled={disabled}>
            {children}
          </AppMenuTrigger>
        </Hint>
        <AppMenuContent
          side="bottom"
          align="start"
          collisionPadding={16}
          className={pickerPanelClass}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            requestAnimationFrame(() => searchRef.current?.focus());
          }}
        >
          <div className="shrink-0 border-b border-border px-2 pt-1.5 pb-1.5">
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("nav.workbench.searchProjects")}
              aria-label={t("nav.workbench.searchProjects")}
              className={cn(
                appMenuInputClass,
                "h-6 w-full min-w-0 px-0.5",
                "placeholder:text-muted-foreground/40",
                "caret-foreground",
              )}
              onKeyDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-0.5 pb-0.5">
            <AppMenuLabel className="normal-case tracking-normal">
              {t("nav.workbench.recents")}
            </AppMenuLabel>
            {items.length === 0 ? (
              <p className="px-2 py-1.5 text-muted-foreground">
                {t("nav.project.noRecent")}
              </p>
            ) : (
              items.map((item) => (
                <AppMenuItem
                  key={item.path}
                  className={cn(
                    recentRowClass,
                    item.onWorkbench && "text-muted-foreground",
                  )}
                  leading={
                    <FolderIcon
                      className={cn(
                        "mt-0.5 size-3.5 shrink-0",
                        item.onWorkbench ? "opacity-40" : "opacity-70",
                      )}
                    />
                  }
                  description={item.path}
                  title={item.path}
                  titleAddon={
                    item.isDefault ? (
                      <span className="text-[length:var(--font-badge)] text-muted-foreground">
                        {t("nav.workbench.defaultBadge")}
                      </span>
                    ) : null
                  }
                  onClick={() => onPickPath(item.path)}
                >
                  {item.name}
                </AppMenuItem>
              ))
            )}
            {remaining > 0 ? (
              <AppMenuItem
                className={cn(sidebarItemClass, "text-muted-foreground")}
                onSelect={(event) => {
                  event.preventDefault();
                  setExpanded(true);
                }}
              >
                {t("nav.workbench.more")}
              </AppMenuItem>
            ) : null}
          </div>
          <div className="shrink-0 bg-popover px-0.5 pt-0.5 pb-0.5">
            <AppMenuItem
              className={sidebarItemClass}
              leading={<FolderOpen className="size-3.5 shrink-0 opacity-70" />}
              onClick={onOpenFolder}
            >
              {t("nav.workbench.openFolder")}
            </AppMenuItem>
            <AppMenuItem
              className={sidebarItemClass}
              leading={<FolderPlus className="size-3.5 shrink-0 opacity-70" />}
              onClick={() => newProjectTriggerRef.current?.click()}
            >
              {t("nav.project.newProject")}
            </AppMenuItem>
          </div>
        </AppMenuContent>
      </AppMenu>
      <NewProjectDialog onCreated={onProjectCreated}>
        <button ref={newProjectTriggerRef} type="button" className="hidden" />
      </NewProjectDialog>
    </>
  );
}

/** Header “+” — join a folder to the workbench. Not a current-project switcher. */
export function WorkbenchAddMenu() {
  const { t } = useTranslation();

  return (
    <WorkbenchProjectPicker
      hintLabel={t("nav.workbench.addProject")}
      onPickPath={(path) => void openRecentFromAddPanel(path)}
      onOpenFolder={() => void pickAndJoinWorkbenchFolder()}
    >
      <button
        type="button"
        className={LEFT_SIDEBAR_SECTION_ACTION}
      >
        <FolderPlus className={LEFT_SIDEBAR_SECTION_ACTION_ICON} />
      </button>
    </WorkbenchProjectPicker>
  );
}
