import { useMemo, useRef, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { i18n } from "@/lib/i18n";
import {
  JOINABLE_RECENT_PREVIEW_COUNT,
  filterRecentWorkbenchProjects,
  openRecentFromAddPanel,
  openRemoteWorkbenchProject,
  pickAndJoinWorkbenchFolder,
  visibleJoinableRecentProjects,
} from "@/lib/workspace/project-lifecycle";
import type { RemoteHostNextAction } from "@/lib/remote/host-projects";
import { useProjectStore } from "@/stores/project-store";
import { defaultProjectAsMember, useWorkbenchStore } from "@/stores/workbench-store";
import { useRemoteStore } from "@/stores/remote-store";
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
import { RemoteConnectDialog } from "@/components/modules/remote/remote-connect-dialog";
import { RemoteFolderDialog } from "@/components/modules/remote/remote-folder-dialog";
import { RemoteHostsMenuSection } from "@/components/modules/remote/remote-hosts-menu";
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

async function openRemoteAndToast(alias: string, remoteRoot: string): Promise<void> {
  await openRemoteWorkbenchProject(alias, remoteRoot);
  const name = remoteRoot.split("/").filter(Boolean).at(-1) || remoteRoot;
  toast.success(i18n.t("remote.openedProject", { name }));
}

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
  const [connect, setConnect] = useState<{ alias: string; next: RemoteHostNextAction } | null>(null);
  const connectRef = useRef(connect);
  connectRef.current = connect;
  const [folder, setFolder] = useState<{ alias: string } | null>(null);
  const [remoteNew, setRemoteNew] = useState<{ profileId: string } | null>(null);

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

  const requestRemote = (alias: string, next: RemoteHostNextAction) => {
    setOpen(false);
    const ready = useRemoteStore.getState().byProfileId[alias]?.phase === "ready";
    if (ready && next.type === "open-path") {
      void openRemoteAndToast(alias, next.remoteRoot).catch((err) => {
        toast.error(err instanceof Error ? err.message : t("remote.phase.error"));
      });
      return;
    }
    if (ready && next.type === "open-folder") {
      setFolder({ alias });
      return;
    }
    if (ready && next.type === "create") {
      setRemoteNew({ profileId: alias });
      return;
    }
    if (ready && next.type === "idle") return;
    setConnect({ alias, next });
  };

  const afterConnectReady = () => {
    const pending = connectRef.current;
    setConnect(null);
    if (!pending) return;
    if (pending.next.type === "open-path") {
      void openRemoteAndToast(pending.alias, pending.next.remoteRoot).catch((err) => {
        toast.error(err instanceof Error ? err.message : t("remote.phase.error"));
      });
      return;
    }
    if (pending.next.type === "open-folder") {
      setFolder({ alias: pending.alias });
      return;
    }
    if (pending.next.type === "create") {
      setRemoteNew({ profileId: pending.alias });
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
            <RemoteHostsMenuSection query={query} visible={open} onRequest={requestRemote} />
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
      {remoteNew ? (
        <NewProjectDialog
          open
          locationSeed={{ kind: "remote", profileId: remoteNew.profileId }}
          onOpenChange={(next) => {
            if (!next) setRemoteNew(null);
          }}
          onCreated={(path) => {
            setRemoteNew(null);
            onProjectCreated?.(path);
            const name = path.split("/").filter(Boolean).at(-1) || path;
            toast.success(i18n.t("remote.createdProject", { name }));
          }}
        />
      ) : null}
      <RemoteConnectDialog
        alias={connect?.alias ?? null}
        open={Boolean(connect)}
        onOpenChange={(next) => {
          if (!next) setConnect(null);
        }}
        onReady={afterConnectReady}
      />
      <RemoteFolderDialog
        alias={folder?.alias ?? null}
        mode="open"
        open={Boolean(folder)}
        onOpenChange={(next) => {
          if (!next) setFolder(null);
        }}
        onConfirm={async (remoteRoot) => {
          if (!folder) return;
          await openRemoteAndToast(folder.alias, remoteRoot);
        }}
      />
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
